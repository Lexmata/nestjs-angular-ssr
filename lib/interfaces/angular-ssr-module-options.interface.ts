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
 * Error handler function type for SSR rendering errors
 */
export type ErrorHandler = (error: Error, request: Request, response: Response) => void;

/**
 * Angular SSR engine type
 * Supports AngularAppEngine, AngularNodeAppEngine, or CommonEngine
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AngularSSREngine = any;

/**
 * Configuration options for the AngularSSRModule
 */
export interface AngularSSRModuleOptions {
  /**
   * Path to the directory containing the client bundle (Angular browser build)
   * This is typically 'dist/{app-name}/browser'
   */
  browserDistFolder: string;

  /**
   * Path to the server bundle bootstrap function
   * This should be the path to the server entry point
   */
  serverDistFolder?: string;

  /**
   * Path to the index.html template file
   * @default '{browserDistFolder}/index.server.html'
   */
  indexHtml?: string;

  /**
   * The Angular bootstrap function from the server bundle
   * This is the default export from your Angular SSR server entry
   * For CommonEngine: returns the CommonEngine instance
   * For AngularAppEngine/AngularNodeAppEngine: returns the engine instance
   */
  bootstrap: () => Promise<AngularSSREngine>;

  /**
   * The Angular application bootstrap function for CommonEngine
   * Required when using CommonEngine
   * This should be the bootstrapApplication function from your main.server.ts
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  angularBootstrap?: () => Promise<any>;

  /**
   * Route path to render the Angular app
   * @default '*'
   */
  renderPath?: string | string[];

  /**
   * Root path for serving static files
   * @default '*'
   */
  rootStaticPath?: string;

  /**
   * Additional providers to be included during server-side rendering
   */
  extraProviders?: StaticProvider[];

  /**
   * Whether to inline critical CSS to reduce render-blocking
   * @default true
   */
  inlineCriticalCss?: boolean;

  /**
   * Cache configuration
   * Set to false to disable caching, true for default caching,
   * or provide custom cache options
   * @default true
   */
  cache?: boolean | CacheOptions;

  /**
   * Custom error handler for rendering errors
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
