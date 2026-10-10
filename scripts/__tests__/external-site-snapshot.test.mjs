import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCaptureStatus,
  isPrivateOrReservedAddress,
  sanitizePublishedUrl,
  sha256,
  snapshotDirName,
  validatePublicRequestUrl,
  validateTargetUrl,
} from '../external-site-snapshot.mjs';

test('accepts a public https URL without query or fragment', () => {
  const r = validateTargetUrl('https://juss-and-co.p9s5nbwqyt.chatgpt.site');
  assert.equal(r.ok, true);
  assert.equal(r.host, 'juss-and-co.p9s5nbwqyt.chatgpt.site');
});

test('rejects http, credentials, query/fragment, private and bare hosts, IP literals, garbage', () => {
  for (const bad of [
    'http://example.com',
    'https://user:pw@example.com',
    'https://example.com/?email=person@example.com',
    'https://example.com/#private',
    'https://localhost:8787',
    'https://127.0.0.1',
    'https://10.0.0.5',
    'https://192.168.1.1',
    'https://172.16.0.1',
    'https://intranet',
    'https://api.internal',
    'https://169.254.169.254',
    'https://100.64.0.1',
    'https://[::1]',
    'https://[2001:db8::1]',
    'https://8.8.8.8',
    'not a url',
  ]) {
    assert.equal(validateTargetUrl(bad).ok, false, bad);
  }
});

test('classifies private and reserved resolved addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '192.168.1.2', '198.18.0.1', '203.0.113.5', '::1', 'fd00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPrivateOrReservedAddress(address), true, address);
  }
  assert.equal(isPrivateOrReservedAddress('1.1.1.1'), false);
  assert.equal(isPrivateOrReservedAddress('2606:4700:4700::1111'), false);
});

test('blocks a hostname whose DNS resolves to a private address', async () => {
  const resolver = async () => [{ address: '127.0.0.1', family: 4 }];
  const result = await validatePublicRequestUrl('https://public-looking.example/path', resolver);
  assert.equal(result.ok, false);
  assert.match(result.reason, /private or reserved/);
});

test('allows a hostname whose DNS resolves only to public addresses', async () => {
  const resolver = async () => [{ address: '1.1.1.1', family: 4 }];
  const result = await validatePublicRequestUrl('https://public.example/path', resolver);
  assert.equal(result.ok, true);
});

test('snapshot dir name is timestamped and host-safe', () => {
  const name = snapshotDirName('a.b/c', new Date('2026-09-30T06:30:00.000Z'));
  assert.match(name, /^2026-09-30T06-30-00-a\.b_c$/);
});

test('published URLs redact query strings, fragments and credentials', () => {
  assert.equal(
    sanitizePublishedUrl('https://user:pw@example.com/path?token=secret#private'),
    'https://example.com/path',
  );
  assert.equal(
    sanitizePublishedUrl('/next?session=secret#step', 'https://example.com/start'),
    'https://example.com/next',
  );
});

test('sha256 produces stable evidence fingerprints', () => {
  assert.equal(
    sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('capture status distinguishes observed, partial and failed readback', () => {
  assert.equal(classifyCaptureStatus({ desktop: { status: 200 }, tablet: { status: 204 }, mobile: { status: 302 } }, 3), 'OBSERVED');
  assert.equal(classifyCaptureStatus({ desktop: { status: 200 }, tablet: { status: 500 }, mobile: { error: 'timeout' } }, 3), 'PARTIAL');
  assert.equal(classifyCaptureStatus({ desktop: { error: 'timeout' }, tablet: { error: 'timeout' }, mobile: { error: 'timeout' } }, 3), 'FAILED');
});
