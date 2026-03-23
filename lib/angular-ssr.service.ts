import { join } from 'node:path';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InMemoryCacheStorage } from './cache/in-memory-cache-storage';
import { UrlCacheKeyGenerator } from './cache/url-cache-key-generator';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type {
  AngularSSRModuleOptions,
  CacheKeyGenerator,
  CacheOptions,
  CacheStorage,
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
  private readonly logger = new Logger(AngularSSRService.name);
  private angularEngine: AngularEngine | null = null;

  private readonly cacheEnabled: boolean;
  private readonly cacheStorage: CacheStorage;
  private readonly cacheKeyGenerator: CacheKeyGenerator;
  private readonly cacheExpiresIn: number;

  constructor(
    @Inject(ANGULAR_SSR_OPTIONS)
    private readonly options: AngularSSRModuleOptions,
  ) {
    // Initialize cache settings
    const cacheOptions = this.resolveCacheOptions(options.cache);
    this.cacheEnabled = cacheOptions !== false;

    if (this.cacheEnabled && cacheOptions) {
      this.cacheStorage = cacheOptions.storage ?? new InMemoryCacheStorage();
      this.cacheKeyGenerator = cacheOptions.keyGenerator ?? new UrlCacheKeyGenerator();
      this.cacheExpiresIn = cacheOptions.expiresIn ?? DEFAULT_CACHE_EXPIRATION_TIME;
    } else {
      // Initialize with defaults even if disabled (for type safety)
      this.cacheStorage = new InMemoryCacheStorage();
      this.cacheKeyGenerator = new UrlCacheKeyGenerator();
      this.cacheExpiresIn = DEFAULT_CACHE_EXPIRATION_TIME;
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      this.angularEngine = (await this.options.bootstrap()) as AngularEngine;
      this.logger.log('Angular SSR engine initialized successfully');
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
   * Check if the engine is a CommonEngine
   */
  private isCommonEngine(engine: AngularEngine): engine is CommonEngine {
    return engine.constructor.name === 'CommonEngine' || 'render' in engine;
  }

  /**
   * Check if the engine is an AngularNodeAppEngine
   */
  private isNodeAppEngine(engine: AngularEngine): engine is AngularNodeAppEngine {
    return engine.constructor.name === 'AngularNodeAppEngine';
  }

  /**
   * Render the Angular application for the given request
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- engine branches (Common / Node / Fetch)
  async render(request: Request, response: Response): Promise<string | null> {
    if (!this.angularEngine) {
      throw new Error('Angular SSR engine not initialized');
    }

    const url = this.getRequestUrl(request);

    // Check cache first
    if (this.cacheEnabled) {
      const cacheKey = this.cacheKeyGenerator.generateCacheKey(request);
      const cached = await this.cacheStorage.get(cacheKey);

      if (cached) {
        this.logger.debug(`Cache hit for: ${url}`);
        return cached.content;
      }
    }

    try {
      let html: string | null = null;

      if (this.isCommonEngine(this.angularEngine)) {
        // For CommonEngine, use the render method
        const documentFilePath =
          this.options.indexHtml ?? join(this.options.browserDistFolder, 'index.server.html');

        // Get the actual bootstrap function (angularBootstrap returns a Promise that resolves to it)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- user-provided bootstrap
        const bootstrap = this.options.angularBootstrap
          ? await this.options.angularBootstrap()
          : undefined;

        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Angular CommonEngine.render API */
        html = await this.angularEngine.render({
          bootstrap,
          documentFilePath,
          url,
          providers: this.options.extraProviders as any,
        });
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      } else if (this.isNodeAppEngine(this.angularEngine)) {
        // For AngularNodeAppEngine, pass the Express request directly
        const angularResponse = await this.angularEngine.handle(request);
        if (angularResponse) {
          html = await angularResponse.text();
        }
      } else {
        // For AngularAppEngine, create a fetch API Request
        const angularRequest = this.createAngularRequest(request);
        const angularResponse = await this.angularEngine.handle(angularRequest);
        if (angularResponse) {
          html = await angularResponse.text();
        }
      }

      // Store in cache
      if (this.cacheEnabled && html) {
        const cacheKey = this.cacheKeyGenerator.generateCacheKey(request);
        await this.cacheStorage.set(cacheKey, {
          content: html,
          expiresAt: Date.now() + this.cacheExpiresIn,
        });
        this.logger.debug(`Cached response for: ${url}`);
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

    // Convert Express headers to Headers object
    const headers = new Headers();
    for (const [key, value] of Object.entries(expressRequest.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else {
          headers.set(key, value);
        }
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
