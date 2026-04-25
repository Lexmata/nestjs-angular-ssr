import type { CacheKeyGenerator } from './cache-key-generator.interface';
import type { CacheStorage } from './cache-storage.interface';
import type { Request, Response } from 'express';

/**
 * Provider type compatible with Angular's StaticProvider
 */
export interface StaticProvider {
  provide: unknown;
  useValue?: unknown;
  useClass?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  useFactory?: Function;
  deps?: unknown[];
  multi?: boolean;
}

/**
 * Cache configuration options for Angular SSR
 */
export interface CacheOptions {
  /**
   * Cache expiration time in milliseconds
   * @default 60000 (1 minute)
   */
  expiresIn?: number;

  /**
   * Custom cache storage implementation
   * @default InMemoryCacheStorage
   */
  storage?: CacheStorage;

  /**
   * Custom cache key generator
   * @default URL-based key generator
   */
  keyGenerator?: CacheKeyGenerator;
}

/**
 * Error handler function type for SSR rendering errors.
 * If the handler writes a response (e.g. res.status(500).send(...)) the
 * middleware detects res.headersSent and stops the chain. If it does not,
 * the original error is forwarded to next() so Nest can handle it.
 */
export type ErrorHandler = (error: Error, request: Request, response: Response) => void;

/**
 * Angular SSR engine variant.
 *
 * Used as an explicit override when constructor-name detection is unreliable
 * (e.g. in heavily minified production bundles where class names are mangled).
 *
 * - `common` — `CommonEngine` from `@angular/ssr/node`
 * - `node-app` — `AngularNodeAppEngine` from `@angular/ssr/node`
 * - `app` — `AngularAppEngine` from `@angular/ssr`
 */
export type AngularEngineType = 'common' | 'node-app' | 'app';

/**
 * Path-skip rule for the SSR middleware. Paths matching any of these are
 * passed straight to next() without invoking SSR.
 */
export type SkipPath = string | RegExp;

/**
 * Angular SSR engine instance type.
 * Supports AngularAppEngine, AngularNodeAppEngine, or CommonEngine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AngularSSREngine = any;

/**
 * Configuration options for the AngularSSRModule
 */
export interface AngularSSRModuleOptions {
  /**
   * Path to the directory containing the client bundle (Angular browser build).
   * Typically `dist/{app-name}/browser`.
   */
  browserDistFolder: string;

  /**
   * Path to the server bundle directory.
   */
  serverDistFolder?: string;

  /**
   * Path to the index.html template file.
   * @default `{browserDistFolder}/index.server.html`
   */
  indexHtml?: string;

  /**
   * Returns the Angular SSR engine instance.
   *
   * For `CommonEngine`: return the `CommonEngine` instance.
   * For `AngularAppEngine` / `AngularNodeAppEngine`: return the engine instance.
   */
  bootstrap: () => Promise<AngularSSREngine>;

  /**
   * Application bootstrap function used by `CommonEngine`.
   * Should be the `bootstrapApplication`-returning default export from
   * `main.server.ts`.
   *
   * Ignored for `AngularAppEngine` and `AngularNodeAppEngine`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  angularBootstrap?: () => Promise<any>;

  /**
   * Explicit engine type override. When set, disables runtime detection.
   * Recommended for production builds where class names may be minified.
   */
  engineType?: AngularEngineType;

  /**
   * Route path(s) on which the SSR middleware will run.
   *
   * Default `'*splat'` (NestJS 11 / path-to-regexp 8 wildcard). For NestJS 10
   * with path-to-regexp 6, supply `'*'` (or any other syntax your version
   * accepts) explicitly.
   *
   * @default '*splat'
   */
  renderPath?: string | string[];

  /**
   * Route path on which `express.static()` will serve files from
   * `browserDistFolder`.
   *
   * Same wildcard caveats apply as for `renderPath`.
   *
   * @default '*splat'
   */
  rootStaticPath?: string;

  /**
   * Paths to skip in the SSR middleware (passed straight to `next()`).
   * Useful for API prefixes that share the wildcard render path.
   *
   * @default ['/api']
   */
  skipPaths?: SkipPath[];

  /**
   * Additional providers to be included during server-side rendering.
   * Only applied to the `CommonEngine` path.
   */
  extraProviders?: StaticProvider[];

  /**
   * Whether to inline critical CSS to reduce render-blocking.
   * Only applied to the `CommonEngine` path; `AngularAppEngine`/
   * `AngularNodeAppEngine` handle this internally per their own config.
   *
   * @default true
   */
  inlineCriticalCss?: boolean;

  /**
   * Cache configuration. `false` disables caching, `true` uses defaults,
   * or pass `CacheOptions` for fine-grained control.
   *
   * Only `GET` and `HEAD` requests are ever cached.
   *
   * @default true
   */
  cache?: boolean | CacheOptions;

  /**
   * Custom error handler for rendering errors. See `ErrorHandler` for the
   * contract on writing responses.
   */
  errorHandler?: ErrorHandler;
}

/**
 * Async options for configuring AngularSSRModule with factory pattern
 */
export interface AngularSSRModuleAsyncOptions {
  /**
   * Optional imports for the module configuration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  imports?: any[];

  /**
   * Factory function to create module options
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => Promise<AngularSSRModuleOptions> | AngularSSRModuleOptions;

  /**
   * Dependencies to inject into the factory function
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inject?: any[];
}
