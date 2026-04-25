import { Logger } from '@nestjs/common';

/**
 * Env flag controlling debug-level logging. Re-read on every call so it can
 * be toggled at runtime without restarting the process.
 *
 * Values: unset/empty disables; `1`/`true`/`yes`/`on`/`all`/`*` enables every
 * context; comma-separated list enables only the named contexts (case-insensitive).
 */
export const ANGULAR_SSR_DEBUG_ENV = 'ANGULAR_SSR_DEBUG';

const ALL_VALUES = new Set(['1', 'true', 'yes', 'on', 'all', '*']);

interface ParsedFlag {
  matchAll: boolean;
  contexts: ReadonlySet<string>;
}

const EMPTY_FLAG: ParsedFlag = { matchAll: false, contexts: new Set() };

let cachedRaw: string | undefined;
let cachedFlag: ParsedFlag = EMPTY_FLAG;

function parseFlag(raw: string | undefined): ParsedFlag {
  if (!raw) {
    return EMPTY_FLAG;
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return EMPTY_FLAG;
  }
  if (ALL_VALUES.has(trimmed)) {
    return { matchAll: true, contexts: new Set() };
  }
  const contexts = new Set(
    trimmed
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
  return { matchAll: false, contexts };
}

function getFlag(): ParsedFlag {
  const raw = process.env[ANGULAR_SSR_DEBUG_ENV];
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFlag = parseFlag(raw);
  }
  return cachedFlag;
}

/**
 * Branch on debug state without paying for log-message construction.
 */
export function isDebugEnabled(context?: string): boolean {
  const flag = getFlag();
  if (flag.matchAll) {
    return true;
  }
  if (!context) {
    return false;
  }
  return flag.contexts.has(context.toLowerCase());
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
