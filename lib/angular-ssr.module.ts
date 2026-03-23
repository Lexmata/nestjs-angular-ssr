import {
  DynamicModule,
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
} from '@nestjs/common';
import * as express from 'express';
import { AngularSSRMiddleware } from './angular-ssr.middleware';
import { AngularSSRService } from './angular-ssr.service';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type { AngularSSRModuleAsyncOptions, AngularSSRModuleOptions } from './interfaces';

@Global()
@Module({})
export class AngularSSRModule implements NestModule {
  private static options: AngularSSRModuleOptions | undefined;

  /**
   * Configure the module with static options
   */
  static forRoot(options: AngularSSRModuleOptions): DynamicModule {
    AngularSSRModule.options = options;

    const optionsProvider: Provider = {
      provide: ANGULAR_SSR_OPTIONS,
      useValue: options,
    };

    return {
      module: AngularSSRModule,
      providers: [optionsProvider, AngularSSRService],
      exports: [AngularSSRService, ANGULAR_SSR_OPTIONS],
    };
  }

  /**
   * Configure the module with async options (factory pattern)
   */
  static forRootAsync(options: AngularSSRModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: Provider = {
      provide: ANGULAR_SSR_OPTIONS,
      useFactory: async (...args: unknown[]) => {
        const resolvedOptions = await options.useFactory(...args);
        AngularSSRModule.options = resolvedOptions;
        return resolvedOptions;
      },
      inject: options.inject ?? [],
    };

    return {
      module: AngularSSRModule,
      imports: options.imports ?? [],
      providers: [asyncOptionsProvider, AngularSSRService],
      exports: [AngularSSRService, ANGULAR_SSR_OPTIONS],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    const options = AngularSSRModule.options;

    if (!options) {
      throw new Error('AngularSSRModule options not configured. Use forRoot() or forRootAsync().');
    }

    // Determine render paths
    const renderPaths = this.getRenderPaths(options);

    // Serve static files from the browser distribution folder
    const staticPath = typeof options.rootStaticPath === 'string' ? options.rootStaticPath : '*';

    consumer
      .apply(
        express.static(options.browserDistFolder, {
          maxAge: '1y',
          index: false, // Don't serve index.html for directory requests
        }),
      )
      .forRoutes(staticPath);

    // Apply SSR middleware for render paths
    consumer.apply(AngularSSRMiddleware).forRoutes(...renderPaths);
  }

  /**
   * Get the render paths from options
   */
  private getRenderPaths(options: AngularSSRModuleOptions): string[] {
    if (!options.renderPath) {
      return ['*'];
    }

    if (Array.isArray(options.renderPath)) {
      return options.renderPath;
    }

    return [options.renderPath];
  }
}
