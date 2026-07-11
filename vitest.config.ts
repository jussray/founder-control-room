import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in its own isolated environment so module-level
    // env-var side effects (ALLOWED_ORIGINS resolved at load time) don't
    // bleed between test files.
    isolate: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
