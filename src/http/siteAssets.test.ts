import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Founder Control Room Cloudflare topology', () => {
  it('builds the browser frontend as a Cloudflare Pages artifact', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };
    const buildScript = read('scripts/build-pages.mjs');

    expect(packageJson.scripts?.['build:pages']).toBe('node scripts/build-pages.mjs');
    expect(packageJson.scripts?.['pages:dev']).toContain('wrangler pages dev dist-pages');
    expect(buildScript).toContain("resolve(repositoryRoot, 'public')");
    expect(buildScript).toContain("resolve(repositoryRoot, 'dist-pages')");
    expect(buildScript).toContain("'_worker.js'");
  });

  it('provides a root front door into the founder-authenticated app', () => {
    const landing = read('public/index.html');
    const app = read('public/control-room/index.html');

    expect(landing).toContain('href="/control-room/"');
    expect(landing).toContain('The four jobs');
    expect(landing).toContain('View safety boundary');
    expect(app).toContain('src="/control-room/app.js"');
  });

  it('keeps browser API calls same-origin through the Pages edge proxy', () => {
    const proxy = read('public/_worker.js');

    expect(proxy).toContain("const API_ORIGIN = 'https://api.foundercontrolroom.org'");
    expect(proxy).toContain('env.ASSETS.fetch(request)');
    expect(proxy).toContain('assetResponse.status !== 404');
    expect(proxy).toContain("headers.set('x-forwarded-host', sourceUrl.host)");
    expect(proxy).toContain("redirect: 'manual'");
    expect(proxy).toContain('return fetch(createApiRequest(request))');
  });

  it('deploys one API Worker and keeps Pages out of Worker configuration', () => {
    const worker = read('wrangler.worker.toml');

    expect(worker).toContain('name = "founder-control-room"');
    expect(worker).toContain('pattern = "api.foundercontrolroom.org"');
    expect(worker).toContain('FOUNDER_API_URL = "https://foundercontrolroom.org"');
    expect(worker).toContain('[triggers]');
    expect(worker).not.toContain('[assets]');
    expect(existsSync(resolve(repoRoot, 'wrangler.toml'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'wrangler.api.toml'))).toBe(false);
  });

  it('applies browser security headers to Pages assets', () => {
    const headers = read('public/_headers');

    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('/control-room/*');
    expect(headers).toContain('Cache-Control: no-store');
  });
});
