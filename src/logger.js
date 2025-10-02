import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_METHOD = "NONE";
const DEFAULT_DB_PHASE = "none";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE", "PUT", DEFAULT_METHOD]);
const ALLOWED_DB_PHASES = new Set(["pre", "post", DEFAULT_DB_PHASE]);

function normalizeTimestamp(timestamp) {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeMethod(method = DEFAULT_METHOD) {
  if (typeof method !== "string" || method.length === 0) {
    return DEFAULT_METHOD;
  }

  const normalized = method.toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : DEFAULT_METHOD;
}

function normalizeDbPhase(dbPhase = DEFAULT_DB_PHASE) {
  if (typeof dbPhase !== "string" || dbPhase.length === 0) {
    return DEFAULT_DB_PHASE;
  }

  const normalized = dbPhase.toLowerCase();
  return ALLOWED_DB_PHASES.has(normalized) ? normalized : DEFAULT_DB_PHASE;
}

function normalizeLineNum(lineNum) {
  if (typeof lineNum === "number" && Number.isInteger(lineNum)) {
    return lineNum;
  }

  if (typeof lineNum === "string" && lineNum.trim().length > 0) {
    const parsed = Number.parseInt(lineNum, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  if (typeof error === "object") {
    const result = {};
    for (const [key, value] of Object.entries(error)) {
      result[key] = value;
    }
    return result;
  }

  return { name: "Error", message: String(error) };
}

export function createLogEntry({
  filename,
  classname = null,
  functionName = null,
  systemSection = null,
  lineNum = null,
  message,
  error = null,
  dbPhase = DEFAULT_DB_PHASE,
  method = DEFAULT_METHOD,
  timestamp = new Date(),
  level = "INFO"
}) {
  if (!filename) {
    throw new Error("filename is required for log entries");
  }

  if (!message) {
    throw new Error("message is required for log entries");
  }

  const entry = {
    level,
    filename,
    timestamp: normalizeTimestamp(timestamp),
    classname,
    function: functionName,
    system_section: systemSection,
    line_num: normalizeLineNum(lineNum),
    error: serializeError(error),
    db_phase: normalizeDbPhase(dbPhase),
    method: normalizeMethod(method),
    message
  };

  const derivedLine = `[Continuous skepticism (Sherlock Protocol)] ${message}`;

  return { entry, derivedLine };
}

function writeLine(writer, value) {
  if (!writer) {
    return;
  }

  if (typeof writer.log === "function") {
    writer.log(value);
  } else if (typeof writer.write === "function") {
    writer.write(`${value}\n`);
  }
}

export class StructuredLogger {
  constructor({
    persistentWriter = console,
    ephemeralWriter = console,
    baseContext = {}
  } = {}) {
    this.persistentWriter = persistentWriter;
    this.ephemeralWriter = ephemeralWriter;
    this.baseContext = { ...baseContext };
  }

  info(context) {
    return this.#log("INFO", context);
  }

  debug(context) {
    return this.#log("DEBUG", context);
  }

  error(context) {
    const enriched = { ...context };
    if (!enriched.error && context instanceof Error) {
      enriched.error = context;
    }

    return this.#log("ERROR", enriched);
  }

  #log(level, context = {}) {
    const merged = { ...this.baseContext, ...context, level };
    const { entry, derivedLine } = createLogEntry(merged);

    writeLine(this.persistentWriter, JSON.stringify(entry));
    writeLine(this.ephemeralWriter, derivedLine);

    return entry;
  }
}

function ensureDirectoryExists(filePath) {
  const directory = dirname(filePath);
  if (!directory || directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

function normalizeLogValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  return JSON.stringify(value);
}

export function createPersistentFileWriter({
  filePath,
  ensureDir = true,
  mode = 0o600
} = {}) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error("filePath is required for persistent log writers");
  }

  if (ensureDir) {
    ensureDirectoryExists(filePath);
  }

  const write = (value) => {
    const serialized = normalizeLogValue(value);
    appendFileSync(filePath, `${serialized}\n`, {
      encoding: "utf8",
      mode,
      flag: "a"
    });
  };

  return {
    log: write,
    write
  };
}
