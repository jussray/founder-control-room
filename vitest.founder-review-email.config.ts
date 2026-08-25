import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: true,
    environment: 'node',
    // Include colocated test files for founder review email ingress verification.
    // The default config excludes src/**/*.test.ts that are not under __tests__/,
    // but email-ingress tests live as colocated .test.ts files alongside source.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/types.ts'],
    },
  },
});
