import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('public portfolio demo boundary', () => {
  it('serves the static demo through the existing Pages asset boundary with no-store caching', () => {
    const proxy = read('public/_worker.js');
    const headers = read('public/_headers');

    expect(proxy).toContain('STATIC_FILE_PATTERN');
    expect(proxy).toContain('html');
    expect(headers).toContain('/demo/*');
    expect(headers).toContain('Cache-Control: no-store');
    expect(existsSync(resolve(repoRoot, 'public/demo/index.html'))).toBe(true);
  });

  it('keeps the public demo static, inspect-only, and fail-closed for unverified live entries', () => {
    const html = read('public/demo/index.html');

    expect(existsSync(resolve(repoRoot, 'public/demo/styles.css'))).toBe(true);
    expect(html).toContain('data-testid="portfolio-demo"');
    expect(html).toContain('public-demo · inspect-only');
    expect(html).toContain('no privileged writes');
    expect(html).toContain('no browser cookie required');
    expect(html).toContain('data-testid="open-sekret-demo" aria-disabled="true"');
    expect(html).not.toContain('href="https://app.sekretbip.net/?bipDevAudience=teen"');
    expect(html).toContain('live entry stays withheld');
    expect(html).toContain('current production runtime equals current repository main');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<form\b/i);
    expect(html).not.toMatch(/<(?:input|textarea|select)\b/i);
  });
});
