import type { CacheKeyGenerator } from './cache-key-generator.interface';
import type { CacheStorage } from './cache-storage.interface';
import type { StaticProvider as AngularStaticProvider } from '@angular/core';
import type { Request, Response } from 'express';

/**
 * Provider type alias for Angular's `StaticProvider`. Re-exported so
 * consumers can write `extraProviders` without a separate `@angular/core`
 * import.
 */
export type StaticProvider = AngularStaticProvider;

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

  /**
   * Maximum entries kept by the default `InMemoryCacheStorage` before LRU
   * eviction kicks in. Ignored when a custom `storage` is supplied.
   *
   * @default 1024
   */
  maxEntries?: number;
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
 * Per-render context passed to `AfterRenderTransform` functions.
 */
export interface AfterRenderContext {
  request: Request;
  response: Response;
  /**
   * The full request URL (protocol + host + originalUrl). Provided so
   * transforms don't have to reconstruct it from the Express request.
   */
  url: string;
}

/**
 * A single stage in the post-render HTML transform pipeline. See the
 * `afterRender` option on `AngularSSRModuleOptions` for pipeline
 * semantics and cache interaction.
 */
export type AfterRenderTransform = (
  html: string,
  context: AfterRenderContext,
) => string | Promise<string>;

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
   * Gracefully degrade when the Angular build artefacts aren't present at
   * bootstrap time. Useful for dev loops where the API backend is run
   * directly from source (e.g. `tsx src/server/main.ts`) before any
   * `ng build` has emitted the manifest, or when a separate dev server
   * (`ng serve`) is handling frontend SSR.
   *
   * When `true` and `bootstrap()` throws `ERR_MODULE_NOT_FOUND`, the
   * service logs a warning, stays in a disabled state, and the
   * middleware forwards every request to `next()` (no SSR). Any other
   * bootstrap error is still thrown — only the module-not-found class
   * is swallowed.
   *
   * Leave `false` in production: a missing manifest there is a real bug
   * that should crash the container so the deploy rolls back.
   *
   * @default false
   */
  allowMissingBuild?: boolean;

  /**
   * Route path(s) on which the SSR middleware will run. Default
   * `'{/*splat}'` is the NestJS 11 / Express 5 / path-to-regexp v8 splat
   * pattern that matches both root `/` and every nested path.
   *
   * @default '{/*splat}'
   */
  renderPath?: string | string[];

  /**
   * Route path on which `express.static()` will serve files from
   * `browserDistFolder`.
   *
   * Same wildcard caveats apply as for `renderPath`.
   *
   * @default '{/*splat}'
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

  /**
   * Ordered pipeline of post-render HTML transforms. Each transform sees
   * the output of the previous one and can mutate the HTML string (inject
   * a CSP nonce, add tracking tags, minify, rewrite asset paths, etc.).
   *
   * Transforms run BEFORE the cache write, so cached HTML reflects the
   * transforms. If a transform produces per-request output that shouldn't
   * be cached (e.g. a CSP nonce), disable caching for affected routes.
   */
  afterRender?: AfterRenderTransform[];
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
