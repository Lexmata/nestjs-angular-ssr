import { join } from 'node:path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InMemoryCacheStorage } from './cache/in-memory-cache-storage';
import { UrlCacheKeyGenerator } from './cache/url-cache-key-generator';
import { DebugLogger } from './debug-logger';
import { ANGULAR_SSR_OPTIONS, REQUEST, RESPONSE } from './tokens';
import type {
  AngularSSRModuleOptions,
  CacheKeyGenerator,
  CacheOptions,
  CacheStorage,
  StaticProvider,
} from './interfaces';
import type { AngularAppEngine } from '@angular/ssr';
import type { AngularNodeAppEngine, CommonEngine } from '@angular/ssr/node';
import type { Request, Response } from 'express';

/**
 * Default cache expiration time in milliseconds (1 minute)
 */
export const DEFAULT_CACHE_EXPIRATION_TIME = 60_000;

type AngularEngine = AngularAppEngine | AngularNodeAppEngine | CommonEngine;

@Injectable()
export class AngularSSRService implements OnModuleInit {
  private readonly logger = new DebugLogger(AngularSSRService.name);
  private angularEngine: AngularEngine | null = null;

  private readonly cacheEnabled: boolean;
  private readonly cacheStorage: CacheStorage;
  private readonly cacheKeyGenerator: CacheKeyGenerator;
  private readonly cacheExpiresIn: number;

  constructor(
    @Inject(ANGULAR_SSR_OPTIONS)
    private readonly options: AngularSSRModuleOptions,
  ) {
    const cacheOptions = this.resolveCacheOptions(options.cache);
    this.cacheEnabled = cacheOptions !== false;

    if (this.cacheEnabled && cacheOptions) {
      this.cacheStorage = cacheOptions.storage ?? new InMemoryCacheStorage();
      this.cacheKeyGenerator = cacheOptions.keyGenerator ?? new UrlCacheKeyGenerator();
      this.cacheExpiresIn = cacheOptions.expiresIn ?? DEFAULT_CACHE_EXPIRATION_TIME;
    } else {
      this.cacheStorage = new InMemoryCacheStorage();
      this.cacheKeyGenerator = new UrlCacheKeyGenerator();
      this.cacheExpiresIn = DEFAULT_CACHE_EXPIRATION_TIME;
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.debug(
      `Bootstrapping Angular SSR engine (engineType=${
        this.options.engineType ?? 'auto'
      }, browserDistFolder=${this.options.browserDistFolder})`,
    );
    try {
      this.angularEngine = (await this.options.bootstrap()) as AngularEngine;
      this.logger.log(
        `Angular SSR engine initialized (constructor=${this.angularEngine.constructor.name})`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Angular SSR engine', error);
      throw error;
    }
  }

  /**
   * Resolve cache options from the provided configuration
   */
  private resolveCacheOptions(cache: boolean | CacheOptions | undefined): CacheOptions | false {
    if (cache === false) {
      return false;
    }
    if (cache === true || cache === undefined) {
      return {};
    }
    return cache;
  }

  /**
   * Detect the engine variant via duck-typing, with `options.engineType` as
   * an explicit override for minified production builds where class names
   * are unreliable.
   */
  private isCommonEngine(engine: AngularEngine): engine is CommonEngine {
    if (this.options.engineType === 'common') {
      return true;
    }
    if (this.options.engineType !== undefined) {
      return false;
    }
    const candidate = engine as unknown as { render?: unknown; handle?: unknown };
    return typeof candidate.render === 'function' && typeof candidate.handle !== 'function';
  }

  private isNodeAppEngine(engine: AngularEngine): engine is AngularNodeAppEngine {
    if (this.options.engineType === 'node-app') {
      return true;
    }
    if (this.options.engineType !== undefined) {
      return false;
    }
    return engine.constructor.name === 'AngularNodeAppEngine';
  }

  /**
   * Render the Angular application for the given request.
   */

  async render(request: Request, response: Response): Promise<string | null> {
    if (!this.angularEngine) {
      throw new Error('Angular SSR engine not initialized');
    }

    const url = this.getRequestUrl(request);
    const cacheable = this.isCacheable(request);

    this.logger.debug(`render() ${request.method} ${url} (cacheable=${String(cacheable)})`);

    if (cacheable) {
      const cacheKey = this.cacheKeyGenerator.generateCacheKey(request);
      const cached = await this.cacheStorage.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit (key=${cacheKey})`);
        return cached.content;
      }
      this.logger.debug(`Cache miss (key=${cacheKey})`);
    }

    try {
      const html = await this.invokeEngine(this.angularEngine, request, response, url);

      if (cacheable && html) {
        const cacheKey = this.cacheKeyGenerator.generateCacheKey(request);
        await this.cacheStorage.set(cacheKey, {
          content: html,
          expiresAt: Date.now() + this.cacheExpiresIn,
        });
        this.logger.debug(
          `Cached response (key=${cacheKey}, ttlMs=${String(this.cacheExpiresIn)}, bytes=${String(html.length)})`,
        );
      } else if (html === null) {
        this.logger.debug(`Engine returned null for ${url}`);
      }

      return html;
    } catch (error) {
      this.logger.error(`Error rendering: ${url}`, error);

      if (this.options.errorHandler) {
        this.logger.debug('Delegating to user-supplied errorHandler');
        this.options.errorHandler(error as Error, request, response);
        return null;
      }

      throw error;
    }
  }

  private async invokeEngine(
    engine: AngularEngine,
    request: Request,
    response: Response,
    url: string,
  ): Promise<string | null> {
    if (this.isCommonEngine(engine)) {
      this.logger.debug('Routing to CommonEngine.render()');
      return await this.renderWithCommonEngine(engine, request, response, url);
    }
    if (this.isNodeAppEngine(engine)) {
      this.logger.debug('Routing to AngularNodeAppEngine.handle()');
      return await this.renderWithNodeAppEngine(engine, request, response);
    }
    this.logger.debug('Routing to AngularAppEngine.handle()');
    return await this.renderWithAppEngine(engine, request, response);
  }

  private async renderWithCommonEngine(
    engine: CommonEngine,
    request: Request,
    response: Response,
    url: string,
  ): Promise<string | null> {
    const documentFilePath =
      this.options.indexHtml ?? join(this.options.browserDistFolder, 'index.server.html');

    const bootstrap = (
      this.options.angularBootstrap ? await this.options.angularBootstrap() : undefined
    ) as Parameters<CommonEngine['render']>[0]['bootstrap'];

    const providers: StaticProvider[] = [
      ...(this.options.extraProviders ?? []),
      { provide: REQUEST, useValue: request },
      { provide: RESPONSE, useValue: response },
    ];

    return await engine.render({
      bootstrap,
      documentFilePath,
      publicPath: this.options.browserDistFolder,
      url,
      inlineCriticalCss: this.options.inlineCriticalCss ?? true,
      // CommonEngine's StaticProvider type comes from @angular/core; ours is
      // a structurally-compatible mirror so consumers don't need an Angular
      // import in their NestJS module.
      providers: providers as never,
    });
  }

  private async renderWithNodeAppEngine(
    engine: AngularNodeAppEngine,
    request: Request,
    response: Response,
  ): Promise<string | null> {
    // engine.handle accepts (req, requestContext?). Express's Request extends
    // Node's IncomingMessage, which is what AngularNodeAppEngine expects.
    const handle = engine.handle.bind(engine) as (
      r: Request,
      ctx?: Record<string, unknown>,
    ) => Promise<Response | null | undefined> | null;
    const angularResponse = await handle(request, { response });
    if (!angularResponse) {
      return null;
    }
    return await (angularResponse as unknown as { text: () => Promise<string> }).text();
  }

  private async renderWithAppEngine(
    engine: AngularAppEngine,
    request: Request,
    response: Response,
  ): Promise<string | null> {
    const angularRequest = this.createAngularRequest(request);
    const handle = engine.handle.bind(engine) as (
      r: globalThis.Request,
      ctx?: Record<string, unknown>,
    ) => Promise<Response | null | undefined> | null;
    const angularResponse = await handle(angularRequest, { response });
    if (!angularResponse) {
      return null;
    }
    return await (angularResponse as unknown as { text: () => Promise<string> }).text();
  }

  /**
   * Only GET and HEAD requests are cacheable.
   */
  private isCacheable(request: Request): boolean {
    return this.cacheEnabled && (request.method === 'GET' || request.method === 'HEAD');
  }

  /**
   * Get the full URL from the Express request
   */
  private getRequestUrl(request: Request): string {
    const protocol = request.protocol;
    const host = request.get('host') ?? 'localhost';
    const originalUrl = request.originalUrl || request.url || '/';
    return `${protocol}://${host}${originalUrl}`;
  }

  /**
   * Create a native Request object compatible with Angular SSR
   */
  private createAngularRequest(expressRequest: Request): globalThis.Request {
    const url = this.getRequestUrl(expressRequest);

    const headers = new Headers();
    for (const [key, value] of Object.entries(expressRequest.headers)) {
      if (!value) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    return new Request(url, {
      method: expressRequest.method,
      headers,
    });
  }

  /**
   * Clear the render cache
   */
  async clearCache(): Promise<void> {
    if (this.cacheEnabled) {
      await this.cacheStorage.clear();
      this.logger.log('SSR cache cleared');
    }
  }

  /**
   * Invalidate a specific cache entry
   */
  async invalidateCache(key: string): Promise<boolean> {
    if (this.cacheEnabled) {
      return await this.cacheStorage.delete(key);
    }
    return false;
  }
}
