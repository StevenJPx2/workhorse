import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Error log entry */
export interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  stack?: string;
}

// Log file path
const LOG_DIR = join(homedir(), ".local", "share", "workhorse", "logs");
const LOG_FILE = join(LOG_DIR, "tui.log");

/** Write a log entry to file */
function writeToFile(entry: LogEntry) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    appendFileSync(LOG_FILE, (entry.stack ? `${base}\n${entry.stack}` : base) + "\n");
  } catch {
    // Silently fail if we can't write to log
  }
}

/** Log an error and optionally return it for chaining */
export function logError(error: unknown, context?: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  writeToFile({
    timestamp: new Date().toISOString(),
    level: "error",
    message: context ? `[${context}] ${msg}` : msg,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return msg;
}

/** Log a warning */
export function logWarn(message: string, context?: string) {
  writeToFile({
    timestamp: new Date().toISOString(),
    level: "warn",
    message: context ? `[${context}] ${message}` : message,
  });
}

/** Log info */
export function logInfo(message: string, context?: string) {
  writeToFile({
    timestamp: new Date().toISOString(),
    level: "info",
    message: context ? `[${context}] ${message}` : message,
  });
}

/** Get the log file path */
export function getLogPath(): string {
  return LOG_FILE;
}

/** Install global error handler that logs to file */
export function installErrorHandler() {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    // Still call original
    originalError.apply(console, args);
    // Also log to file
    logError(
      args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "),
      "console.error",
    );
  };

  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    logError(err, "uncaughtException");
  });

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason) => {
    logError(reason, "unhandledRejection");
  });
}
