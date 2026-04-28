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

      const optionsProvider = result.providers?.find(
        (p): p is { provide: symbol; useValue: AngularSSRModuleOptions } =>
          (p as { provide?: symbol }).provide === ANGULAR_SSR_OPTIONS,
      );

      expect(optionsProvider).toBeDefined();
      expect(optionsProvider?.useValue).toBe(mockOptions);
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

      const optionsProvider = result.providers?.find(
        (
          p,
        ): p is {
          provide: symbol;
          useFactory: (...args: unknown[]) => unknown;
          inject: unknown[];
        } => (p as { provide?: symbol }).provide === ANGULAR_SSR_OPTIONS,
      );

      expect(optionsProvider).toBeDefined();
      expect(optionsProvider?.useFactory).toBeTypeOf('function');
      expect(optionsProvider?.inject).toEqual(['SomeDependency']);
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

      const optionsProvider = result.providers?.find(
        (
          p,
        ): p is {
          provide: symbol;
          useFactory: (...args: unknown[]) => unknown;
          inject: unknown[];
        } => (p as { provide?: symbol }).provide === ANGULAR_SSR_OPTIONS,
      );

      expect(optionsProvider?.inject).toEqual([]);
    });

    it('should use empty array for imports when not provided', () => {
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: () => mockOptions,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      expect(result.imports).toEqual([]);
    });

    it('should call factory and return its resolved options', async () => {
      const factory = vi.fn().mockResolvedValue(mockOptions);
      const asyncOptions: AngularSSRModuleAsyncOptions = {
        useFactory: factory,
      };

      const result = AngularSSRModule.forRootAsync(asyncOptions);

      const optionsProvider = result.providers?.find(
        (
          p,
        ): p is {
          provide: symbol;
          useFactory: (...args: unknown[]) => Promise<unknown>;
        } => (p as { provide?: symbol }).provide === ANGULAR_SSR_OPTIONS,
      );

      expect(optionsProvider).toBeDefined();
      const resolved = await optionsProvider?.useFactory();
      expect(factory).toHaveBeenCalled();
      expect(resolved).toBe(mockOptions);
    });
  });

  describe('configure()', () => {
    let mockConsumer: MiddlewareConsumer;
    let applyResult: { forRoutes: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      applyResult = {
        forRoutes: vi.fn().mockReturnThis(),
      };
      mockConsumer = {
        apply: vi.fn().mockReturnValue(applyResult),
      } as unknown as MiddlewareConsumer;
    });

    it('applies the static file middleware', () => {
      const module = new AngularSSRModule(mockOptions);
      module.configure(mockConsumer);
      expect(mockConsumer.apply).toHaveBeenCalled();
    });

    it('uses the splat wildcard as the default render path', () => {
      const module = new AngularSSRModule(mockOptions);
      module.configure(mockConsumer);
      expect(applyResult.forRoutes).toHaveBeenCalledWith('{/*splat}');
    });

    it("mounts express.static at '/' and the SSR middleware at the splat wildcard by default", () => {
      // The static middleware must mount at '/' (or an equivalent literal
      // prefix) because `forRoutes('{/*splat}')` confuses express.static
      // into issuing spurious 301 redirects (e.g. /favicon.ico → /favicon.ico/).
      const module = new AngularSSRModule(mockOptions);
      module.configure(mockConsumer);
      expect(applyResult.forRoutes).toHaveBeenNthCalledWith(1, '/');
      expect(applyResult.forRoutes).toHaveBeenNthCalledWith(2, '{/*splat}');
    });

    it('honours a custom render path string', () => {
      const module = new AngularSSRModule({ ...mockOptions, renderPath: '/app/*splat' });
      module.configure(mockConsumer);
      expect(applyResult.forRoutes).toHaveBeenCalledWith('/app/*splat');
    });

    it('honours custom render paths as an array', () => {
      const module = new AngularSSRModule({
        ...mockOptions,
        renderPath: ['/app', '/dashboard'],
      });
      module.configure(mockConsumer);
      expect(applyResult.forRoutes).toHaveBeenCalledWith('/app', '/dashboard');
    });

    it('honours a custom static path', () => {
      const module = new AngularSSRModule({
        ...mockOptions,
        rootStaticPath: '/static/*splat',
      });
      module.configure(mockConsumer);
      expect(applyResult.forRoutes).toHaveBeenCalledWith('/static/*splat');
    });
  });
});
