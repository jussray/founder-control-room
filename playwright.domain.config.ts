import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './domain-e2e',
  testMatch: 'domain-authority.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    ignoreHTTPSErrors: false,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results/domain-authority',
});
