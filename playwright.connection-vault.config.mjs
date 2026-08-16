import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /connection-vault-api\.pw\.mjs/,
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'line',
});
