import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AngularSSRModule } from './angular-ssr.module';
import { AngularSSRService } from './angular-ssr.service';
import { ANGULAR_SSR_OPTIONS } from './tokens';
import type { AngularSSRModuleAsyncOptions, AngularSSRModuleOptions } from './interfaces';
import type { MiddlewareConsumer } from '@nestjs/common';

describe('AngularSSRModule', () => {
  let mockOptions: AngularSSRModuleOptions;

  beforeEach(() => {
    mockOptions = {
      browserDistFolder: '/dist/browser',
      bootstrap: vi.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset the static options
    (AngularSSRModule as any).options = undefined;
  });

  describe('forRoot()', () => {
    it('should return a DynamicModule with correct configuration', () => {
      const result = AngularSSRModule.forRoot(mockOptions);

      expect(result).toBeDefined();
      expect(result.module).toBe(AngularSSRModule);
      expect(result.providers).toBeDefined();
      expect(result.exports).toBeDefined();
    });

    it('should include options provider', () => {
      const result = AngularSSRModule.forRoot(mockOptions);

      const optionsProvider = result.providers?.find((p: any) => p.provide === ANGULAR_SSR_OPTIONS);

      expect(optionsProvider).toBeDefined();
      expect((optionsProvider as any).useValue).toBe(mockOptions);
    });

    it('should include AngularSSRService provider', () => {
      const result = AngularSSRModule.forRoot(mockOptions);

      expect(result.providers).toContain(AngularSSRService);
    });

    it('should export AngularSSRService', () => {
      const result = AngularSSRModule.forRoot(mockOptions);

      expect(result.exports).toContain(AngularSSRService);
    });

    it('should export ANGULAR_SSR_OPTIONS', () => {
      const result = AngularSSRModule.forRoot(mockOptions);

      expect(result.exports).toContain(ANGULAR_SSR_OPTIONS);
    });
  });

  describe('forRootAsync()', () => {
    it('should return a DynamicModule with async configuration', () => {
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: () => mockOptions,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      expect(result).toBeDefined();
      expect(result.module).toBe(AngularSSRModule);
    });

    it('should include async options provider with factory', () => {
      const factory = vi.fn().mockReturnValue(mockOptions);
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: factory,
        inject: ['SomeDependency'],
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      const optionsProvider = result.providers?.find((p: any) => p.provide === ANGULAR_SSR_OPTIONS);

      expect(optionsProvider).toBeDefined();
      expect((optionsProvider as any).useFactory).toBeDefined();
      expect((optionsProvider as any).inject).toEqual(['SomeDependency']);
    });

    it('should include imports from async options', () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- token class for Nest imports array
      const mockModule = class MockModule {};
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        imports: [mockModule],
        useFactory: () => mockOptions,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      expect(result.imports).toContain(mockModule);
    });

    it('should use empty array for inject when not provided', () => {
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: () => mockOptions,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      const optionsProvider = result.providers?.find((p: any) => p.provide === ANGULAR_SSR_OPTIONS);

      expect((optionsProvider as any).inject).toEqual([]);
    });

    it('should use empty array for imports when not provided', () => {
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: () => mockOptions,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      expect(result.imports).toEqual([]);
    });

    it('should call factory and store resolved options', async () => {
      const factory = vi.fn().mockResolvedValue(mockOptions);
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: factory,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      const optionsProvider = result.providers?.find((p: any) => p.provide === ANGULAR_SSR_OPTIONS);

      // Call the factory
      const resolvedOptions = await (optionsProvider as any).useFactory();

      expect(factory).toHaveBeenCalled();
      expect(resolvedOptions).toBe(mockOptions);
    });
  });

  describe('configure()', () => {
    let module: AngularSSRModule;
    let mockConsumer: MiddlewareConsumer;
    let applyResult: { forRoutes: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      module = new AngularSSRModule();
      applyResult = {
        forRoutes: vi.fn().mockReturnThis(),
      };
      mockConsumer = {
        apply: vi.fn().mockReturnValue(applyResult),
      } as unknown as MiddlewareConsumer;
    });

    it('should throw error if options not configured', () => {
      expect(() => module.configure(mockConsumer)).toThrow(
        'AngularSSRModule options not configured. Use forRoot() or forRootAsync().',
      );
    });

    it('should apply static file middleware', () => {
      AngularSSRModule.forRoot(mockOptions);

      module.configure(mockConsumer);

      expect(mockConsumer.apply).toHaveBeenCalled();
    });

    it('should use default render path "*" when not specified', () => {
      AngularSSRModule.forRoot(mockOptions);

      module.configure(mockConsumer);

      // Should be called for static files and SSR
      expect(applyResult.forRoutes).toHaveBeenCalledWith('*');
    });

    it('should use custom render path when specified as string', () => {
      const optionsWithPath: AngularSSRModuleOptions = {
        ...mockOptions,
        renderPath: '/app/*',
      };
      AngularSSRModule.forRoot(optionsWithPath);

      module.configure(mockConsumer);

      expect(applyResult.forRoutes).toHaveBeenCalledWith('/app/*');
    });

    it('should use custom render paths when specified as array', () => {
      const optionsWithPaths: AngularSSRModuleOptions = {
        ...mockOptions,
        renderPath: ['/app', '/dashboard'],
      };
      AngularSSRModule.forRoot(optionsWithPaths);

      module.configure(mockConsumer);

      expect(applyResult.forRoutes).toHaveBeenCalledWith('/app', '/dashboard');
    });

    it('should use custom static path when specified', () => {
      const optionsWithStaticPath: AngularSSRModuleOptions = {
        ...mockOptions,
        rootStaticPath: '/static/*',
      };
      AngularSSRModule.forRoot(optionsWithStaticPath);

      module.configure(mockConsumer);

      expect(applyResult.forRoutes).toHaveBeenCalledWith('/static/*');
    });
  });
});
