import { Logger } from '@nestjs/common';

/**
 * Environment variable that toggles debug-level logging across this module.
 *
 * Accepted values:
 *   - unset / empty:        debug logs are silenced; warnings & errors still emit.
 *   - `1` / `true` / `yes` / `on` / `all` / `*`:  enable debug logging for every context.
 *   - comma-separated list (e.g. `module,service`):  enable debug only for the
 *     listed contexts. Matching is case-insensitive against `DebugLogger`'s
 *     declared context.
 *
 * The flag is re-read on every call so it can be toggled at runtime without
 * restarting the process — useful for production triage.
 */
export const ANGULAR_SSR_DEBUG_ENV = 'ANGULAR_SSR_DEBUG';

const ALL_VALUES = new Set(['1', 'true', 'yes', 'on', 'all', '*']);

/**
 * Pure helper — exported so callers can branch on debug state without paying
 * the cost of building a log message.
 */
export function isDebugEnabled(context?: string): boolean {
  const raw = process.env[ANGULAR_SSR_DEBUG_ENV];
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  if (ALL_VALUES.has(trimmed)) {
    return true;
  }
  if (!context) {
    return false;
  }
  return trimmed
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .includes(context.toLowerCase());
}

/**
 * Drop-in wrapper around `@nestjs/common`'s `Logger` that gates `log`,
 * `debug`, and `verbose` calls behind the `ANGULAR_SSR_DEBUG` env flag.
 *
 * Warnings and errors are never gated — those represent real conditions an
 * operator needs to see regardless of debug mode.
 */
export class DebugLogger {
  private readonly logger: Logger;

  constructor(private readonly context: string) {
    this.logger = new Logger(context);
  }

  enabled(): boolean {
    return isDebugEnabled(this.context);
  }

  log(message: unknown, ...optional: unknown[]): void {
    if (this.enabled()) {
      this.logger.log(message as string, ...(optional as string[]));
    }
  }

  debug(message: unknown, ...optional: unknown[]): void {
    if (this.enabled()) {
      this.logger.debug(message as string, ...(optional as string[]));
    }
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    if (this.enabled()) {
      this.logger.verbose(message as string, ...(optional as string[]));
    }
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.logger.warn(message as string, ...(optional as string[]));
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.logger.error(message as string, ...(optional as string[]));
  }
}
