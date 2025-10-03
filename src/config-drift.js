import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_RELATIVE_PATH = ".imme/config.json";
const IGNORED_PATHS = new Set(["workspace.lastUpdated"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => [key, canonicalize(value[key])])
    );
  }

  return value;
}

function valuesEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function parseJson(contents, label) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Failed to parse ${label}: ${error.message}`);
  }
}

function collectDiffs(baselineValue, localValue, pathSegments, diffs) {
  const pathKey = pathSegments.join(".");
  if (IGNORED_PATHS.has(pathKey)) {
    return;
  }

  if (!isPlainObject(baselineValue) && !isPlainObject(localValue)) {
    if (!valuesEqual(baselineValue, localValue)) {
      diffs.push({
        type: "changed",
        path: pathKey,
        baseline: baselineValue ?? null,
        local: localValue ?? null
      });
    }
    return;
  }

  const baselineObject = isPlainObject(baselineValue) ? baselineValue : {};
  const localObject = isPlainObject(localValue) ? localValue : {};

  const keys = new Set([...Object.keys(baselineObject), ...Object.keys(localObject)]);
  const sortedKeys = Array.from(keys).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  for (const key of sortedKeys) {
    const nextPath = [...pathSegments, key];
    const hasBaseline = Object.hasOwn(baselineObject, key);
    const hasLocal = Object.hasOwn(localObject, key);

    if (!hasBaseline && hasLocal) {
      if (!IGNORED_PATHS.has(nextPath.join("."))) {
        diffs.push({
          type: "added",
          path: nextPath.join("."),
          baseline: null,
          local: localObject[key]
        });
      }
      continue;
    }

    if (hasBaseline && !hasLocal) {
      if (!IGNORED_PATHS.has(nextPath.join("."))) {
        diffs.push({
          type: "removed",
          path: nextPath.join("."),
          baseline: baselineObject[key],
          local: null
        });
      }
      continue;
    }

    collectDiffs(baselineObject[key], localObject[key], nextPath, diffs);
  }
}

function loadBaselineConfig({ cwd, relativePath }) {
  const gitShow = spawnSync("git", ["show", `HEAD:${relativePath}`], {
    cwd,
    encoding: "utf8"
  });

  if (gitShow.status === 0 && gitShow.stdout.trim().length > 0) {
    const baseline = parseJson(gitShow.stdout, `baseline config at HEAD:${relativePath}`);
    return { baseline, source: "git" };
  }

  const gitDirCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8"
  });

  const gitAvailable = gitDirCheck.status === 0;
  if (gitAvailable) {
    return { baseline: null, source: "git-missing" };
  }

  return { baseline: null, source: "unavailable" };
}

function loadLocalConfig({ cwd, relativePath }) {
  const filePath = resolve(cwd, relativePath);
  if (!existsSync(filePath)) {
    return { config: null, filePath, exists: false };
  }

  const contents = readFileSync(filePath, "utf8");
  if (contents.trim().length === 0) {
    return { config: {}, filePath, exists: true };
  }

  const config = parseJson(contents, `local config at ${filePath}`);
  return { config, filePath, exists: true };
}

export function detectConfigDrift({ cwd = process.cwd(), relativePath = DEFAULT_RELATIVE_PATH } = {}) {
  const baselineResult = loadBaselineConfig({ cwd, relativePath });
  const localResult = loadLocalConfig({ cwd, relativePath });

  if (!localResult.exists) {
    return {
      hasDrift: true,
      reason: "local-missing",
      filePath: localResult.filePath,
      differences: [
        {
          type: "missing",
          path: relativePath,
          baseline: baselineResult.baseline,
          local: null
        }
      ],
      baselineSource: baselineResult.source
    };
  }

  if (!baselineResult.baseline) {
    return {
      hasDrift: false,
      reason: baselineResult.source,
      filePath: localResult.filePath,
      differences: [],
      baselineSource: baselineResult.source
    };
  }

  const diffs = [];
  collectDiffs(baselineResult.baseline, localResult.config, [], diffs);

  return {
    hasDrift: diffs.length > 0,
    reason: diffs.length > 0 ? "differences" : "in-sync",
    filePath: localResult.filePath,
    differences: diffs,
    baselineSource: baselineResult.source
  };
}

export function formatDriftReport({
  hasDrift,
  differences,
  baselineSource,
  filePath,
  reason
}) {
  if (!hasDrift) {
    if (baselineSource === "git" || baselineSource === "git-missing") {
      return `No configuration drift detected for ${filePath}.`;
    }
    return `No baseline detected (source: ${baselineSource}). Local configuration treated as authoritative.`;
  }

  if (reason === "local-missing") {
    return `Configuration file missing at ${filePath}.`;
  }

  const lines = ["Configuration drift detected:"];
  for (const diff of differences) {
    switch (diff.type) {
      case "added":
        lines.push(`  • Added ${diff.path}: ${JSON.stringify(diff.local)}`);
        break;
      case "removed":
        lines.push(`  • Removed ${diff.path}: ${JSON.stringify(diff.baseline)}`);
        break;
      case "changed":
        lines.push(
          `  • Changed ${diff.path}: ${JSON.stringify(diff.baseline)} → ${JSON.stringify(diff.local)}`
        );
        break;
      case "missing":
        lines.push(`  • Missing configuration at ${diff.path}`);
        break;
      default:
        lines.push(`  • ${diff.path || '<root>'} differs`);
    }
  }

  return lines.join("\n");
}
