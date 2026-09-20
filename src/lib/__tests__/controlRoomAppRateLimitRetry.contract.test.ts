import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  new URL('../../../public/control-room/app.js', import.meta.url),
  'utf8',
);

describe('Control Room safe read rate-limit retry contract', () => {
  it('permits one bounded Retry-After retry only for GET/HEAD reads', () => {
    expect(appSource).toContain("const SAFE_READ_RETRY_MAX_MS = 61_000;");
    expect(appSource).toContain("(method === 'GET' || method === 'HEAD') && safeReadRetryAttempt === 0");
    expect(appSource).toContain("return api(path, opts, 1);");
    expect(appSource).toContain("res.headers.get('retry-after')");
  });

  it('does not create an automatic mutation retry path', () => {
    expect(appSource).not.toMatch(/method === 'POST'[^\n]*safeReadRetryAttempt/);
    expect(appSource).not.toMatch(/method === 'PATCH'[^\n]*safeReadRetryAttempt/);
    expect(appSource).not.toMatch(/method === 'DELETE'[^\n]*safeReadRetryAttempt/);
  });
});
