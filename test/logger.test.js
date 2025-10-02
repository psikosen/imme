import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLogEntry,
  StructuredLogger,
  createPersistentFileWriter
} from "../src/index.js";

test("createLogEntry provides defaults and canonical derived line", () => {
  const { entry, derivedLine } = createLogEntry({
    filename: "service.js",
    message: "Boot sequence"
  });

  assert.equal(entry.filename, "service.js");
  assert.equal(entry.method, "NONE");
  assert.equal(entry.db_phase, "none");
  assert.equal(entry.level, "INFO");
  assert.match(entry.timestamp, /T/);
  assert.equal(derivedLine, "[Continuous skepticism (Sherlock Protocol)] Boot sequence");
});

test("createLogEntry normalizes input values", () => {
  const { entry } = createLogEntry({
    filename: "api.js",
    message: "Handling request",
    method: "post",
    dbPhase: "PRE",
    lineNum: "24"
  });

  assert.equal(entry.method, "POST");
  assert.equal(entry.db_phase, "pre");
  assert.equal(entry.line_num, 24);
});

test("createLogEntry serializes errors consistently", () => {
  const error = new Error("Boom");
  const { entry } = createLogEntry({
    filename: "worker.js",
    message: "Failure",
    error
  });

  assert.equal(entry.error.name, "Error");
  assert.equal(entry.error.message, "Boom");
  assert.ok(entry.error.stack.includes("Error: Boom"));
});

test("StructuredLogger writes to persistent and ephemeral outputs", () => {
  const persistent = [];
  const ephemeral = [];
  const logger = new StructuredLogger({
    persistentWriter: { log: (value) => persistent.push(value) },
    ephemeralWriter: { log: (value) => ephemeral.push(value) },
    baseContext: { filename: "module.js", systemSection: "startup" }
  });

  const entry = logger.info({ message: "Starting up", functionName: "main" });

  assert.equal(persistent.length, 1);
  assert.equal(ephemeral.length, 1);

  const persisted = JSON.parse(persistent[0]);
  assert.equal(persisted.filename, "module.js");
  assert.equal(persisted.system_section, "startup");
  assert.equal(persisted.function, "main");
  assert.equal(persisted.message, "Starting up");
  assert.equal(entry.message, "Starting up");
  assert.equal(ephemeral[0], "[Continuous skepticism (Sherlock Protocol)] Starting up");
});

test("StructuredLogger.error accepts Error instances directly", () => {
  const persistent = [];
  const ephemeral = [];
  const logger = new StructuredLogger({
    persistentWriter: { log: (value) => persistent.push(value) },
    ephemeralWriter: { log: (value) => ephemeral.push(value) },
    baseContext: { filename: "module.js" }
  });

  const error = new Error("Database offline");
  const entry = logger.error({ message: "Operation failed", error });

  assert.equal(entry.level, "ERROR");
  assert.equal(entry.error.message, "Database offline");
  assert.equal(entry.method, "NONE");
  assert.equal(entry.db_phase, "none");
  assert.equal(persistent.length, 1);
  assert.equal(ephemeral.length, 1);
});

test("createPersistentFileWriter writes logs to disk", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "imme-"));
  const filePath = join(tempDir, "logs", "app.jsonl");
  const persistentWriter = createPersistentFileWriter({ filePath });
  const logger = new StructuredLogger({
    persistentWriter,
    ephemeralWriter: { log() {} },
    baseContext: { filename: "disk-writer.js", systemSection: "persistence" }
  });

  logger.info({ message: "Disk write", method: "POST" });

  const contents = readFileSync(filePath, "utf8").trim().split("\n");
  assert.equal(contents.length, 1);

  const record = JSON.parse(contents[0]);
  assert.equal(record.message, "Disk write");
  assert.equal(record.filename, "disk-writer.js");
  assert.equal(record.system_section, "persistence");
  assert.equal(record.method, "POST");
});
