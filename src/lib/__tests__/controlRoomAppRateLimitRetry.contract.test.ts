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

  it('uses the authoritative connection-check response instead of spending an immediate duplicate GET', () => {
    const handlerStart = appSource.indexOf("panel.querySelectorAll('.connection-check-btn')");
    const handlerEnd = appSource.indexOf("panel.querySelector('#file-up')", handlerStart);
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);

    const handler = appSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('const checkResult = await api(');
    expect(handler).toContain('checkResult?.connection');
    expect(handler).toContain('updatedConnection.id !== expectedConnectionId');
    expect(handler).toContain('state.projectConnections = state.projectConnections.map');
    expect(handler).not.toContain('await loadProjectConnections(');
  });
});
