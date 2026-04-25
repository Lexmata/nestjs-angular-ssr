import { join } from 'node:path';
import { REQUEST, REQUEST_CONTEXT } from '@angular/core';
import { AngularAppEngine } from '@angular/ssr';
import {
  AngularNodeAppEngine,
  CommonEngine,
  createWebRequestFromNodeRequest,
} from '@angular/ssr/node';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InMemoryCacheStorage } from './cache/in-memory-cache-storage';
import { UrlCacheKeyGenerator } from './cache/url-cache-key-generator';
import { DebugLogger } from './debug-logger';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type {
  AfterRenderContext,
  AngularSSRModuleOptions,
  CacheKeyGenerator,
  CacheOptions,
  CacheStorage,
  StaticProvider,
} from './interfaces';
import type { Request, Response } from 'express';

/**
 * Default cache expiration time in milliseconds (1 minute)
 */
export const DEFAULT_CACHE_EXPIRATION_TIME = 60_000;

type AngularEngine = AngularAppEngine | AngularNodeAppEngine | CommonEngine;

/**
 * Per-render context surfaced to Angular components via `@angular/core`'s
 * `REQUEST_CONTEXT` injection token. Available on every engine path.
 */
export interface SSRRequestContext {
  request: Request;
  response: Response;
}

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
      this.cacheStorage = cacheOptions.storage ?? new InMemoryCacheStorage(cacheOptions.maxEntries);
      this.cacheKeyGenerator = cacheOptions.keyGenerator ?? new UrlCacheKeyGenerator();
      this.cacheExpiresIn = cacheOptions.expiresIn ?? DEFAULT_CACHE_EXPIRATION_TIME;
    } else {
      this.cacheStorage = new InMemoryCacheStorage();
      this.cacheKeyGenerator = new UrlCacheKeyGenerator();
      this.cacheExpiresIn = DEFAULT_CACHE_EXPIRATION_TIME;
    }
  }

  async onModuleInit(): Promise<void> {
    let engine: AngularEngine | null | undefined;
    try {
      engine = (await this.options.bootstrap()) as AngularEngine | null | undefined;
    } catch (error) {
      this.logger.error('Failed to initialize Angular SSR engine', error);
      throw error;
    }
    // Surface bad user configuration as a clear message instead of the
    // `Cannot read properties of null (reading 'constructor')` TypeError
    // that a bare .constructor.name access would produce.
    if (engine === null || engine === undefined) {
      const resolvedTo = engine === null ? 'null' : 'undefined';
      const message = `AngularSSRModuleOptions.bootstrap() resolved to ${resolvedTo}; expected an AngularAppEngine, AngularNodeAppEngine, or CommonEngine instance.`;
      this.logger.error(message);
      throw new Error(message);
    }
    this.angularEngine = engine;
    this.logger.log(`Angular SSR engine initialized (${engine.constructor.name})`);
  }

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
   * Detect the engine variant. Defaults to `instanceof` against the real
   * `@angular/ssr` classes (minification-safe). `options.engineType`
   * overrides for test fixtures or unusual setups.
   */
  private isCommonEngine(engine: AngularEngine): engine is CommonEngine {
    if (this.options.engineType === 'common') {
      return true;
    }
    if (this.options.engineType !== undefined) {
      return false;
    }
    return engine instanceof CommonEngine;
  }

  private isNodeAppEngine(engine: AngularEngine): engine is AngularNodeAppEngine {
    if (this.options.engineType === 'node-app') {
      return true;
    }
    if (this.options.engineType !== undefined) {
      return false;
    }
    return engine instanceof AngularNodeAppEngine;
  }

  async render(request: Request, response: Response): Promise<string | null> {
    if (!this.angularEngine) {
      throw new Error('Angular SSR engine not initialized');
    }

    const cacheable = this.isCacheable(request);
    const cacheKey = cacheable ? this.cacheKeyGenerator.generateCacheKey(request) : null;

    if (cacheKey !== null) {
      const cached = await this.cacheStorage.get(cacheKey);
      if (cached) {
        if (this.logger.enabled()) {
          this.logger.debug(`Cache hit (key=${cacheKey})`);
        }
        return cached.content;
      }
    }

    // URL is computed once per render and passed through. Previously it
    // was recomputed by `renderWithCommonEngine`, `applyAfterRender`, and
    // the catch-block log — three calls per cacheable miss under the
    // common configuration.
    const url = this.getRequestUrl(request);

    try {
      const rendered = await this.invokeEngine(this.angularEngine, request, response, url);
      const html = await this.applyAfterRender(rendered, { request, response, url });

      if (cacheKey !== null && html) {
        await this.cacheStorage.set(cacheKey, {
          content: html,
          expiresAt: Date.now() + this.cacheExpiresIn,
        });
      }

      return html;
    } catch (error) {
      this.logger.error(`Error rendering: ${url}`, error);

      if (this.options.errorHandler) {
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
      return await this.renderWithCommonEngine(engine, request, response, url);
    }
    const angularRequest: Request | globalThis.Request = this.isNodeAppEngine(engine)
      ? request
      : createWebRequestFromNodeRequest(request);
    return await this.handleAngularEngine(engine, angularRequest, { request, response });
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

    // Provide the same Angular tokens that AngularAppEngine /
    // AngularNodeAppEngine wire automatically: REQUEST holds a Web Fetch
    // Request and REQUEST_CONTEXT carries arbitrary per-render data
    // (here: the original Express request + response).
    const requestContext: SSRRequestContext = { request, response };
    const providers: StaticProvider[] = [
      ...(this.options.extraProviders ?? []),
      { provide: REQUEST, useValue: createWebRequestFromNodeRequest(request) },
      { provide: REQUEST_CONTEXT, useValue: requestContext },
    ];

    return await engine.render({
      bootstrap,
      documentFilePath,
      publicPath: this.options.browserDistFolder,
      url,
      inlineCriticalCss: this.options.inlineCriticalCss ?? true,
      providers,
    });
  }

  private async handleAngularEngine(
    engine: AngularNodeAppEngine | AngularAppEngine,
    request: Request | globalThis.Request,
    requestContext: SSRRequestContext,
  ): Promise<string | null> {
    const handle = engine.handle.bind(engine) as (
      r: Request | globalThis.Request,
      ctx?: SSRRequestContext,
    ) => Promise<{ text: () => Promise<string> } | null | undefined> | null;
    const angularResponse = await handle(request, requestContext);
    if (!angularResponse) {
      return null;
    }
    return await angularResponse.text();
  }

  /**
   * Run the configured `afterRender` pipeline against the engine's HTML
   * output. Each transform sees the previous transform's result; the
   * final value is what the service caches (if cacheable) and returns.
   *
   * Null input (the "engine produced no response" path) short-circuits —
   * transforms never see `null`.
   */
  private async applyAfterRender(
    html: string | null,
    context: AfterRenderContext,
  ): Promise<string | null> {
    const transforms = this.options.afterRender;
    if (html === null || !transforms?.length) {
      return html;
    }
    let current = html;
    for (const transform of transforms) {
      current = await transform(current, context);
    }
    return current;
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
