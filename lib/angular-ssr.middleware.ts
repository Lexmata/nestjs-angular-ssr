import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { AngularSSRService } from './angular-ssr.service';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type { AngularSSRModuleOptions } from './interfaces';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class AngularSSRMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AngularSSRMiddleware.name);

  constructor(
    private readonly ssrService: AngularSSRService,
    @Inject(ANGULAR_SSR_OPTIONS)
    private readonly options: AngularSSRModuleOptions,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip if already handled or if requesting static assets
    if (res.headersSent) {
      next();
      return;
    }

    // Skip static file requests (common extensions)
    const url = req.originalUrl || req.url;
    if (this.isStaticFileRequest(url)) {
      next();
      return;
    }

    // Skip API routes (customize as needed)
    if (url.startsWith('/api')) {
      next();
      return;
    }

    try {
      const html = await this.ssrService.render(req, res);

      if (html === null) {
        // No response from Angular, pass to next handler
        next();
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      this.logger.error('SSR rendering error', error);

      // If error handler is set and was called, don't continue
      if (this.options.errorHandler) {
        return;
      }

      next(error);
    }
  }

  /**
   * Check if the request is for a static file
   */
  private isStaticFileRequest(url: string): boolean {
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

    const urlPath = url.split('?')[0].toLowerCase();
    return staticExtensions.some((ext) => urlPath.endsWith(ext));
  }
}
