import { appendFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_FILE = join(homedir(), ".config", "hn-cli", "debug.log");

let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    try {
      writeFileSync(LOG_FILE, `--- HN CLI Debug Log Started: ${new Date().toISOString()} ---\n`);
      initialized = true;
    } catch {
      // Ignore errors - logging is optional
    }
  }
}

export function log(...args: unknown[]) {
  ensureInitialized();
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(" ");

  try {
    appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
  } catch {
    // Ignore errors - logging is optional
  }
}

export function logError(context: string, error: unknown) {
  ensureInitialized();
  const timestamp = new Date().toISOString();

  let errorInfo = `[${timestamp}] ERROR [${context}]\n`;

  if (error instanceof Error) {
    errorInfo += `  Type: ${error.constructor.name}\n`;
    errorInfo += `  Message: ${error.message}\n`;
    if (error.stack) {
      errorInfo += `  Stack: ${error.stack}\n`;
    }
  } else {
    errorInfo += `  Value: ${String(error)}\n`;
  }

  try {
    // Also try to stringify the full error object
    errorInfo += `  Full: ${JSON.stringify(error, null, 2)}\n`;
  } catch {
    // Ignore
  }

  try {
    appendFileSync(LOG_FILE, errorInfo);
  } catch {
    // Ignore errors - logging is optional
  }
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
