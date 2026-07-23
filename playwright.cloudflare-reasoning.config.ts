import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  // A retried pass is a flake, not proof: this suite's result becomes a
  // GitHub check run, which becomes evidence a mission's merge gate reads.
  // Retrying in CI would let a flaky pass silently satisfy that gate.
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx src/test-server.ts',
    url: 'http://127.0.0.1:8787/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: '8787',
      NODE_ENV: 'test',
      SUPABASE_URL:
        process.env.SUPABASE_URL || 'https://oojzfmmywbvficgybaxd.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key',
      SUPABASE_PUBLISHABLE_KEY:
        process.env.SUPABASE_PUBLISHABLE_KEY || 'test-publishable-key',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-github-token',
    },
  },
});
