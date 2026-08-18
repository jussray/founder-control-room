import { defineConfig } from '@playwright/test';

const liveOrigin = process.env.LIVE_ORIGIN ?? 'https://foundercontrolroom.org';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/live-release', open: 'never' }],
  ],
  use: {
    baseURL: liveOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
