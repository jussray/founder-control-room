import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  connectionConfigSecretViolation,
  connectionRowHasRawCredential,
  looksLikeRawCredential,
} from '../connectionConfigSecrets.js';

// Fixture values are assembled at runtime so no literal credential-looking
// string (password assignment or credentialed URL) appears in source and trips
// secret scanners. The detector under test only sees the runtime values.
const FIXTURE_VALUE = ['raw', 'value'].join('-');
const FIXTURE_DB_URL = `postgres://app:${['hun', 'ter', '2'].join('')}@db.example.test:5432/app`;

describe('connectionConfigSecretViolation', () => {
  it('allows ordinary nested provider metadata', () => {
    expect(connectionConfigSecretViolation({
      apiBase: 'https://api.github.com',
      region: 'us-east',
      authScheme: 'Bearer',
      maxTokens: 4096,
      secretRef: 'env:GITHUB_TOKEN',
      oauth: { tokenEndpoint: 'https://example.test/oauth/token', scopes: ['repo:read'] },
      nested: { mode: 'read-only' },
    })).toBeNull();
  });

  it.each([
    [{ apiKey: FIXTURE_VALUE }, 'config.apiKey'],
    [{ nested: { private_key: FIXTURE_VALUE } }, 'config.nested.private_key'],
    [{ nested: { api_key: FIXTURE_VALUE } }, 'config.nested.api_key'],
    [{ auth: { clientSecret: FIXTURE_VALUE } }, 'config.auth.clientSecret'],
    [{ options: [{ password: FIXTURE_VALUE }] }, 'config.options[0].password'],
    [{ githubToken: FIXTURE_VALUE }, 'config.githubToken'],
    [{ slackWebhookSecret: FIXTURE_VALUE }, 'config.slackWebhookSecret'],
  ])('rejects credential-named key %j at %s', (config, field) => {
    expect(connectionConfigSecretViolation(config)).toBe(field);
  });

  it.each([
    [{ endpoint: 'Bearer pretend-token-value' }, 'config.endpoint'],
    [{ pem: '-----BEGIN PRIVATE KEY-----\nredacted' }, 'config.pem'],
    [{ note: `sk-${'a'.repeat(24)}` }, 'config.note'],
    [{ tokenish: `github_pat_${'a'.repeat(22)}` }, 'config.tokenish'],
    [{ list: [`ghp_${'a'.repeat(36)}`] }, 'config.list[0]'],
    [{ database: FIXTURE_DB_URL }, 'config.database'],
  ])('rejects credential-shaped value %j under an innocuous key', (config, field) => {
    expect(connectionConfigSecretViolation(config)).toBe(field);
  });

  it('rejects base64-wrapped private-key material', () => {
    const wrapped = Buffer.from(
      `-----BEGIN PRIVATE KEY-----\n${'a'.repeat(96)}\n-----END PRIVATE KEY-----`,
      'utf8',
    ).toString('base64');
    expect(connectionConfigSecretViolation({ note: wrapped })).toBe('config.note');
  });

  it('does not reject empty credential-named placeholders', () => {
    expect(connectionConfigSecretViolation({ token: '', nested: { password: null }, apiKey: '  ' })).toBeNull();
  });

  it('redacts a credential-shaped key in the reported path', () => {
    const key = `ghp_${'b'.repeat(36)}`;
    const violation = connectionConfigSecretViolation({ [key]: 'x' });
    expect(violation).toBe('config.[redacted-key]');
    expect(violation).not.toContain(key);
  });

  it('fails closed on over-deep structures', () => {
    let deep: Record<string, unknown> = { leaf: 'ok' };
    for (let i = 0; i < 40; i += 1) deep = { d: deep };
    expect(connectionConfigSecretViolation(deep)).not.toBeNull();
  });
});

describe('looksLikeRawCredential / connectionRowHasRawCredential', () => {
  it('treats env-var and secret-manager references as references', () => {
    expect(looksLikeRawCredential('CLOUDFLARE_API_TOKEN')).toBe(false);
    expect(looksLikeRawCredential('env:FCR_PROVIDER_TOKEN')).toBe(false);
    expect(looksLikeRawCredential('projects/fcr/secrets/github/versions/latest')).toBe(false);
  });

  it('flags a stored row whose config or secret_ref carries raw credential material', () => {
    expect(connectionRowHasRawCredential({ config: { region: 'us' }, secret_ref: 'GITHUB_TOKEN' })).toBe(false);
    expect(connectionRowHasRawCredential({ config: { apiKey: FIXTURE_VALUE }, secret_ref: null })).toBe(true);
    expect(connectionRowHasRawCredential({ config: {}, secret_ref: `ghp_${'c'.repeat(36)}` })).toBe(true);
  });
});
