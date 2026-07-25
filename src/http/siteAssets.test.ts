import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Founder Control Room production site assets', () => {
  it('ships the public site with the primary Cloudflare Worker', () => {
    const wrangler = read('wrangler.toml');

    expect(wrangler).toContain('[assets]');
    expect(wrangler).toContain('directory = "./public"');
    expect(wrangler).toContain('binding = "ASSETS"');
  });

  it('provides a root front door into the founder-authenticated app', () => {
    const landing = read('public/index.html');
    const app = read('public/control-room/index.html');

    expect(landing).toContain('href="/control-room/"');
    expect(landing).toContain('The four jobs');
    expect(landing).toContain('View safety boundary');
    expect(app).toContain('src="/control-room/app.js"');
  });

  it('applies browser security headers to static assets', () => {
    const headers = read('public/_headers');

    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('/control-room/*');
    expect(headers).toContain('Cache-Control: no-store');
  });
});
