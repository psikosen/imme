import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import { SQLiteStorage } from "../src/storage/sqlite.js";

function withStorage(callback) {
  const cwd = mkdtempSync(join(tmpdir(), "imme-sqlite-"));
  const dbPath = join(cwd, "workspace", "imme.db");
  const storage = new SQLiteStorage({ filePath: dbPath });

  try {
    callback(storage, dbPath);
  } finally {
    storage.close();
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("SQLiteStorage persists projects and tasks", () => {
  withStorage((storage, dbPath) => {
    assert.ok(dbPath.endsWith("imme.db"));
    const project = storage.createProject({ name: "CLI Rollout" });
    assert.equal(project.name, "CLI Rollout");
    assert.equal(project.status, "proposed");

    const fetched = storage.getProjectById(project.id);
    assert.equal(fetched?.id, project.id);

    storage.updateProject({ id: project.id, status: "active" });
    const updated = storage.getProjectById(project.id);
    assert.equal(updated?.status, "active");

    const task = storage.createTask({
      projectId: project.id,
      title: "Ship CLI",
      assignees: ["dev"],
      notes: "Focus on config UX"
    });

    assert.equal(task.projectId, project.id);
    assert.deepEqual(task.assignees, ["dev"]);

    storage.updateTask({ id: task.id, status: "in_progress" });
    const refreshedTask = storage.getTaskById(task.id);
    assert.equal(refreshedTask?.status, "in_progress");

    const tasks = storage.listTasksByProject(project.id);
    assert.equal(tasks.length, 1);
  });
});
