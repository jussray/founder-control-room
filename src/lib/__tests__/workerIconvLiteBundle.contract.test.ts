import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Wrangler/esbuild honors package.json "browser" fields. iconv-lite@0.4.x maps
// ./lib/streams and ./lib/extend-node to false, yet calls require('./streams')(iconv)
// whenever process.versions.node is set, which nodejs_compat provides. The bundled
// Worker then fails Cloudflare's startup validation (10021: require_streams(...) is
// not a function). Express -> body-parser/raw-body must resolve a safe iconv-lite.
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

describe('Worker bundle iconv-lite startup safety', () => {
  it('pins iconv-lite to a release whose browser field does not disable called modules', () => {
    expect(pkg.overrides?.['iconv-lite']).toBe('0.6.3');
  });

  it.each(['body-parser', 'raw-body'])('%s resolves a Worker-safe iconv-lite', (dependent) => {
    const fromDependent = createRequire(require.resolve(`${dependent}/package.json`));
    const iconvPkg = fromDependent('iconv-lite/package.json');
    const [major, minor] = String(iconvPkg.version).split('.').map(Number);
    expect(major > 0 || minor >= 6).toBe(true);
    const browser = iconvPkg.browser ?? {};
    expect(browser['./lib/streams']).toBeUndefined();
    expect(browser['./lib/extend-node']).toBeUndefined();
    const iconv = fromDependent('iconv-lite');
    expect(typeof iconv.decode).toBe('function');
    expect(typeof iconv.getDecoder).toBe('function');
    expect(iconv.encodingExists('utf-8')).toBe(true);
  });
});
