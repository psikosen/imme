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
const MAX_JSON_BODY_SIZE = 1_048_576; // 1 MiB

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

function safeJoinPublic(publicDir, pathname) {
  const normalized = normalize(pathname)
    .replace(/^(\.{2}[/\\])+/, "")
    .replace(/^\.\/+/, "");
  return join(publicDir, normalized);
}

async function readJsonBody(req) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > MAX_JSON_BODY_SIZE) {
      throw new Error("Payload too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON payload: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON body must be an object");
  }

  return parsed;
}

function normalizeTaskTitle(value) {
  if (typeof value !== "string") {
    throw new Error("Task title is required");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Task title is required");
  }

  return trimmed;
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  return value;
}

function parseAssignees(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("assignees must be an array of strings");
  }

  const invalidEntry = value.find((entry) => typeof entry !== "string");
  if (invalidEntry !== undefined) {
    throw new Error("assignees must be an array of strings");
  }

  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export function start({
  port = DEFAULT_PORT,
  workspaceResolver = loadWorkspaceSummary,
  storageFactory,
  loggerFactory = createLogger,
  publicDir = PUBLIC_DIR
} = {}) {
  const logger = loggerFactory();
  const { workspace } = workspaceResolver();
  const storage =
    typeof storageFactory === "function"
      ? storageFactory({ workspace, logger })
      : new SQLiteStorage({ filePath: workspace.databasePath, logger });

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
        await handleWorkspaceApi({ res, workspaceResolver });
        return;
      }

      if (pathname.startsWith("/api/projects")) {
        await handleProjectsApi({ req, res, pathname, storage, logger });
        return;
      }

      if (pathname.startsWith("/api/tasks")) {
        await handleTasksApi({ req, res, pathname, storage, logger });
        return;
      }

      await handleStatic({ pathname, res, publicDir });
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

async function handleProjectsApi({ req, res, pathname, storage, logger }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    if (req.method === "GET") {
      const projects = storage.listProjects();
      sendJson(res, 200, { projects });
      return;
    }

    if (req.method === "POST") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      try {
        const project = storage.createProject({
          name: body.name,
          description: body.description,
          status: body.status
        });
        sendJson(res, 201, { project });
        return;
      } catch (error) {
        logger.error({
          functionName: "handleProjectsApi",
          message: error.message,
          error,
          systemSection: "api",
          method: "POST"
        });
        sendJson(res, 400, { error: error.message });
        return;
      }
    }
  }

  if (segments.length === 4 && segments[3] === "tasks") {
    const projectId = segments[2];
    if (req.method === "GET") {
      const tasks = storage.listTasksByProject(projectId);
      sendJson(res, 200, { tasks });
      return;
    }

    if (req.method === "POST") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      try {
        const title = normalizeTaskTitle(body.title);
        const status = typeof body.status === "string" ? body.status : undefined;
        const assignees = parseAssignees(body.assignees);
        const notes = normalizeOptionalString(body.notes, "notes");
        const task = storage.createTask({
          projectId,
          title,
          status,
          assignees: assignees ?? [],
          notes: notes ?? ""
        });
        sendJson(res, 201, { task });
        return;
      } catch (error) {
        logger.error({
          functionName: "handleProjectsApi",
          message: error.message,
          error,
          systemSection: "api",
          method: "POST"
        });
        sendJson(res, 400, { error: error.message });
        return;
      }
    }
  }

  if (segments.length === 3 && req.method === "PUT") {
    const projectId = segments[2];
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    try {
      const project = storage.updateProject({
        id: projectId,
        name: body.name,
        description: body.description,
        status: body.status
      });
      sendJson(res, 200, { project });
      return;
    } catch (error) {
      logger.error({
        functionName: "handleProjectsApi",
        message: error.message,
        error,
        systemSection: "api",
        method: "PUT"
      });
      if (/does not exist/i.test(error.message)) {
        sendJson(res, 404, { error: error.message });
      } else {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  sendJson(res, 404, { error: "Not Found" });
}

async function handleWorkspaceApi({ res, workspaceResolver }) {
  const { workspace } = workspaceResolver();
  sendJson(res, 200, { workspace });
}

async function handleTasksApi({ req, res, pathname, storage, logger }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 3 && req.method === "PUT") {
    const taskId = segments[2];
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    try {
      const payload = {};
      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        payload.title = normalizeTaskTitle(body.title);
      }
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        payload.status = typeof body.status === "string" ? body.status : undefined;
      }
      if (Object.prototype.hasOwnProperty.call(body, "assignees")) {
        payload.assignees = parseAssignees(body.assignees);
      }
      if (Object.prototype.hasOwnProperty.call(body, "notes")) {
        payload.notes = normalizeOptionalString(body.notes, "notes");
      }

      if (Object.keys(payload).length === 0) {
        throw new Error("No task fields provided for update");
      }

      const task = storage.updateTask({ id: taskId, ...payload });
      sendJson(res, 200, { task });
      return;
    } catch (error) {
      logger.error({
        functionName: "handleTasksApi",
        message: error.message,
        error,
        systemSection: "api",
        method: req.method ?? "NONE"
      });
      if (/does not exist/i.test(error.message)) {
        sendJson(res, 404, { error: error.message });
      } else {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  sendJson(res, 404, { error: "Not Found" });
}

async function handleStatic({ pathname, res, publicDir }) {
  let target = pathname;
  if (target === "/") {
    target = "/index.html";
  }

  const filePath = safeJoinPublic(publicDir, target);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
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
