import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

import {
  StructuredLogger,
  createPersistentFileWriter,
  loadWorkspaceSummary
} from "../index.js";
import { SQLiteStorage } from "../storage/sqlite.js";

const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const PUBLIC_DIR = resolve(process.cwd(), "src", "web", "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function createLogger() {
  let persistentWriter;
  try {
    persistentWriter = createPersistentFileWriter({
      filePath: resolve(process.cwd(), ".imme", "web.log.jsonl")
    });
  } catch (error) {
    console.error("Failed to create web server log file:", error.message);
  }

  return new StructuredLogger({
    persistentWriter: persistentWriter ?? console,
    ephemeralWriter: console,
    baseContext: {
      filename: "web/server.js",
      classname: "WebServer"
    }
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function safeJoinPublic(pathname) {
  const normalized = normalize(pathname)
    .replace(/^(\.{2}[/\\])+/, "")
    .replace(/^\.\/+/, "");
  return join(PUBLIC_DIR, normalized);
}

export function start({ port = DEFAULT_PORT } = {}) {
  const logger = createLogger();
  const { workspace } = loadWorkspaceSummary();
  const storage = new SQLiteStorage({ filePath: workspace.databasePath, logger });

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const { pathname } = requestUrl;

    logger.info({
      functionName: "request",
      method: req.method ?? "NONE",
      message: `${req.method ?? "GET"} ${pathname}`,
      systemSection: pathname.startsWith("/api/") ? "api" : "static"
    });

    try {
      if (pathname === "/api/workspace") {
        await handleWorkspaceApi({ res });
        return;
      }

      if (pathname.startsWith("/api/projects")) {
        await handleProjectsApi({ req, res, pathname, storage });
        return;
      }

      await handleStatic({ pathname, res });
    } catch (error) {
      logger.error({
        functionName: "request",
        message: error.message,
        error,
        systemSection: "api",
        dbPhase: "none"
      });
      sendJson(res, 500, { error: "Internal Server Error" });
    }
  });

  server.listen(port, () => {
    logger.info({
      functionName: "listen",
      message: `Web server listening on http://localhost:${port}`,
      systemSection: "startup"
    });
  });

  const shutdown = () => {
    logger.info({
      functionName: "shutdown",
      message: "Shutting down web server",
      systemSection: "shutdown"
    });
    server.close();
    storage.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { server, storage, logger };
}

async function handleProjectsApi({ req, res, pathname, storage }) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    const projects = storage.listProjects();
    sendJson(res, 200, { projects });
    return;
  }

  if (segments.length === 4 && segments[2] === "tasks") {
    const projectId = segments[1];
    const tasks = storage.listTasksByProject(projectId);
    sendJson(res, 200, { tasks });
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

async function handleWorkspaceApi({ res }) {
  const { workspace } = loadWorkspaceSummary();
  sendJson(res, 200, { workspace });
}

async function handleStatic({ pathname, res }) {
  let target = pathname;
  if (target === "/") {
    target = "/index.html";
  }

  const filePath = safeJoinPublic(target);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension] ?? "application/octet-stream";
  const contents = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeType);
  res.end(contents);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
