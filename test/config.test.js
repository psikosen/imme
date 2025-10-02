import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG,
  ensureConfig,
  loadConfig,
  resolveConfigPath,
  updateConfigValue
} from "../src/index.js";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "imme-config-"));
}

test("ensureConfig creates a configuration file with defaults", () => {
  const cwd = createTempDir();

  try {
    const { filePath, created } = ensureConfig({ cwd });
    assert.equal(created, true);
    const contents = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(contents);
    assert.equal(parsed.workspace.name, DEFAULT_CONFIG.workspace.name);
    assert.equal(parsed.workspace.environment, DEFAULT_CONFIG.workspace.environment);
    assert.ok(parsed.workspace.lastUpdated);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ensureConfig respects overrides and force option", () => {
  const cwd = createTempDir();

  try {
    const first = ensureConfig({ cwd, overrides: { workspace: { name: "First" } } });
    assert.equal(first.created, true);

    const second = ensureConfig({ cwd });
    assert.equal(second.created, false);

    const third = ensureConfig({ cwd, force: true, overrides: { workspace: { environment: "production" } } });
    assert.equal(third.created, true);

    const config = loadConfig({ cwd });
    assert.equal(config.workspace.name, "First");
    assert.equal(config.workspace.environment, "production");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("updateConfigValue updates nested keys and maintains timestamp", () => {
  const cwd = createTempDir();

  try {
    ensureConfig({ cwd });
    const { filePath, config } = updateConfigValue({ cwd, keyPath: "workspace.region", value: "\"us-east\"" });
    const persisted = JSON.parse(readFileSync(filePath, "utf8"));

    assert.equal(config.workspace.region, "us-east");
    assert.equal(persisted.workspace.region, "us-east");
    assert.ok(persisted.workspace.lastUpdated);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loadConfig throws on invalid JSON", () => {
  const cwd = createTempDir();

  try {
    const filePath = resolveConfigPath({ cwd });
    ensureConfig({ cwd });
    writeFileSync(filePath, "not-json", "utf8");
    assert.throws(() => loadConfig({ cwd }), /Invalid configuration JSON/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
