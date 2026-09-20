import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { containsRawCredentialMaterial } from '../nonSecretConfig.js';

describe('containsRawCredentialMaterial', () => {
  it('allows ordinary nested provider metadata', () => {
    expect(containsRawCredentialMaterial({
      apiBase: 'https://api.github.com',
      region: 'us-east',
      oauth: { tokenEndpoint: 'https://example.test/oauth/token', scopes: ['repo:read'] },
    })).toBe(false);
  });

  it.each([
    [{ apiKey: 'raw-value' }, 'apiKey'],
    [{ nested: { private_key: 'raw-value' } }, 'nested private_key'],
    [{ auth: { clientSecret: 'raw-value' } }, 'clientSecret'],
    [{ options: [{ password: 'raw-value' }] }, 'array password'],
  ])('rejects credential-bearing key %s (%s)', (value) => {
    expect(containsRawCredentialMaterial(value)).toBe(true);
  });

  it('rejects obvious credential material even under an innocuous key', () => {
    expect(containsRawCredentialMaterial({ note: 'Bearer abcdefghijklmnop' })).toBe(true);
    expect(containsRawCredentialMaterial({ note: '-----BEGIN PRIVATE KEY-----\nredacted' })).toBe(true);
    expect(containsRawCredentialMaterial({ note: `sk-${'a'.repeat(24)}` })).toBe(true);
  });

  it('rejects base64-wrapped private-key material under an innocuous key', () => {
    const wrappedPem = Buffer.from(
      `-----BEGIN PRIVATE KEY-----\n${'a'.repeat(96)}\n-----END PRIVATE KEY-----`,
      'utf8',
    ).toString('base64');

    expect(containsRawCredentialMaterial({ note: wrappedPem })).toBe(true);
  });

  it('does not reject empty credential-shaped metadata fields', () => {
    expect(containsRawCredentialMaterial({ token: '', nested: { password: null } })).toBe(false);
  });
});
