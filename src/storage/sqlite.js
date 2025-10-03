import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

import Database from "better-sqlite3";

import { StructuredLogger } from "../logger.js";

const PROJECT_STATUSES = new Set(["proposed", "active", "complete"]);
const TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','complete')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done')),
        assignees TEXT NOT NULL DEFAULT '[]',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)`
    ]
  }
];

function ensureDirectoryExists(filePath) {
  const directory = dirname(filePath);
  if (!directory || directory === ".") {
    return;
  }
  mkdirSync(directory, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function serializeAssignees(assignees = []) {
  if (!Array.isArray(assignees)) {
    throw new Error("assignees must be an array");
  }
  return JSON.stringify(assignees);
}

function deserializeAssignees(payload) {
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeStatus(status, allowed) {
  if (typeof status !== "string") {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : null;
}

export class SQLiteStorage {
  constructor({ filePath, logger, name = "sqlite-storage" } = {}) {
    if (!filePath) {
      throw new Error("filePath is required to initialize SQLiteStorage");
    }

    const resolvedPath = resolve(process.cwd(), filePath);
    ensureDirectoryExists(resolvedPath);

    this.filePath = resolvedPath;
    this.logger = logger ??
      new StructuredLogger({
        baseContext: { filename: "storage/sqlite.js", classname: "SQLiteStorage" }
      });
    this.name = name;

    this.#db = new Database(this.filePath);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");

    this.#log("INFO", {
      functionName: "constructor",
      message: `Opening SQLite database at ${this.filePath}`
    });

    this.#runMigrations();
    this.#prepareStatements();
  }

  close() {
    this.#log("INFO", {
      functionName: "close",
      message: `Closing SQLite database at ${this.filePath}`
    });
    this.#db.close();
  }

  get database() {
    return this.#db;
  }

  createProject({ id = randomUUID(), name, description = "", status = "proposed" } = {}) {
    if (!name) {
      throw new Error("Project name is required");
    }

    const normalizedStatus = normalizeStatus(status, PROJECT_STATUSES) ?? "proposed";
    const timestamp = now();

    const payload = {
      id,
      name,
      description,
      status: normalizedStatus,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const insert = this.#statements.insertProject;
    insert.run(payload);

    this.#log("INFO", {
      functionName: "createProject",
      message: `Created project ${id}`,
      systemSection: "projects"
    });

    return payload;
  }

  listProjects() {
    const rows = this.#statements.listProjects.all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getProjectById(id) {
    const row = this.#statements.getProjectById.get(id);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateProject({ id, name, description, status }) {
    if (!id) {
      throw new Error("Project id is required");
    }

    const existing = this.getProjectById(id);
    if (!existing) {
      throw new Error(`Project ${id} does not exist`);
    }

    const updated = {
      name: name ?? existing.name,
      description: description ?? existing.description,
      status: normalizeStatus(status ?? existing.status, PROJECT_STATUSES) ?? existing.status,
      updatedAt: now(),
      id
    };

    this.#statements.updateProject.run(updated);

    this.#log("INFO", {
      functionName: "updateProject",
      message: `Updated project ${id}`,
      systemSection: "projects"
    });

    return this.getProjectById(id);
  }

  createTask({
    id = randomUUID(),
    projectId,
    title,
    status = "todo",
    assignees = [],
    notes = ""
  } = {}) {
    if (!projectId) {
      throw new Error("projectId is required");
    }
    if (!title) {
      throw new Error("Task title is required");
    }

    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} does not exist`);
    }

    const normalizedStatus = normalizeStatus(status, TASK_STATUSES) ?? "todo";
    const timestamp = now();

    const payload = {
      id,
      projectId,
      title,
      status: normalizedStatus,
      assignees: serializeAssignees(assignees),
      notes,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.#statements.insertTask.run(payload);

    this.#log("INFO", {
      functionName: "createTask",
      message: `Created task ${id} for project ${projectId}`,
      systemSection: "tasks"
    });

    return this.getTaskById(id);
  }

  getTaskById(id) {
    const row = this.#statements.getTaskById.get(id);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      assignees: deserializeAssignees(row.assignees),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listTasksByProject(projectId) {
    const rows = this.#statements.listTasksByProject.all(projectId);
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      assignees: deserializeAssignees(row.assignees),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  updateTask({ id, title, status, assignees, notes }) {
    if (!id) {
      throw new Error("Task id is required");
    }

    const existing = this.getTaskById(id);
    if (!existing) {
      throw new Error(`Task ${id} does not exist`);
    }

    const payload = {
      title: title ?? existing.title,
      status: normalizeStatus(status ?? existing.status, TASK_STATUSES) ?? existing.status,
      assignees: serializeAssignees(assignees ?? existing.assignees),
      notes: notes ?? existing.notes,
      updatedAt: now(),
      id
    };

    this.#statements.updateTask.run(payload);

    this.#log("INFO", {
      functionName: "updateTask",
      message: `Updated task ${id}`,
      systemSection: "tasks"
    });

    return this.getTaskById(id);
  }

  deleteTask(id) {
    if (!id) {
      throw new Error("Task id is required");
    }

    const result = this.#statements.deleteTask.run(id);
    if (!result || result.changes === 0) {
      throw new Error(`Task ${id} does not exist`);
    }

    this.#log("INFO", {
      functionName: "deleteTask",
      message: `Deleted task ${id}`,
      systemSection: "tasks",
      dbPhase: "post"
    });
  }

  #prepareStatements() {
    this.#statements = {
      insertProject: this.#db.prepare(`
        INSERT INTO projects (id, name, description, status, created_at, updated_at)
        VALUES (@id, @name, @description, @status, @createdAt, @updatedAt)
      `),
      listProjects: this.#db.prepare(`
        SELECT id, name, description, status, created_at, updated_at
        FROM projects
        ORDER BY created_at DESC
      `),
      getProjectById: this.#db.prepare(`
        SELECT id, name, description, status, created_at, updated_at
        FROM projects
        WHERE id = ?
      `),
      updateProject: this.#db.prepare(`
        UPDATE projects
        SET name = @name,
            description = @description,
            status = @status,
            updated_at = @updatedAt
        WHERE id = @id
      `),
      insertTask: this.#db.prepare(`
        INSERT INTO tasks (id, project_id, title, status, assignees, notes, created_at, updated_at)
        VALUES (@id, @projectId, @title, @status, @assignees, @notes, @createdAt, @updatedAt)
      `),
      getTaskById: this.#db.prepare(`
        SELECT id, project_id, title, status, assignees, notes, created_at, updated_at
        FROM tasks
        WHERE id = ?
      `),
      listTasksByProject: this.#db.prepare(`
        SELECT id, project_id, title, status, assignees, notes, created_at, updated_at
        FROM tasks
        WHERE project_id = ?
        ORDER BY created_at DESC
      `),
      updateTask: this.#db.prepare(`
        UPDATE tasks
        SET title = @title,
            status = @status,
            assignees = @assignees,
            notes = @notes,
            updated_at = @updatedAt
        WHERE id = @id
      `),
      deleteTask: this.#db.prepare(`
        DELETE FROM tasks WHERE id = ?
      `)
    };
  }

  #runMigrations() {
    this.#db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);

    const appliedRows = this.#db
      .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
      .all();
    const applied = new Set(appliedRows.map((row) => row.version));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      this.#log("INFO", {
        functionName: "#runMigrations",
        message: `Applying migration ${migration.version}`,
        systemSection: "migrations",
        dbPhase: "pre"
      });

      const applyMigration = this.#db.transaction(() => {
        for (const statement of migration.statements) {
          this.#db.prepare(statement).run();
        }
        this.#db
          .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(migration.version, now());
      });

      applyMigration();

      this.#log("INFO", {
        functionName: "#runMigrations",
        message: `Migration ${migration.version} applied`,
        systemSection: "migrations",
        dbPhase: "post"
      });
    }
  }

  #log(level, context) {
    if (!this.logger || typeof this.logger[level.toLowerCase()] !== "function") {
      return;
    }

    const base = {
      filename: "storage/sqlite.js",
      classname: "SQLiteStorage",
      method: "NONE"
    };
    this.logger[level.toLowerCase()]({ ...base, ...context });
  }

  #db;
  #statements;
}

export function createSQLiteStorage(options = {}) {
  return new SQLiteStorage(options);
}
