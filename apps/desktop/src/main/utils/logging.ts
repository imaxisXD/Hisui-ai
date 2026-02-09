type LogLevel = "debug" | "info" | "warn" | "error";

const DEFAULT_MAX_FIELD_LENGTH = 800;
const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function parseBooleanFlag(rawValue: string | undefined): boolean | null {
  const value = rawValue?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }
  return null;
}

function parseLogLevel(rawValue: string | undefined): LogLevel | null {
  const value = rawValue?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return null;
}

function resolveMinLogLevel(): LogLevel {
  const explicitLevel = parseLogLevel(process.env.LOCAL_PODCAST_LOG_LEVEL);
  if (explicitLevel) {
    return explicitLevel;
  }

  const debugFlag = parseBooleanFlag(process.env.LOCAL_PODCAST_DEBUG);
  if (debugFlag === true) {
    return "debug";
  }
  if (debugFlag === false) {
    return "warn";
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "test") {
    return "error";
  }

  // In dev, keep lifecycle logs visible without requiring env setup.
  if (process.env.VITE_DEV_SERVER_URL) {
    return "info";
  }

  // Keep packaged/runtime output concise by default.
  return "warn";
}

function truncate(value: string, maxLength = DEFAULT_MAX_FIELD_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…(+${value.length - maxLength} chars)`;
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[max-depth]";
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack, 2000) : undefined
    };
  }
  if (typeof value === "string") {
    return truncate(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      normalized[key] = normalizeValue(item, depth + 1);
    }
    return normalized;
  }
  return String(value);
}

function encodeData(data: unknown): string {
  if (data === undefined) {
    return "";
  }
  try {
    return ` ${JSON.stringify(normalizeValue(data))}`;
  } catch {
    return " [unserializable-log-data]";
  }
}

function log(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const minLevel = resolveMinLogLevel();
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) {
    return;
  }
  const timestamp = new Date().toISOString();
  const line = `[${level}][${timestamp}][${scope}] ${message}${encodeData(data)}\n`;
  if (level === "error") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export function logDebug(scope: string, message: string, data?: unknown): void {
  log("debug", scope, message, data);
}

export function logInfo(scope: string, message: string, data?: unknown): void {
  log("info", scope, message, data);
}

export function logWarn(scope: string, message: string, data?: unknown): void {
  log("warn", scope, message, data);
}

export function logError(scope: string, message: string, data?: unknown): void {
  log("error", scope, message, data);
}
