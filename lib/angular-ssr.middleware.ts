import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { AngularSSRService } from './angular-ssr.service';
import { DebugLogger } from './debug-logger';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type { AngularSSRModuleOptions, SkipPath } from './interfaces';
import type { NextFunction, Request, Response } from 'express';

const DEFAULT_SKIP_PATHS: SkipPath[] = ['/api'];

const STATIC_FILE_EXTENSIONS = [
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

@Injectable()
export class AngularSSRMiddleware implements NestMiddleware {
  private readonly logger = new DebugLogger(AngularSSRMiddleware.name);

  constructor(
    @Inject(AngularSSRService)
    private readonly ssrService: AngularSSRService,
    @Inject(ANGULAR_SSR_OPTIONS)
    private readonly options: AngularSSRModuleOptions,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const url = req.originalUrl || req.url;
    const bypass = this.bypassReason(req, res, url);
    if (bypass) {
      if (this.logger.enabled()) {
        this.logger.debug(`bypass ${req.method} ${url}: ${bypass}`);
      }
      next();
      return;
    }

    try {
      const html = await this.ssrService.render(req, res);

      if (res.headersSent) {
        return;
      }

      if (html === null) {
        next();
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      this.handleRenderError(error as Error, req, res, next);
    }
  }

  private bypassReason(req: Request, res: Response, url: string): string | null {
    if (res.headersSent) {
      return 'response headers already sent';
    }
    if (this.ssrService.isDisabled()) {
      // `allowMissingBuild` is on and bootstrap() found no manifest. Hand
      // the request back to Express so downstream middleware (static
      // file handlers, 404 fallback, etc.) can respond instead of the
      // middleware hanging on a service that never initialised.
      return 'SSR engine disabled (allowMissingBuild)';
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return `method ${req.method} not GET/HEAD`;
    }
    if (this.isStaticFileRequest(url)) {
      return 'static file extension';
    }
    if (this.isSkippedPath(url)) {
      return 'matches skipPaths';
    }
    return null;
  }

  private handleRenderError(error: Error, req: Request, res: Response, next: NextFunction): void {
    this.logger.error('SSR rendering error', error);

    // Service throws bypass the user's errorHandler when raised before its
    // inner try/catch (e.g. engine not yet initialised) — re-invoke here so
    // the request never silently hangs.
    if (this.options.errorHandler && !res.headersSent) {
      try {
        this.options.errorHandler(error, req, res);
      } catch (handlerError) {
        this.logger.error('Error handler threw', handlerError);
      }
    }

    if (!res.headersSent) {
      next(error);
    }
  }

  /**
   * Check if the request is for a static file
   */
  private isStaticFileRequest(url: string): boolean {
    const urlPath = url.split('?')[0].toLowerCase();
    return STATIC_FILE_EXTENSIONS.some((ext) => urlPath.endsWith(ext));
  }

  private isSkippedPath(url: string): boolean {
    const skipPaths = this.options.skipPaths ?? DEFAULT_SKIP_PATHS;
    return skipPaths.some((rule) =>
      typeof rule === 'string' ? url.startsWith(rule) : rule.test(url),
    );
  }
}
