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
      this.logger.debug(`bypass ${req.method} ${url}: ${bypass}`);
      next();
      return;
    }

    this.logger.debug(`render ${req.method} ${url}`);

    try {
      const html = await this.ssrService.render(req, res);

      // The configured errorHandler may have written a response from inside
      // service.render(); never double-respond.
      if (this.responseAlreadySent(res)) {
        this.logger.debug(`response already sent by service for ${url}`);
        return;
      }

      if (html === null) {
        this.logger.debug(`null render result for ${url}, deferring to next()`);
        next();
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      this.logger.debug(`sent ${String(html.length)} bytes for ${url}`);
    } catch (error) {
      this.handleRenderError(error as Error, req, res, next);
    }
  }

  private bypassReason(req: Request, res: Response, url: string): string | null {
    if (this.responseAlreadySent(res)) {
      return 'response headers already sent';
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

  /**
   * Read `res.headersSent` through a structural cast so the linter doesn't
   * narrow it to a constant after the first early-return check — the value
   * mutates whenever the user errorHandler writes to the response.
   */
  private responseAlreadySent(res: Response): boolean {
    return (res as { headersSent: boolean }).headersSent;
  }

  private handleRenderError(error: Error, req: Request, res: Response, next: NextFunction): void {
    this.logger.error('SSR rendering error', error);

    // Errors thrown before the service's inner try/catch (e.g. engine not
    // initialized) bypass the user's errorHandler. Invoke it here as a
    // safety net so the request never silently hangs.
    if (this.options.errorHandler && !this.responseAlreadySent(res)) {
      try {
        this.options.errorHandler(error, req, res);
      } catch (handlerError) {
        this.logger.error('Error handler threw', handlerError);
      }
    }

    if (!this.responseAlreadySent(res)) {
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
