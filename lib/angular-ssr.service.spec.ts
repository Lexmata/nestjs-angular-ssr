import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AngularSSRService, DEFAULT_CACHE_EXPIRATION_TIME } from './angular-ssr.service';
import type { AngularSSRModuleOptions, CacheStorage } from './interfaces';
import type { Request, Response } from 'express';

// Mock AngularAppEngine
const createMockAngularApp = () => ({
  handle: vi.fn(),
});

// Mock Request
const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    protocol: 'http',
    get: vi.fn((header: string) => {
      if (header === 'host') {
        return 'localhost:3000';
      }
    }),
    hostname: 'localhost',
    originalUrl: '/test-page',
    url: '/test-page',
    method: 'GET',
    headers: {
      'user-agent': 'test-agent',
      accept: 'text/html',
    },
    ...overrides,
  }) as unknown as Request;

// Mock Response
const createMockResponse = (): Response =>
  ({
    setHeader: vi.fn(),
    send: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }) as unknown as Response;

describe('AngularSSRService', () => {
  let service: AngularSSRService;
  let mockAngularApp: ReturnType<typeof createMockAngularApp>;
  let mockOptions: AngularSSRModuleOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAngularApp = createMockAngularApp();
    mockOptions = {
      browserDistFolder: '/dist/browser',
      bootstrap: vi.fn().mockResolvedValue(mockAngularApp),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default cache settings when cache is undefined', () => {
      service = new AngularSSRService(mockOptions);
      // Service should be created successfully
      expect(service).toBeDefined();
    });

    it('should initialize with cache disabled when cache is false', () => {
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: false,
      };
      service = new AngularSSRService(options);
      expect(service).toBeDefined();
    });

    it('should initialize with default cache when cache is true', () => {
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: true,
      };
      service = new AngularSSRService(options);
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

      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: {
          storage: customStorage,
          expiresIn: 120_000,
        },
      };
      service = new AngularSSRService(options);
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
      const error = new Error('Bootstrap failed');
      mockOptions.bootstrap = vi.fn().mockRejectedValue(error);
      service = new AngularSSRService(mockOptions);

      await expect(service.onModuleInit()).rejects.toThrow('Bootstrap failed');
    });
  });

  describe('render()', () => {
    beforeEach(async () => {
      service = new AngularSSRService(mockOptions);
      await service.onModuleInit();
    });

    it('should throw error if Angular app is not initialized', async () => {
      const uninitializedService = new AngularSSRService(mockOptions);
      const request = createMockRequest();
      const response = createMockResponse();

      await expect(uninitializedService.render(request, response)).rejects.toThrow(
        'Angular SSR engine not initialized',
      );
    });

    it('should render Angular app and return HTML', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      const mockAngularResponse = {
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      mockAngularApp.handle.mockResolvedValue(mockAngularResponse);

      const request = createMockRequest();
      const response = createMockResponse();

      const result = await service.render(request, response);

      expect(result).toBe(mockHtml);
      expect(mockAngularApp.handle).toHaveBeenCalled();
    });

    it('should return null if Angular app returns no response', async () => {
      mockAngularApp.handle.mockResolvedValue(null);

      const request = createMockRequest();
      const response = createMockResponse();

      const result = await service.render(request, response);

      expect(result).toBeNull();
    });

    it('should cache rendered HTML', async () => {
      const mockHtml = '<html><body>Cached</body></html>';
      const mockAngularResponse = {
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      mockAngularApp.handle.mockResolvedValue(mockAngularResponse);

      const request = createMockRequest();
      const response = createMockResponse();

      // First render - should call Angular
      await service.render(request, response);
      expect(mockAngularApp.handle).toHaveBeenCalledTimes(1);

      // Second render - should use cache
      const result = await service.render(request, response);
      expect(result).toBe(mockHtml);
      expect(mockAngularApp.handle).toHaveBeenCalledTimes(1);
    });

    it('should not use cache when disabled', async () => {
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: false,
      };
      service = new AngularSSRService(options);
      await service.onModuleInit();

      const mockHtml = '<html><body>Not Cached</body></html>';
      const mockAngularResponse = {
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      mockAngularApp.handle.mockResolvedValue(mockAngularResponse);

      const request = createMockRequest();
      const response = createMockResponse();

      // First render
      await service.render(request, response);
      expect(mockAngularApp.handle).toHaveBeenCalledTimes(1);

      // Second render - should call Angular again since cache is disabled
      await service.render(request, response);
      expect(mockAngularApp.handle).toHaveBeenCalledTimes(2);
    });

    it('should call error handler on render error', async () => {
      const error = new Error('Render failed');
      mockAngularApp.handle.mockRejectedValue(error);

      const errorHandler = vi.fn();
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        errorHandler,
      };
      service = new AngularSSRService(options);
      await service.onModuleInit();

      const request = createMockRequest();
      const response = createMockResponse();

      const result = await service.render(request, response);

      expect(errorHandler).toHaveBeenCalledWith(error, request, response);
      expect(result).toBeNull();
    });

    it('should throw error if no error handler and render fails', async () => {
      const error = new Error('Render failed');
      mockAngularApp.handle.mockRejectedValue(error);

      const request = createMockRequest();
      const response = createMockResponse();

      await expect(service.render(request, response)).rejects.toThrow('Render failed');
    });

    it('should handle requests with different protocols', async () => {
      const mockHtml = '<html><body>HTTPS</body></html>';
      const mockAngularResponse = {
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      mockAngularApp.handle.mockResolvedValue(mockAngularResponse);

      const request = createMockRequest({ protocol: 'https' });
      const response = createMockResponse();

      const result = await service.render(request, response);

      expect(result).toBe(mockHtml);
      // Verify the request was created with https protocol
      const handleCall = mockAngularApp.handle.mock.calls[0][0] as globalThis.Request;
      expect(handleCall.url).toContain('https://');
    });

    it('should handle requests with multiple header values', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      const mockAngularResponse = {
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      mockAngularApp.handle.mockResolvedValue(mockAngularResponse);

      const request = createMockRequest({
        headers: {
          accept: ['text/html', 'application/json'],
          'user-agent': 'test',
        },
      } as unknown as Partial<Request>);
      const response = createMockResponse();

      const result = await service.render(request, response);

      expect(result).toBe(mockHtml);
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

      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: { storage: customStorage },
      };
      service = new AngularSSRService(options);
      await service.onModuleInit();

      await service.clearCache();

      expect(customStorage.clear).toHaveBeenCalled();
    });

    it('should do nothing when cache is disabled', async () => {
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: false,
      };
      service = new AngularSSRService(options);
      await service.onModuleInit();

      // Should not throw
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

      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: { storage: customStorage },
      };
      service = new AngularSSRService(options);
      await service.onModuleInit();

      const result = await service.invalidateCache('test-key');

      expect(customStorage.delete).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should return false when cache is disabled', async () => {
      const options: AngularSSRModuleOptions = {
        ...mockOptions,
        cache: false,
      };
      service = new AngularSSRService(options);
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
