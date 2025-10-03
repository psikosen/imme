/* global fetch */

import process from "node:process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";

import { start } from "../src/web/server.js";

function createWorkspaceContext(tempDir) {
  const databasePath = join(tempDir, "workspace.db");
  return {
    workspace: {
      name: "Test Workspace",
      environment: "test",
      logPath: join(tempDir, "logs.jsonl"),
      databasePath,
      database: {
        client: "sqlite",
        options: { filename: databasePath }
      },
      lastUpdated: new Date().toISOString()
    }
  };
}

function createLoggerStub() {
  return {
    info() {},
    error() {},
    debug() {},
    warn() {}
  };
}

test("web API allows creating and updating projects", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "imme-web-"));
  const workspaceSummary = createWorkspaceContext(tempDir);
  const logger = createLoggerStub();

  const context = start({
    port: 0,
    workspaceResolver: () => workspaceSummary,
    loggerFactory: () => logger,
    publicDir: resolve(process.cwd(), "src", "web", "public")
  });

  try {
    await once(context.server, "listening");
    const address = context.server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const listResponse = await fetch(`${baseUrl}/api/projects`);
    assert.equal(listResponse.status, 200);
    const initial = await listResponse.json();
    assert.deepEqual(initial.projects, []);

    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Launch", description: "Kickoff", status: "active" })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.ok(created.project.id);
    assert.equal(created.project.status, "active");

    const updateResponse = await fetch(`${baseUrl}/api/projects/${created.project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "complete" })
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.project.status, "complete");

    const tasksResponse = await fetch(`${baseUrl}/api/projects/${created.project.id}/tasks`);
    assert.equal(tasksResponse.status, 200);
    const tasks = await tasksResponse.json();
    assert.deepEqual(tasks.tasks, []);
  } finally {
    context.server.close();
    context.storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
