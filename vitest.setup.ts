// `@angular/ssr` and `@angular/platform-server` require zone.js to be loaded
// before any of their classes are imported. `@angular/compiler` is needed
// because the library imports a partial-compiled bundle (`@angular/common`'s
// PlatformLocation) which falls back to JIT compilation in the test process.
// Both must precede any Angular import.
import 'zone.js/node';
import '@angular/compiler';
import { vi } from 'vitest';

// Mock NestJS Logger to silence all log output during tests
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  return {
    ...actual,
    Logger: class MockLogger {
      static log = vi.fn();
      static error = vi.fn();
      static warn = vi.fn();
      static debug = vi.fn();
      static verbose = vi.fn();

      log = vi.fn();
      error = vi.fn();
      warn = vi.fn();
      debug = vi.fn();
      verbose = vi.fn();
    },
  };
});
