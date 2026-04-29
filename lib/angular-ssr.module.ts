import {
  DynamicModule,
  Global,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
} from '@nestjs/common';
import express from 'express';
import { AngularSSRMiddleware } from './angular-ssr.middleware';
import { AngularSSRService } from './angular-ssr.service';
import { DebugLogger } from './debug-logger';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type { AngularSSRModuleAsyncOptions, AngularSSRModuleOptions } from './interfaces';

// '/{*splat}' is the only wildcard that works under BOTH NestJS 11 and
// Express 5 / path-to-regexp v8. A brief taxonomy of patterns that
// don't:
//   - '*'          — passes NestJS's simple-wildcard list but under
//                    path-to-regexp v8 it is a literal named segment
//                    and never matches the empty root path.
//   - '{/*splat}'  — valid under path-to-regexp v8, but NestJS 11's
//                    `RouteInfoPathExtractor.isAWildcard()` regex
//                    (`/^\/\{.*\}.*|^\/\*.*$/`) requires a leading
//                    forward slash. Without one, NestJS treats the
//                    string as a literal path and the middleware binds
//                    to the exact string `/{*splat}` — never firing
//                    for `/`, `/home`, or any real request. The
//                    library shipped with this default through 0.4.2;
//                    consumers had to override explicitly to work
//                    around the invisible mis-binding.
//   - '/{*splat}'  — starts with `/`, so NestJS treats it as a
//                    wildcard. The splat body matches every path
//                    (root + nested) under path-to-regexp v8. This
//                    is the default every consumer wants.
const DEFAULT_WILDCARD = '/{*splat}';

// `express.static` misbehaves when mounted via `forRoutes('{/*splat}')` —
// Express treats the splat as a named mount segment and strips it from
// the incoming URL before resolving against the static root, which turns
// `/favicon.ico` into a directory lookup and issues a spurious 301 to
// `/favicon.ico/`. Mounting on the literal `'/'` prefix (the traditional
// `app.use('/', express.static(...))` form) sidesteps the splat path
// parser entirely and lets express.static match every request against
// the browserDistFolder as intended.
const STATIC_MOUNT_PATH = '/';

@Global()
@Module({})
export class AngularSSRModule implements NestModule {
  private readonly logger = new DebugLogger(AngularSSRModule.name);

  constructor(
    @Inject(ANGULAR_SSR_OPTIONS)
    private readonly options: AngularSSRModuleOptions,
  ) {}

  /**
   * Configure the module with static options
   */
  static forRoot(options: AngularSSRModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: ANGULAR_SSR_OPTIONS,
      useValue: options,
    };

    return {
      module: AngularSSRModule,
      providers: [optionsProvider, AngularSSRService, AngularSSRMiddleware],
      exports: [AngularSSRService, ANGULAR_SSR_OPTIONS],
    };
  }

  /**
   * Configure the module with async options (factory pattern)
   */
  static forRootAsync(options: AngularSSRModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: Provider = {
      provide: ANGULAR_SSR_OPTIONS,
      useFactory: async (...args: unknown[]) => await options.useFactory(...args),
      inject: options.inject ?? [],
    };

    return {
      module: AngularSSRModule,
      imports: options.imports ?? [],
      providers: [asyncOptionsProvider, AngularSSRService, AngularSSRMiddleware],
      exports: [AngularSSRService, ANGULAR_SSR_OPTIONS],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    const renderPaths = this.getRenderPaths(this.options);
    const staticPath =
      typeof this.options.rootStaticPath === 'string'
        ? this.options.rootStaticPath
        : STATIC_MOUNT_PATH;

    this.logger.debug(`configure() staticPath=${staticPath} renderPaths=${renderPaths.join(',')}`);

    consumer
      .apply(
        express.static(this.options.browserDistFolder, {
          maxAge: '1y',
          index: false, // Don't serve index.html for directory requests
        }),
      )
      .forRoutes(staticPath);

    consumer.apply(AngularSSRMiddleware).forRoutes(...renderPaths);
  }

  private getRenderPaths(options: AngularSSRModuleOptions): string[] {
    if (!options.renderPath) {
      return [DEFAULT_WILDCARD];
    }
    if (Array.isArray(options.renderPath)) {
      return options.renderPath;
    }
    return [options.renderPath];
  }
}
