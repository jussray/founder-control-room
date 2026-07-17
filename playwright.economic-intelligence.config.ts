import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'economic-intelligence-city-agnostic.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/economic-intelligence', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx scripts/economic-intelligence-test-server.ts',
    url: 'http://127.0.0.1:8791/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
