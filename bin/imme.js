#!/usr/bin/env node

import { basename, join, resolve } from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  StructuredLogger,
  createPersistentFileWriter,
  ensureConfig,
  loadConfig,
  updateConfigValue
} from "../src/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const DEFAULT_RELATIVE_LOG_PATH = join(".imme", "logs.jsonl");

function printUsage() {
  const scriptName = getScriptName();
  console.log(`Imme CLI v${pkg.version}`);
  console.log("");
  console.log("Usage:");
  console.log(`  ${scriptName} log --message <text> [options]`);
  console.log(`  ${scriptName} config <subcommand> [options]`);
  console.log("");
  console.log("Options:");
  console.log("  --message, -m         Log message to emit (required)");
  console.log("  --level, -l           Log level: info, debug, error (default: info)");
  console.log("  --filename            Source filename for the log entry");
  console.log("  --classname           Class name producing the log entry");
  console.log("  --function            Function name producing the log entry");
  console.log("  --system-section      Logical system section name");
  console.log("  --method              HTTP method context (GET, POST, DELETE, PUT)");
  console.log("  --db-phase            Database phase context (pre, post)");
  console.log("  --log-file            Override persistent log file path");
  console.log("  --dry-run             Skip writing to persistent log storage");
  console.log("  --help                Show this message (also works per-command)");
  console.log("  --version             Print version information");
  console.log("");
  console.log("Config subcommands:");
  console.log("  init                  Create a workspace configuration file");
  console.log("  show                  Display the current configuration");
  console.log("  set --key <path> --value <value>   Update a configuration value");
}

function printConfigUsage() {
  const scriptName = getScriptName();
  console.log("Imme configuration management");
  console.log("");
  console.log("Usage:");
  console.log(`  ${scriptName} config init [--force] [--name <text>] [--environment <text>]`);
  console.log(`  ${scriptName} config show`);
  console.log(`  ${scriptName} config set --key <path> --value <value>`);
  console.log("");
  console.log("Examples:");
  console.log(`  ${scriptName} config init --name "Project Atlas"`);
  console.log(`  ${scriptName} config set --key workspace.environment --value production`);
}

function getScriptName() {
  const scriptPath = process.argv[1];
  return scriptPath ? basename(scriptPath) : "imme";
}

function parseArgs(rawArgs) {
  const filtered = [];
  let helpRequested = false;
  let versionRequested = false;

  for (const token of rawArgs) {
    if (token === "--help" || token === "-h") {
      helpRequested = true;
      continue;
    }

    if (token === "--version" || token === "-v") {
      versionRequested = true;
      continue;
    }

    filtered.push(token);
  }

  let command = "log";
  if (filtered.length > 0 && !filtered[0].startsWith("-")) {
    command = filtered.shift();
  }

  return { command, args: filtered, helpRequested, versionRequested };
}

function parseLogOptions(tokens) {
  const args = [...tokens];
  const options = {};

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = args.shift();
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`Option --${key} requires a value`);
      }
      options[key] = next;
      continue;
    }

    if (token.startsWith("-")) {
      const shorthand = token.slice(1);
      const next = args.shift();
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`Option -${shorthand} requires a value`);
      }
      switch (shorthand) {
        case "m":
          options.message = next;
          break;
        case "l":
          options.level = next;
          break;
        default:
          throw new Error(`Unknown shorthand option -${shorthand}`);
      }
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  return options;
}

function normalizeLevel(value = "info") {
  const normalized = String(value).toLowerCase();
  if (["info", "debug", "error"].includes(normalized)) {
    return normalized;
  }

  return "info";
}

function resolveLogFilePath(optionValue) {
  const resolved = resolve(process.cwd(), optionValue ?? DEFAULT_RELATIVE_LOG_PATH);
  return resolved;
}

function filterUndefinedEntries(entries) {
  const result = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }

  return result;
}

function runLogCommand(args) {
  const options = parseLogOptions(args);

  if (!options.message) {
    throw new Error("--message is required for the log command");
  }

  const level = normalizeLevel(options.level);
  const logFilePath = resolveLogFilePath(options["log-file"]);

  let persistentWriter;
  if (!options.dryRun) {
    persistentWriter = createPersistentFileWriter({ filePath: logFilePath });
  } else {
    persistentWriter = {
      log() {},
      write() {}
    };
  }

  const baseContext = filterUndefinedEntries({
    filename: options.filename,
    classname: options.classname,
    functionName: options.function,
    systemSection: options["system-section"],
    method: options.method,
    dbPhase: options["db-phase"]
  });

  if (Object.keys(baseContext).length === 0) {
    baseContext.filename = "imme-cli";
  }

  const logger = new StructuredLogger({
    persistentWriter,
    baseContext
  });

  const entryContext = filterUndefinedEntries({
    message: options.message,
    functionName: options.function,
    systemSection: options["system-section"],
    method: options.method,
    dbPhase: options["db-phase"],
    classname: options.classname
  });

  const methodName = level === "error" ? "error" : level;
  logger[methodName](entryContext);

  if (!options.dryRun && !existsSync(logFilePath)) {
    console.error(`Warning: log file was not created at ${logFilePath}`);
    process.exitCode = 1;
  }
}

function parseConfigOptions(tokens) {
  const options = {};
  const args = [...tokens];

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--force") {
      options.force = true;
      continue;
    }

    if (token === "--name") {
      const value = args.shift();
      if (value === undefined) {
        throw new Error("Option --name requires a value");
      }
      options.name = value;
      continue;
    }

    if (token === "--environment") {
      const value = args.shift();
      if (value === undefined) {
        throw new Error("Option --environment requires a value");
      }
      options.environment = value;
      continue;
    }

    if (token === "--key") {
      const value = args.shift();
      if (value === undefined) {
        throw new Error("Option --key requires a value");
      }
      options.key = value;
      continue;
    }

    if (token === "--value") {
      const value = args.shift();
      if (value === undefined) {
        throw new Error("Option --value requires a value");
      }
      options.value = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  return options;
}

function runConfigCommand(args) {
  const tokens = [...args];
  const subcommand = tokens.shift() ?? "show";

  switch (subcommand) {
    case "init": {
      const options = parseConfigOptions(tokens);
      const overrides = { workspace: {} };
      if (options.name) {
        overrides.workspace.name = options.name;
      }
      if (options.environment) {
        overrides.workspace.environment = options.environment;
      }

      const { filePath, created } = ensureConfig({
        overrides,
        force: options.force
      });

      if (created) {
        console.log(`Configuration created at ${filePath}`);
      } else {
        console.log(`Configuration already exists at ${filePath}`);
      }
      return;
    }

    case "show": {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    case "set": {
      const options = parseConfigOptions(tokens);
      if (!options.key) {
        throw new Error("--key is required for config set");
      }
      if (options.value === undefined) {
        throw new Error("--value is required for config set");
      }

      const { filePath } = updateConfigValue({ keyPath: options.key, value: options.value });
      console.log(`Updated ${options.key} in ${filePath}`);
      return;
    }

    default:
      throw new Error(`Unknown config subcommand: ${subcommand}`);
  }
}

function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { command, args, helpRequested, versionRequested } = parsed;

  if (versionRequested) {
    console.log(pkg.version);
    return;
  }

  if (helpRequested) {
    if (command === "config") {
      printConfigUsage();
      return;
    }

    printUsage();
    return;
  }

  try {
    switch (command) {
      case "log":
        runLogCommand(args);
        break;
      case "config":
        runConfigCommand(args);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const isExecutedDirectly = (() => {
  const modulePath = fileURLToPath(import.meta.url);
  return process.argv[1] && resolve(process.argv[1]) === modulePath;
})();

if (isExecutedDirectly) {
  main();
}

export { main, parseArgs, parseLogOptions, runLogCommand, runConfigCommand };
