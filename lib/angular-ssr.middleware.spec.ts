import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AngularSSRMiddleware } from './angular-ssr.middleware';
import type { AngularSSRService } from './angular-ssr.service';
import type { AngularSSRModuleOptions } from './interfaces';
import type { NextFunction, Request, Response } from 'express';

const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    method: 'GET',
    originalUrl: '/test-page',
    url: '/test-page',
    ...overrides,
  }) as unknown as Request;

const createMockResponse = (overrides: Partial<Response> = {}): Response =>
  ({
    headersSent: false,
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    ...overrides,
  }) as unknown as Response;

describe('AngularSSRMiddleware', () => {
  let middleware: AngularSSRMiddleware;
  let mockSSRService: { render: ReturnType<typeof vi.fn> };
  let mockOptions: AngularSSRModuleOptions;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockSSRService = {
      render: vi.fn(),
    };
    mockOptions = {
      browserDistFolder: '/dist/browser',
      bootstrap: vi.fn(),
    };
    middleware = new AngularSSRMiddleware(
      mockSSRService as unknown as AngularSSRService,
      mockOptions,
    );
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('use()', () => {
    it('should call next if response headers already sent', async () => {
      const request = createMockRequest();
      const response = createMockResponse({ headersSent: true });

      await middleware.use(request, response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockSSRService.render).not.toHaveBeenCalled();
    });

    it('should call next for API routes', async () => {
      const request = createMockRequest({ originalUrl: '/api/users' });
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockSSRService.render).not.toHaveBeenCalled();
    });

    describe('non-GET methods', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        it(`bypasses SSR for ${method}`, async () => {
          const request = createMockRequest({ method });
          const response = createMockResponse();

          await middleware.use(request, response, mockNext);

          expect(mockNext).toHaveBeenCalled();
          expect(mockSSRService.render).not.toHaveBeenCalled();
        });
      }

      it('renders for HEAD', async () => {
        mockSSRService.render.mockResolvedValue('<html></html>');
        const request = createMockRequest({ method: 'HEAD' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockSSRService.render).toHaveBeenCalled();
      });
    });

    describe('configurable skipPaths', () => {
      it('respects a custom string prefix', async () => {
        middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
          ...mockOptions,
          skipPaths: ['/internal'],
        });
        const request = createMockRequest({ originalUrl: '/internal/secrets' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockSSRService.render).not.toHaveBeenCalled();
      });

      it('respects a regular expression', async () => {
        middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
          ...mockOptions,
          skipPaths: [/^\/v\d+\//],
        });
        const request = createMockRequest({ originalUrl: '/v1/data' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockSSRService.render).not.toHaveBeenCalled();
      });

      it('does not apply default /api skip when skipPaths is empty', async () => {
        mockSSRService.render.mockResolvedValue('<html></html>');
        middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
          ...mockOptions,
          skipPaths: [],
        });
        const request = createMockRequest({ originalUrl: '/api/users' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockSSRService.render).toHaveBeenCalled();
      });
    });

    describe('static file requests', () => {
      const staticExtensions = [
        '.js',
        '.css',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.eot',
        '.map',
        '.json',
        '.webp',
        '.avif',
        '.mp4',
        '.webm',
        '.mp3',
        '.wav',
        '.pdf',
      ];

      for (const ext of staticExtensions) {
        it(`should call next for ${ext} files`, async () => {
          const request = createMockRequest({ originalUrl: `/assets/file${ext}` });
          const response = createMockResponse();

          await middleware.use(request, response, mockNext);

          expect(mockNext).toHaveBeenCalled();
          expect(mockSSRService.render).not.toHaveBeenCalled();
        });
      }

      it('should call next for static files with query strings', async () => {
        const request = createMockRequest({ originalUrl: '/assets/script.js?v=123' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockSSRService.render).not.toHaveBeenCalled();
      });

      it('should handle uppercase file extensions', async () => {
        const request = createMockRequest({ originalUrl: '/image.PNG' });
        const response = createMockResponse();

        await middleware.use(request, response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockSSRService.render).not.toHaveBeenCalled();
      });
    });

    it('should render Angular app for non-static routes', async () => {
      const mockHtml = '<html><body>Rendered</body></html>';
      mockSSRService.render.mockResolvedValue(mockHtml);

      const request = createMockRequest({ originalUrl: '/products' });
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalledWith(request, response);
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(response.send).toHaveBeenCalledWith(mockHtml);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('does not double-respond when service.render() already wrote a response', async () => {
      const response = createMockResponse({ headersSent: false });
      mockSSRService.render.mockImplementation(() => {
        (response as unknown as { headersSent: boolean }).headersSent = true;
        return Promise.resolve(null);
      });

      const request = createMockRequest();

      await middleware.use(request, response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(response.send).not.toHaveBeenCalled();
    });

    it('should call next when render returns null without writing response', async () => {
      mockSSRService.render.mockResolvedValue(null);

      const request = createMockRequest();
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      expect(response.send).not.toHaveBeenCalled();
    });

    it('should call next with error when render throws and no error handler', async () => {
      const error = new Error('Render error');
      mockSSRService.render.mockRejectedValue(error);

      const request = createMockRequest();
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('invokes errorHandler when render throws (regression: middleware used to silently hang)', async () => {
      const error = new Error('Render error');
      mockSSRService.render.mockRejectedValue(error);

      const errorHandler = vi.fn((_e, _req, res: Response) => {
        res.status(500).send('error page');
        (res as unknown as { headersSent: boolean }).headersSent = true;
      });
      middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
        ...mockOptions,
        errorHandler,
      });

      const request = createMockRequest();
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(errorHandler).toHaveBeenCalledWith(error, request, response);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('still forwards to next() when errorHandler is set but did not write a response', async () => {
      const error = new Error('Render error');
      mockSSRService.render.mockRejectedValue(error);

      const errorHandler = vi.fn();
      middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
        ...mockOptions,
        errorHandler,
      });

      const request = createMockRequest();
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      expect(errorHandler).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('logs but does not crash when the user errorHandler itself throws', async () => {
      const error = new Error('Render error');
      mockSSRService.render.mockRejectedValue(error);

      const errorHandler = vi.fn(() => {
        throw new Error('handler exploded');
      });
      middleware = new AngularSSRMiddleware(mockSSRService as unknown as AngularSSRService, {
        ...mockOptions,
        errorHandler,
      });

      const request = createMockRequest();
      const response = createMockResponse();

      await middleware.use(request, response, mockNext);

      // headersSent stayed false → still hand to next() with the original error.
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should use url fallback when originalUrl is undefined', async () => {
      const request = createMockRequest({
        originalUrl: undefined,
        url: '/fallback-route',
      } as unknown as Partial<Request>);
      const response = createMockResponse();

      mockSSRService.render.mockResolvedValue('<html></html>');

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalled();
    });

    it('should handle root path', async () => {
      const request = createMockRequest({ originalUrl: '/' });
      const response = createMockResponse();

      mockSSRService.render.mockResolvedValue('<html></html>');

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalledWith(request, response);
    });

    it('should handle nested paths', async () => {
      const request = createMockRequest({ originalUrl: '/products/electronics/laptops' });
      const response = createMockResponse();

      mockSSRService.render.mockResolvedValue('<html></html>');

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalledWith(request, response);
    });

    it('should handle paths with query parameters', async () => {
      const request = createMockRequest({ originalUrl: '/search?q=test&page=1' });
      const response = createMockResponse();

      mockSSRService.render.mockResolvedValue('<html></html>');

      await middleware.use(request, response, mockNext);

      expect(mockSSRService.render).toHaveBeenCalledWith(request, response);
    });
  });
});
