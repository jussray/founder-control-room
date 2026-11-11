import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetUrl, snapshotDirName } from '../external-site-snapshot.mjs';

test('accepts a public https URL', () => {
  const r = validateTargetUrl('https://juss-and-co.p9s5nbwqyt.chatgpt.site');
  assert.equal(r.ok, true);
  assert.equal(r.host, 'juss-and-co.p9s5nbwqyt.chatgpt.site');
});

test('rejects http, credentials, private and bare hosts, garbage', () => {
  for (const bad of ['http://example.com', 'https://user:pw@example.com', 'https://localhost:8787', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.1', 'https://172.16.0.1', 'https://intranet', 'https://api.internal', 'https://169.254.169.254', 'https://100.64.0.1', 'https://[::1]', 'https://[2001:db8::1]', 'https://8.8.8.8', 'not a url']) {
    assert.equal(validateTargetUrl(bad).ok, false, bad);
  }
});

test('snapshot dir name is timestamped and host-safe', () => {
  const name = snapshotDirName('a.b/c', new Date('2026-09-30T06:30:00.000Z'));
  assert.match(name, /^2026-09-30T06-30-00-a\.b_c$/);
});
