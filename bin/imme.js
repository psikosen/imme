#!/usr/bin/env node

import { basename, join, resolve } from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import {
  StructuredLogger,
  createPersistentFileWriter
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
  console.log("  --help                Show this message");
  console.log("  --version             Print version information");
}

function getScriptName() {
  const scriptPath = process.argv[1];
  return scriptPath ? basename(scriptPath) : "imme";
}

function parseArgs(rawArgs) {
  const args = [...rawArgs];
  let command = "log";
  const options = {};

  if (args.length > 0 && !args[0].startsWith("-")) {
    command = args.shift();
  }

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--version" || token === "-v") {
      options.version = true;
      continue;
    }

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

  return { command, options };
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

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { command, options } = parsed;

  if (options.help) {
    printUsage();
    return;
  }

  if (options.version) {
    console.log(pkg.version);
    return;
  }

  if (command !== "log") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!options.message) {
    console.error("--message is required for the log command");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const level = normalizeLevel(options.level);
  const logFilePath = resolveLogFilePath(options["log-file"]);

  let persistentWriter;
  if (!options.dryRun) {
    try {
      persistentWriter = createPersistentFileWriter({ filePath: logFilePath });
    } catch (error) {
      console.error(`Failed to create persistent log writer: ${error.message}`);
      process.exitCode = 1;
      return;
    }
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

main();
