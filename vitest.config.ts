import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in its own isolated environment so module-level
    // env-var side effects (ALLOWED_ORIGINS resolved at load time) don't
    // bleed between test files.
    isolate: true,
    environment: 'node',
    // Include colocated and __tests__/ suites written in TypeScript or
    // JavaScript. The discovery ratchet separately rejects other candidate
    // test/spec suffixes unless they are exact-base debt.
    include: ['src/**/*.test.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
