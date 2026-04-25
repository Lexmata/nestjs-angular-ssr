import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use the forks pool so a Nest bootstrap exception during e2e tests
    // surfaces as a normal test failure instead of crashing a worker thread.
    pool: 'forks',
    include: ['lib/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/**/*.spec.ts',
        'lib/**/index.ts',
        'lib/interfaces/**',
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

