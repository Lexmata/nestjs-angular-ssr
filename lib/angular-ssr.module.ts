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

// '{/*splat}' is the NestJS 11 / Express 5 / path-to-regexp v8 splat
// syntax that matches both '/' and every nested path. Override via
// renderPath / rootStaticPath for a tighter mount point.
const DEFAULT_WILDCARD = '{/*splat}';

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
        : DEFAULT_WILDCARD;

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
