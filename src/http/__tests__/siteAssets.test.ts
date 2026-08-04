import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

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
    expect(buildScript).toContain("'portable-founder-console/index.html'");
  });

  it('provides a root front door into the founder-authenticated app', () => {
    const landing = read('public/index.html');
    const app = read('public/control-room/index.html');

    expect(landing).toContain('href="/control-room/"');
    expect(landing).toContain('The four jobs');
    expect(landing).toContain('View safety boundary');
    expect(app).toContain('src="/control-room/app.js"');
    expect(existsSync(resolve(repoRoot, 'public/portable-founder-console/index.html'))).toBe(true);
  });

  it('keeps browser API calls same-origin and rejects an unverified upstream', () => {
    const proxy = read('public/_worker.js');

    expect(proxy).toContain("const API_ORIGIN = 'https://api.foundercontrolroom.org'");
    expect(proxy).toContain("const EXPECTED_API_SERVICE = 'founder-control-room'");
    expect(proxy).toContain('STATIC_FILE_PATTERN');
    expect(proxy).toContain("'/control-room'");
    expect(proxy).toContain("'/portable-founder-console'");
    expect(proxy).toContain('if (shouldServeFromPages(request))');
    expect(proxy).toContain('return env.ASSETS.fetch(request)');
    expect(proxy).toContain("headers.set('x-forwarded-host', sourceUrl.host)");
    expect(proxy).toContain("redirect: 'manual'");
    expect(proxy).toContain('const response = await fetch(createApiRequest(request))');
    expect(proxy).toContain('const failureCode = upstreamFailureCode(response)');
    expect(proxy).toContain('API_SERVICE_IDENTITY_MISMATCH');
    expect(proxy).toContain('return failureCode ? degradedResponse(request, failureCode) : response');
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
