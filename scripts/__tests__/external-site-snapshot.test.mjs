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

import { isPublicAddress, resolvePublicHost, checkRequestUrl } from '../external-site-snapshot.mjs';

test('classifies IPv4 and IPv6 addresses as public or non-public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.31.9.9', '192.168.0.1', '169.254.1.1', '100.64.0.1', '198.18.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test('DNS guard rejects a hostname that resolves to any private address', async () => {
  const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }];
  assert.equal((await resolvePublicHost('rebind.example.com', mixed)).ok, false);
  const failing = async () => { throw new Error('ENOTFOUND'); };
  assert.equal((await resolvePublicHost('missing.example.com', failing)).ok, false);
  const publicOnly = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await resolvePublicHost('example.com', publicOnly)).ok, true);
});

test('request guard blocks literal and DNS-private destinations for redirects and sub-resources', async () => {
  const privateDns = async () => [{ address: '127.0.0.1', family: 4 }];
  assert.equal((await checkRequestUrl('https://metadata.example.com/latest', privateDns)).ok, false);
  assert.equal((await checkRequestUrl('http://example.com/redirect', privateDns)).ok, false);
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await checkRequestUrl('https://example.com/ok', publicDns)).ok, true);
});
