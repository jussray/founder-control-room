import { chromium } from 'playwright';

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
];

for (const key of proxyEnvKeys) delete process.env[key];
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const originalLaunch = chromium.launch.bind(chromium);
Object.defineProperty(chromium, 'launch', {
  configurable: true,
  value(options = {}) {
    const args = [...new Set([...(options.args ?? []), '--no-proxy-server'])];
    return originalLaunch({ ...options, args });
  },
});

await import('./run.mjs');
