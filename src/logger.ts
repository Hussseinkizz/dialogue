import type { LogEntry, Logger } from "./types.ts";

/**
 * Creates the default console-based logger for Dialogue.
 * Outputs structured log entries as JSON-like objects.
 *
 * @returns Logger implementation using console methods
 */
export function createDefaultLogger(): Logger {
  return {
    debug(entry: LogEntry): void {
      if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
        console.debug("[Dialogue] [DEBUG]", entry);
      }
    },

    info(entry: LogEntry): void {
      console.info("[Dialogue] [INFO]", entry);
    },

    warn(entry: LogEntry): void {
      console.warn("[Dialogue] [WARN]", entry);
    },

    error(entry: LogEntry): void {
      console.error("[Dialogue] [ERROR]", entry);
    },
  };
}

/**
 * Creates a silent logger that does not output anything.
 * Useful for testing or when logging is not desired.
 *
 * @returns Logger implementation that does nothing
 */
export function createSilentLogger(): Logger {
  const noop = (): void => {
    // Intentionally empty - silent logger discards all log entries
  };
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
  };
}
