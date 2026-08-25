import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in its own isolated environment so module-level
    // env-var side effects (ALLOWED_ORIGINS resolved at load time) don't
    // bleed between test files.
    isolate: true,
    environment: 'node',
    // Include both colocated .test.ts files and __tests__/**/*.test.ts files.
    // Previously only discovered files under __tests__/ directories, leaving
    // 38 colocated test files (97 tests) undiscovered. This pattern ensures
    // all test files are discovered by npm test.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
