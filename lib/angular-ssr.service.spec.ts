import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AngularSSRService, DEFAULT_CACHE_EXPIRATION_TIME } from './angular-ssr.service';
import { REQUEST, RESPONSE } from './tokens';
import type { AngularSSRModuleOptions, CacheStorage } from './interfaces';
import type { Request, Response } from 'express';

// Engine factories — each shapes the duck-type so the service routes to the
// expected branch without needing access to the real Angular SSR classes.

const createAppEngine = () => ({
  // No render method; constructor.name is 'Object' — falls through to the
  // AngularAppEngine branch.
  handle: vi.fn(),
});

const createNodeAppEngine = () => {
  class AngularNodeAppEngine {
    handle = vi.fn();
  }
  return new AngularNodeAppEngine();
};

const createCommonEngine = () => ({
  // CommonEngine has render() but not handle().
  render: vi.fn(),
});

const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    method: 'GET',
    protocol: 'http',
    get: vi.fn((header: string) => {
      if (header === 'host') {
        return 'localhost:3000';
      }
    }),
    hostname: 'localhost',
    originalUrl: '/test-page',
    url: '/test-page',
    headers: {
      'user-agent': 'test-agent',
      accept: 'text/html',
    },
    ...overrides,
  }) as unknown as Request;

const createMockResponse = (): Response =>
  ({
    setHeader: vi.fn(),
    send: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }) as unknown as Response;

describe('AngularSSRService', () => {
  let service: AngularSSRService;
  let mockOptions: AngularSSRModuleOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOptions = {
      browserDistFolder: '/dist/browser',
      bootstrap: vi.fn().mockResolvedValue(createAppEngine()),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default cache settings when cache is undefined', () => {
      service = new AngularSSRService(mockOptions);
      expect(service).toBeDefined();
    });

    it('should initialize with cache disabled when cache is false', () => {
      service = new AngularSSRService({ ...mockOptions, cache: false });
      expect(service).toBeDefined();
    });

    it('should initialize with default cache when cache is true', () => {
      service = new AngularSSRService({ ...mockOptions, cache: true });
      expect(service).toBeDefined();
    });

    it('should initialize with custom cache options', () => {
      const customStorage: CacheStorage = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        has: vi.fn(),
      };

      service = new AngularSSRService({
        ...mockOptions,
        cache: { storage: customStorage, expiresIn: 120_000 },
      });
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit()', () => {
    it('should initialize Angular SSR engine', async () => {
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();

      expect(mockOptions.bootstrap).toHaveBeenCalled();
    });

    it('should throw error if bootstrap fails', async () => {
      mockOptions.bootstrap = vi.fn().mockRejectedValue(new Error('Bootstrap failed'));
      service = new AngularSSRService(mockOptions);

      await expect(service.onModuleInit()).rejects.toThrow('Bootstrap failed');
    });
  });

  describe('render() — AngularAppEngine path (default fallback)', () => {
    let engine: ReturnType<typeof createAppEngine>;

    beforeEach(async () => {
      engine = createAppEngine();
      mockOptions.bootstrap = vi.fn().mockResolvedValue(engine);
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();
    });

    it('should throw error if Angular app is not initialized', async () => {
      const uninitialized = new AngularSSRService(mockOptions);
      await expect(uninitialized.render(createMockRequest(), createMockResponse())).rejects.toThrow(
        'Angular SSR engine not initialized',
      );
    });

    it('should render Angular app and return HTML', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue(mockHtml) });

      const result = await service.render(createMockRequest(), createMockResponse());

      expect(result).toBe(mockHtml);
      expect(engine.handle).toHaveBeenCalled();
    });

    it('should return null if Angular app returns no response', async () => {
      engine.handle.mockResolvedValue(null);
      const result = await service.render(createMockRequest(), createMockResponse());
      expect(result).toBeNull();
    });

    it('should handle requests with different protocols', async () => {
      const mockHtml = '<html><body>HTTPS</body></html>';
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue(mockHtml) });

      await service.render(createMockRequest({ protocol: 'https' }), createMockResponse());

      const fetchRequest = engine.handle.mock.calls[0][0] as globalThis.Request;
      expect(fetchRequest.url).toContain('https://');
    });

    it('should handle requests with multiple header values', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue(mockHtml) });

      const request = createMockRequest({
        headers: {
          accept: ['text/html', 'application/json'],
          'user-agent': 'test',
        },
      } as unknown as Partial<Request>);

      const result = await service.render(request, createMockResponse());
      expect(result).toBe(mockHtml);
    });

    it('passes the response into the engine via requestContext', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const response = createMockResponse();
      await service.render(createMockRequest(), response);

      expect(engine.handle.mock.calls[0][1]).toEqual({ response });
    });

    it('falls back to localhost when the host header is missing', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const request = createMockRequest({
        get: vi.fn(),
      } as unknown as Partial<Request>);
      await service.render(request, createMockResponse());

      const fetchRequest = engine.handle.mock.calls[0][0] as { url: string };
      expect(fetchRequest.url).toContain('http://localhost/');
    });

    it('falls back to "/" when neither originalUrl nor url is set', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const request = createMockRequest({
        originalUrl: undefined,
        url: undefined,
      } as unknown as Partial<Request>);
      await service.render(request, createMockResponse());

      const fetchRequest = engine.handle.mock.calls[0][0] as { url: string };
      expect(fetchRequest.url).toBe('http://localhost:3000/');
    });

    it('skips header entries whose value is undefined', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const request = createMockRequest({
        headers: {
          accept: 'text/html',
          'x-empty': undefined,
        },
      } as unknown as Partial<Request>);
      await service.render(request, createMockResponse());

      const fetchRequest = engine.handle.mock.calls[0][0] as { headers: Headers };
      expect(fetchRequest.headers.has('accept')).toBe(true);
      expect(fetchRequest.headers.has('x-empty')).toBe(false);
    });
  });

  describe('render() — AngularNodeAppEngine path', () => {
    let engine: { handle: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      engine = createNodeAppEngine();
      mockOptions.bootstrap = vi.fn().mockResolvedValue(engine);
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();
    });

    it('passes the Express request directly into the engine', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const request = createMockRequest();
      const response = createMockResponse();
      await service.render(request, response);

      // For Node engine, the FIRST arg is the Express request itself, not a
      // Web fetch Request — that's the entire point of this branch.
      expect(engine.handle).toHaveBeenCalledWith(request, { response });
    });

    it('returns null when handle resolves to null', async () => {
      engine.handle.mockResolvedValue(null);
      const result = await service.render(createMockRequest(), createMockResponse());
      expect(result).toBeNull();
    });

    it('honours an explicit engineType override even when ducktype would mismatch', async () => {
      const ducklessEngine = { handle: vi.fn() };
      ducklessEngine.handle.mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html>node</html>'),
      });
      mockOptions.bootstrap = vi.fn().mockResolvedValue(ducklessEngine);
      const overridden = new AngularSSRService({ ...mockOptions, engineType: 'node-app' });
      await overridden.onModuleInit();

      const request = createMockRequest();
      await overridden.render(request, createMockResponse());

      expect(ducklessEngine.handle).toHaveBeenCalledWith(request, expect.any(Object));
    });
  });

  describe('render() — CommonEngine path', () => {
    let engine: ReturnType<typeof createCommonEngine>;

    beforeEach(async () => {
      engine = createCommonEngine();
      mockOptions = {
        ...mockOptions,
        bootstrap: vi.fn().mockResolvedValue(engine),
        angularBootstrap: vi.fn().mockResolvedValue('bootstrap-fn'),
      };
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();
    });

    it('routes to render() based on duck-type detection', async () => {
      engine.render.mockResolvedValue('<html>common</html>');
      const result = await service.render(createMockRequest(), createMockResponse());

      expect(engine.render).toHaveBeenCalled();
      expect(result).toBe('<html>common</html>');
    });

    it('passes documentFilePath, publicPath, url, and bootstrap', async () => {
      engine.render.mockResolvedValue('<html></html>');
      await service.render(createMockRequest(), createMockResponse());

      const opts = engine.render.mock.calls[0][0];
      expect(opts.documentFilePath).toBe('/dist/browser/index.server.html');
      expect(opts.publicPath).toBe('/dist/browser');
      expect(opts.url).toContain('http://localhost:3000/test-page');
      expect(opts.bootstrap).toBe('bootstrap-fn');
    });

    it('honours a custom indexHtml path', async () => {
      engine.render.mockResolvedValue('<html></html>');
      const customService = new AngularSSRService({
        ...mockOptions,
        indexHtml: '/custom/index.html',
      });
      await customService.onModuleInit();
      await customService.render(createMockRequest(), createMockResponse());

      expect(engine.render.mock.calls.at(-1)?.[0].documentFilePath).toBe('/custom/index.html');
    });

    it('injects per-request REQUEST and RESPONSE providers', async () => {
      engine.render.mockResolvedValue('<html></html>');
      const request = createMockRequest();
      const response = createMockResponse();
      await service.render(request, response);

      const providers = engine.render.mock.calls[0][0].providers;
      expect(providers).toEqual(
        expect.arrayContaining([
          { provide: REQUEST, useValue: request },
          { provide: RESPONSE, useValue: response },
        ]),
      );
    });

    it('preserves user-supplied extraProviders alongside REQUEST/RESPONSE', async () => {
      engine.render.mockResolvedValue('<html></html>');
      const extraProvider = { provide: 'CUSTOM', useValue: 42 };
      const customService = new AngularSSRService({
        ...mockOptions,
        extraProviders: [extraProvider],
      });
      await customService.onModuleInit();
      await customService.render(createMockRequest(), createMockResponse());

      const providers = engine.render.mock.calls.at(-1)?.[0].providers;
      expect(providers).toEqual(
        expect.arrayContaining([
          extraProvider,
          expect.objectContaining({ provide: REQUEST }),
          expect.objectContaining({ provide: RESPONSE }),
        ]),
      );
    });

    it('passes inlineCriticalCss through (defaults to true)', async () => {
      engine.render.mockResolvedValue('<html></html>');
      await service.render(createMockRequest(), createMockResponse());
      expect(engine.render.mock.calls[0][0].inlineCriticalCss).toBe(true);
    });

    it('honours an explicit inlineCriticalCss=false', async () => {
      engine.render.mockResolvedValue('<html></html>');
      const customService = new AngularSSRService({
        ...mockOptions,
        inlineCriticalCss: false,
      });
      await customService.onModuleInit();
      await customService.render(createMockRequest(), createMockResponse());

      expect(engine.render.mock.calls.at(-1)?.[0].inlineCriticalCss).toBe(false);
    });

    it('runs without angularBootstrap when not provided', async () => {
      engine.render.mockResolvedValue('<html></html>');
      const customService = new AngularSSRService({
        ...mockOptions,
        angularBootstrap: undefined,
      });
      await customService.onModuleInit();
      await customService.render(createMockRequest(), createMockResponse());

      expect(engine.render.mock.calls.at(-1)?.[0].bootstrap).toBeUndefined();
    });
  });

  describe('render() — engineType override', () => {
    it('forces CommonEngine path when engineType=common', async () => {
      const commonish = { render: vi.fn().mockResolvedValue('<html>forced</html>') };
      mockOptions = {
        ...mockOptions,
        bootstrap: vi.fn().mockResolvedValue(commonish),
        engineType: 'common',
      };
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();

      const result = await service.render(createMockRequest(), createMockResponse());
      expect(commonish.render).toHaveBeenCalled();
      expect(result).toBe('<html>forced</html>');
    });

    it('forces AngularAppEngine path when engineType=app', async () => {
      const ambiguous = {
        render: vi.fn(),
        handle: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue('<html>app</html>') }),
      };
      mockOptions = {
        ...mockOptions,
        bootstrap: vi.fn().mockResolvedValue(ambiguous),
        engineType: 'app',
      };
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();

      const result = await service.render(createMockRequest(), createMockResponse());

      expect(ambiguous.render).not.toHaveBeenCalled();
      // For app engine, first arg is a Web fetch Request, not the Express one;
      // it has a string `url` and a Headers instance.
      const firstArg = ambiguous.handle.mock.calls[0][0] as {
        url: string;
        headers: Headers;
      };
      expect(typeof firstArg.url).toBe('string');
      expect(firstArg.headers).toBeInstanceOf(Headers);
      expect(result).toBe('<html>app</html>');
    });
  });

  describe('caching', () => {
    let engine: ReturnType<typeof createAppEngine>;

    beforeEach(async () => {
      engine = createAppEngine();
      mockOptions = { ...mockOptions, bootstrap: vi.fn().mockResolvedValue(engine) };
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();
    });

    it('should cache GET responses', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });
      const request = createMockRequest();
      const response = createMockResponse();

      await service.render(request, response);
      await service.render(request, response);

      expect(engine.handle).toHaveBeenCalledTimes(1);
    });

    it('emits a cache-hit debug log when ANGULAR_SSR_DEBUG is enabled', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });
      const request = createMockRequest();
      const response = createMockResponse();
      await service.render(request, response);

      const previous = process.env.ANGULAR_SSR_DEBUG;
      process.env.ANGULAR_SSR_DEBUG = '1';
      try {
        await service.render(request, response);
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(process.env, 'ANGULAR_SSR_DEBUG');
        } else {
          process.env.ANGULAR_SSR_DEBUG = previous;
        }
      }

      expect(engine.handle).toHaveBeenCalledTimes(1);
    });

    it('should not cache when cache is disabled', async () => {
      const noCache = new AngularSSRService({ ...mockOptions, cache: false });
      await noCache.onModuleInit();
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });

      const request = createMockRequest();
      const response = createMockResponse();
      await noCache.render(request, response);
      await noCache.render(request, response);

      expect(engine.handle).toHaveBeenCalledTimes(2);
    });

    it('does not cache POST responses', async () => {
      engine.handle.mockResolvedValue({ text: vi.fn().mockResolvedValue('<html></html>') });
      const post = createMockRequest({ method: 'POST' });
      const response = createMockResponse();

      await service.render(post, response);
      await service.render(post, response);

      expect(engine.handle).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    let engine: ReturnType<typeof createAppEngine>;

    beforeEach(async () => {
      engine = createAppEngine();
      mockOptions = { ...mockOptions, bootstrap: vi.fn().mockResolvedValue(engine) };
    });

    it('should call error handler on render error', async () => {
      const error = new Error('Render failed');
      engine.handle.mockRejectedValue(error);

      const errorHandler = vi.fn();
      service = new AngularSSRService({ ...mockOptions, errorHandler });
      await service.onModuleInit();

      const request = createMockRequest();
      const response = createMockResponse();
      const result = await service.render(request, response);

      expect(errorHandler).toHaveBeenCalledWith(error, request, response);
      expect(result).toBeNull();
    });

    it('should throw error if no error handler and render fails', async () => {
      engine.handle.mockRejectedValue(new Error('Render failed'));
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();

      await expect(service.render(createMockRequest(), createMockResponse())).rejects.toThrow(
        'Render failed',
      );
    });
  });

  describe('clearCache()', () => {
    it('should clear the cache when enabled', async () => {
      const customStorage: CacheStorage = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        has: vi.fn(),
      };

      service = new AngularSSRService({ ...mockOptions, cache: { storage: customStorage } });
      await service.onModuleInit();
      await service.clearCache();

      expect(customStorage.clear).toHaveBeenCalled();
    });

    it('should do nothing when cache is disabled', async () => {
      service = new AngularSSRService({ ...mockOptions, cache: false });
      await service.onModuleInit();

      await expect(service.clearCache()).resolves.toBeUndefined();
    });
  });

  describe('invalidateCache()', () => {
    it('should delete specific cache key when enabled', async () => {
      const customStorage: CacheStorage = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn().mockReturnValue(true),
        clear: vi.fn(),
        has: vi.fn(),
      };

      service = new AngularSSRService({ ...mockOptions, cache: { storage: customStorage } });
      await service.onModuleInit();

      const result = await service.invalidateCache('test-key');
      expect(customStorage.delete).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should return false when cache is disabled', async () => {
      service = new AngularSSRService({ ...mockOptions, cache: false });
      await service.onModuleInit();

      const result = await service.invalidateCache('test-key');
      expect(result).toBe(false);
    });
  });

  describe('DEFAULT_CACHE_EXPIRATION_TIME', () => {
    it('should be 60000 milliseconds (1 minute)', () => {
      expect(DEFAULT_CACHE_EXPIRATION_TIME).toBe(60_000);
    });
  });
});
