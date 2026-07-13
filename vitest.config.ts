import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['lib/**/*.spec.ts', 'schematics/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['lib/**/*.ts', 'schematics/**/*.ts'],
      exclude: [
        'lib/**/*.spec.ts',
        'lib/**/index.ts',
        'lib/interfaces/**',
        'schematics/**/*.spec.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});

