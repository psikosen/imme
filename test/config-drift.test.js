import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { detectConfigDrift } from "../src/config-drift.js";

function initGitWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), "imme-drift-"));
  execSync("git init", { cwd, stdio: "ignore" });
  execSync('git config user.email "imme@example.com"', { cwd, stdio: "ignore" });
  execSync('git config user.name "Imme Bot"', { cwd, stdio: "ignore" });

  const configDir = join(cwd, ".imme");
  mkdirSync(configDir, { recursive: true });
  const baseline = {
    workspace: {
      name: "Imme Workspace",
      environment: "development",
      lastUpdated: "2024-01-01T00:00:00.000Z"
    }
  };
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  execSync("git add .", { cwd, stdio: "ignore" });
  execSync('git commit -m "baseline config"', { cwd, stdio: "ignore" });

  return {
    cwd,
    cleanup() {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
}

test("detectConfigDrift reports no drift when configuration matches HEAD", () => {
  const context = initGitWorkspace();

  try {
    const result = detectConfigDrift({ cwd: context.cwd });
    assert.equal(result.hasDrift, false);
    assert.equal(result.baselineSource, "git");
  } finally {
    context.cleanup();
  }
});

test("detectConfigDrift ignores lastUpdated-only changes", () => {
  const context = initGitWorkspace();

  try {
    const configPath = join(context.cwd, ".imme", "config.json");
    const mutated = JSON.parse(readFileSync(configPath, "utf8"));
    mutated.workspace.lastUpdated = "2025-02-02T12:34:56.789Z";
    writeFileSync(configPath, `${JSON.stringify(mutated, null, 2)}\n`);

    const result = detectConfigDrift({ cwd: context.cwd });
    assert.equal(result.hasDrift, false);
  } finally {
    context.cleanup();
  }
});

test("detectConfigDrift highlights semantic configuration drift", () => {
  const context = initGitWorkspace();

  try {
    const configPath = join(context.cwd, ".imme", "config.json");
    const mutated = JSON.parse(readFileSync(configPath, "utf8"));
    mutated.workspace.environment = "production";
    mutated.workspace.owner = "qa";
    mutated.workspace.lastUpdated = "2025-02-02T12:34:56.789Z";
    writeFileSync(configPath, `${JSON.stringify(mutated, null, 2)}\n`);

    const result = detectConfigDrift({ cwd: context.cwd });
    assert.equal(result.hasDrift, true);
    const paths = result.differences.map((diff) => diff.path).sort();
    assert.deepEqual(paths, ["workspace.environment", "workspace.owner"]);
  } finally {
    context.cleanup();
  }
});
