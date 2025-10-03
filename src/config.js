import process from "node:process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const DEFAULT_RELATIVE_CONFIG_PATH = join(".imme", "config.json");
const DEFAULT_RELATIVE_LOG_PATH = join(".imme", "logs.jsonl");
const DEFAULT_RELATIVE_DATABASE_PATH = join(".imme", "imme.db");

export const DEFAULT_CONFIG = Object.freeze({
  workspace: {
    name: "Imme Workspace",
    environment: "development",
    paths: {
      log: DEFAULT_RELATIVE_LOG_PATH,
      database: DEFAULT_RELATIVE_DATABASE_PATH
    },
    database: {
      client: "sqlite",
      options: {
        filename: DEFAULT_RELATIVE_DATABASE_PATH
      }
    },
    lastUpdated: null
  }
});

function ensureDirectoryExists(filePath) {
  const directory = dirname(filePath);
  if (!directory || directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

function deepMerge(target, source) {
  const merged = Array.isArray(target) ? [...target] : { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof merged[key] === "object" &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

export function resolveConfigPath({
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH
} = {}) {
  return resolve(cwd, relativePath);
}

export function loadConfig({
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH,
  defaults = DEFAULT_CONFIG
} = {}) {
  const filePath = resolveConfigPath({ cwd, relativePath });
  if (!existsSync(filePath)) {
    return deepMerge({}, defaults);
  }

  const contents = readFileSync(filePath, "utf8");
  if (contents.trim().length === 0) {
    return deepMerge({}, defaults);
  }

  try {
    const parsed = JSON.parse(contents);
    return deepMerge(defaults, parsed);
  } catch (error) {
    throw new Error(`Invalid configuration JSON at ${filePath}: ${error.message}`);
  }
}

export function writeConfig({
  config,
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH
} = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("config must be an object");
  }

  const filePath = resolveConfigPath({ cwd, relativePath });
  ensureDirectoryExists(filePath);

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(filePath, serialized, { encoding: "utf8", mode: 0o600 });
  return filePath;
}

function applyKey(config, keyPath, value) {
  if (typeof keyPath !== "string" || keyPath.trim().length === 0) {
    throw new Error("keyPath must be a non-empty string");
  }

  const segments = keyPath.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error("keyPath must contain at least one segment");
  }

  let current = config;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }

    current = current[segment];
  }

  const finalSegment = segments.at(-1);
  current[finalSegment] = value;
}

function parseConfigValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function updateConfigValue({
  keyPath,
  value,
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH,
  defaults = DEFAULT_CONFIG
} = {}) {
  const config = loadConfig({ cwd, relativePath, defaults });
  const parsedValue = parseConfigValue(value);
  applyKey(config, keyPath, parsedValue);
  config.workspace = config.workspace ?? {};
  config.workspace.lastUpdated = new Date().toISOString();
  const filePath = writeConfig({ config, cwd, relativePath });
  return { config, filePath };
}

function resolvePathWithinWorkspace(pathValue, cwd = process.cwd()) {
  if (typeof pathValue !== "string" || pathValue.trim().length === 0) {
    return null;
  }

  if (isAbsolute(pathValue)) {
    return pathValue;
  }

  return resolve(cwd, pathValue);
}

function cloneWorkspaceConfig(workspace = {}) {
  const cloned = { ...workspace };
  cloned.paths = { ...workspace.paths };
  cloned.database = { ...workspace.database };
  if (workspace.database?.options) {
    cloned.database.options = { ...workspace.database.options };
  }
  return cloned;
}

export function loadWorkspaceSummary({
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH,
  defaults = DEFAULT_CONFIG
} = {}) {
  const config = loadConfig({ cwd, relativePath, defaults });
  const workspace = cloneWorkspaceConfig(config.workspace ?? {});
  const logPath = resolvePathWithinWorkspace(
    workspace.paths?.log ?? DEFAULT_RELATIVE_LOG_PATH,
    cwd
  );
  const databasePath = resolvePathWithinWorkspace(
    workspace.paths?.database ?? DEFAULT_RELATIVE_DATABASE_PATH,
    cwd
  );

  return {
    config,
    workspace: {
      name: workspace.name ?? defaults.workspace.name,
      environment: workspace.environment ?? defaults.workspace.environment,
      logPath,
      databasePath,
      database: {
        client: workspace.database?.client ?? defaults.workspace.database.client,
        options: {
          filename:
            workspace.database?.options?.filename ?? DEFAULT_RELATIVE_DATABASE_PATH
        }
      },
      lastUpdated: workspace.lastUpdated ?? null
    }
  };
}

export function updateWorkspaceConfig({
  updates = {},
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH,
  defaults = DEFAULT_CONFIG
} = {}) {
  if (!updates || typeof updates !== "object") {
    throw new Error("updates must be an object");
  }

  const config = loadConfig({ cwd, relativePath, defaults });
  const workspace = cloneWorkspaceConfig(config.workspace ?? {});

  if (Object.hasOwn(updates, "name")) {
    workspace.name = updates.name;
  }

  if (Object.hasOwn(updates, "environment")) {
    workspace.environment = updates.environment;
  }

  if (Object.hasOwn(updates, "logPath")) {
    const logPath = updates.logPath;
    workspace.paths = workspace.paths ?? {};
    workspace.paths.log = logPath;
  }

  if (Object.hasOwn(updates, "databasePath")) {
    const databasePath = updates.databasePath;
    workspace.paths = workspace.paths ?? {};
    workspace.paths.database = databasePath;
    workspace.database = workspace.database ?? {};
    workspace.database.options = workspace.database.options ?? {};
    workspace.database.options.filename = databasePath;
  }

  if (Object.hasOwn(updates, "database")) {
    workspace.database = deepMerge(workspace.database ?? {}, updates.database);
  }

  workspace.lastUpdated = new Date().toISOString();
  config.workspace = workspace;

  const filePath = writeConfig({ config, cwd, relativePath });
  return { config, filePath };
}

export function ensureConfig({
  cwd = process.cwd(),
  relativePath = DEFAULT_RELATIVE_CONFIG_PATH,
  defaults = DEFAULT_CONFIG,
  force = false,
  overrides = {}
} = {}) {
  const filePath = resolveConfigPath({ cwd, relativePath });
  const exists = existsSync(filePath);
  if (!force && exists) {
    return { filePath, created: false };
  }

  let baseConfig = defaults;
  if (force && exists) {
    baseConfig = loadConfig({ cwd, relativePath, defaults });
  }

  const merged = deepMerge(baseConfig, overrides);
  merged.workspace = merged.workspace ?? {};
  merged.workspace.lastUpdated = new Date().toISOString();

  writeConfig({ config: merged, cwd, relativePath });
  return { filePath, created: true };
}

