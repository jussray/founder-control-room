import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in its own isolated environment so module-level
    // env-var side effects (ALLOWED_ORIGINS resolved at load time) don't
    // bleed between test files.
    isolate: true,
    environment: 'node',
    // Discover both TypeScript and JavaScript .test suites across src/.
    // The JavaScript inclusion keeps historical suites such as the Founder
    // Signal Engine operator-model tests inside normal `npm test` rather than
    // hiding them behind baseline debt or a one-off runner.
    include: ['src/**/*.test.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
