import process from "node:process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  runConfigCommand
} from "../bin/imme.js";

function withTempCwd(callback) {
  const originalCwd = process.cwd();
  const cwd = mkdtempSync(join(tmpdir(), "imme-cli-"));

  try {
    process.chdir(cwd);
    callback(cwd);
  } finally {
    process.chdir(originalCwd);
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("parseArgs detects commands and flags", () => {
  const result = parseArgs(["config", "init", "--force", "--name", "demo"]);
  assert.equal(result.command, "config");
  assert.deepEqual(result.args, ["init", "--force", "--name", "demo"]);
  assert.equal(result.helpRequested, false);
  assert.equal(result.versionRequested, false);

  const helpResult = parseArgs(["--help"]);
  assert.equal(helpResult.command, "log");
  assert.equal(helpResult.helpRequested, true);
});

test("runConfigCommand init and set manage configuration", () => {
  withTempCwd(() => {
    runConfigCommand(["init", "--name", "Sample", "--environment", "test"]);
    const configPath = join(process.cwd(), ".imme", "config.json");
    const initial = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(initial.workspace.name, "Sample");
    assert.equal(initial.workspace.environment, "test");

    runConfigCommand(["set", "--key", "workspace.owner", "--value", "\"qa\""]);
    const updated = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(updated.workspace.owner, "qa");
  });
});
