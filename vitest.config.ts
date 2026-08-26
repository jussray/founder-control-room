import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run each test file in its own isolated environment so module-level
    // env-var side effects (ALLOWED_ORIGINS resolved at load time) don't
    // bleed between test files.
    isolate: true,
    environment: 'node',
    // Discover supported JavaScript and TypeScript test/spec files anywhere
    // under src so default npm test does not silently skip colocated or legacy
    // __tests__ suites because of extension or directory shape.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
