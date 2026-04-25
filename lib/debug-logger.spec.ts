import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANGULAR_SSR_DEBUG_ENV, DebugLogger, isDebugEnabled } from './debug-logger';

describe('debug-logger', () => {
  const originalValue = process.env[ANGULAR_SSR_DEBUG_ENV];

  beforeEach(() => {
    Reflect.deleteProperty(process.env, ANGULAR_SSR_DEBUG_ENV);
  });

  afterEach(() => {
    if (originalValue === undefined) {
      Reflect.deleteProperty(process.env, ANGULAR_SSR_DEBUG_ENV);
    } else {
      process.env[ANGULAR_SSR_DEBUG_ENV] = originalValue;
    }
    vi.clearAllMocks();
  });

  describe('isDebugEnabled', () => {
    it('returns false when env var is unset', () => {
      expect(isDebugEnabled('AnyContext')).toBe(false);
    });

    it('returns false when env var is empty', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = '';
      expect(isDebugEnabled('AnyContext')).toBe(false);
    });

    it('returns false when env var is whitespace only', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = '   ';
      expect(isDebugEnabled('AnyContext')).toBe(false);
    });

    for (const value of ['1', 'true', 'yes', 'on', 'all', '*']) {
      it(`returns true for any context when env var is "${value}"`, () => {
        process.env[ANGULAR_SSR_DEBUG_ENV] = value;
        expect(isDebugEnabled('Whatever')).toBe(true);
      });
    }

    it('treats values case-insensitively', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = 'TRUE';
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns true only for matching contexts when given a comma list', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = 'AngularSSRService,AngularSSRMiddleware';
      expect(isDebugEnabled('AngularSSRService')).toBe(true);
      expect(isDebugEnabled('AngularSSRMiddleware')).toBe(true);
      expect(isDebugEnabled('AngularSSRModule')).toBe(false);
    });

    it('returns false when no context is supplied with a context list', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = 'AngularSSRService';
      expect(isDebugEnabled()).toBe(false);
    });

    it('matches contexts case-insensitively', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = 'angularssrservice';
      expect(isDebugEnabled('AngularSSRService')).toBe(true);
    });

    it('tolerates whitespace inside the comma list', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = ' AngularSSRService , AngularSSRMiddleware ';
      expect(isDebugEnabled('AngularSSRService')).toBe(true);
    });

    it('re-reads env on each call so toggling at runtime takes effect', () => {
      expect(isDebugEnabled('A')).toBe(false);
      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      expect(isDebugEnabled('A')).toBe(true);
      Reflect.deleteProperty(process.env, ANGULAR_SSR_DEBUG_ENV);
      expect(isDebugEnabled('A')).toBe(false);
    });
  });

  describe('DebugLogger', () => {
    it('reports enabled() based on env var', () => {
      const logger = new DebugLogger('Ctx');
      expect(logger.enabled()).toBe(false);
      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      expect(logger.enabled()).toBe(true);
    });

    it('suppresses log() when disabled', () => {
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { log: ReturnType<typeof vi.fn> } }).logger;
      inner.log = vi.fn();

      logger.log('hello');
      expect(inner.log).not.toHaveBeenCalled();

      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      logger.log('hello');
      expect(inner.log).toHaveBeenCalledWith('hello');
    });

    it('suppresses debug() when disabled', () => {
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { debug: ReturnType<typeof vi.fn> } }).logger;
      inner.debug = vi.fn();

      logger.debug('msg');
      expect(inner.debug).not.toHaveBeenCalled();

      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      logger.debug('msg');
      expect(inner.debug).toHaveBeenCalledWith('msg');
    });

    it('suppresses verbose() when disabled', () => {
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { verbose: ReturnType<typeof vi.fn> } }).logger;
      inner.verbose = vi.fn();

      logger.verbose('msg');
      expect(inner.verbose).not.toHaveBeenCalled();

      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      logger.verbose('msg');
      expect(inner.verbose).toHaveBeenCalledWith('msg');
    });

    it('always emits warn() regardless of env', () => {
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger;
      inner.warn = vi.fn();

      logger.warn('careful');
      expect(inner.warn).toHaveBeenCalledWith('careful');
    });

    it('always emits error() regardless of env', () => {
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { error: ReturnType<typeof vi.fn> } }).logger;
      inner.error = vi.fn();

      logger.error('boom');
      expect(inner.error).toHaveBeenCalledWith('boom');
    });

    it('respects per-context filtering for log()', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = 'OtherContext';
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { log: ReturnType<typeof vi.fn> } }).logger;
      inner.log = vi.fn();

      logger.log('msg');
      expect(inner.log).not.toHaveBeenCalled();

      process.env[ANGULAR_SSR_DEBUG_ENV] = 'Ctx';
      logger.log('msg');
      expect(inner.log).toHaveBeenCalled();
    });

    it('forwards optional message arguments', () => {
      process.env[ANGULAR_SSR_DEBUG_ENV] = '1';
      const logger = new DebugLogger('Ctx');
      const inner = (logger as unknown as { logger: { debug: ReturnType<typeof vi.fn> } }).logger;
      inner.debug = vi.fn();

      logger.debug('primary', 'extra');
      expect(inner.debug).toHaveBeenCalledWith('primary', 'extra');
    });
  });
});
