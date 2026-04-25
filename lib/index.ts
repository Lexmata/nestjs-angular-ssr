// Middleware
export { AngularSSRMiddleware } from './angular-ssr.middleware';

// Module
export { AngularSSRModule } from './angular-ssr.module';

// Service
export {
  AngularSSRService,
  DEFAULT_CACHE_EXPIRATION_TIME,
  type SSRRequestContext,
} from './angular-ssr.service';

// Cache implementations
export { DEFAULT_CACHE_MAX_ENTRIES, InMemoryCacheStorage } from './cache/in-memory-cache-storage';
export { NestCacheStorage } from './cache/nest-cache-storage';
export { UrlCacheKeyGenerator } from './cache/url-cache-key-generator';

// Debug logging
export { ANGULAR_SSR_DEBUG_ENV, DebugLogger, isDebugEnabled } from './debug-logger';

// Interfaces
export type {
  AngularEngineType,
  AngularSSRModuleAsyncOptions,
  AngularSSRModuleOptions,
  CacheOptions,
  ErrorHandler,
  SkipPath,
  StaticProvider,
} from './interfaces/angular-ssr-module-options.interface';

export type { CacheKeyGenerator } from './interfaces/cache-key-generator.interface';
export type { CacheEntry, CacheStorage } from './interfaces/cache-storage.interface';

// Module-internal token
export { ANGULAR_SSR_OPTIONS } from './tokens';

// Re-export Angular's request-injection tokens so consumers don't need a
// separate `@angular/core` import in their NestJS module wiring.
export { REQUEST, REQUEST_CONTEXT } from '@angular/core';
