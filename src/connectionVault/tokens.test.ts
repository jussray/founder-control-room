import { describe, expect, it } from 'vitest';
import {
  hashFcrApiToken,
  issueFcrApiToken,
  normalizeSecretReference,
  normalizeTokenScopes,
  parseVaultEnvironment,
  tokenHashMatches,
} from './tokens.js';

describe('FCR connection-vault API tokens', () => {
  it('issues production tokens with 256 bits of random material and stores only a hashable form', () => {
    const first = issueFcrApiToken('production');
    const second = issueFcrApiToken('production');

    expect(first.token).toMatch(/^fcr_prd_[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).toBe(hashFcrApiToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.tokenPrefix).toBe(first.token.slice(0, 20));
    expect(tokenHashMatches(first.token, first.tokenHash)).toBe(true);
    expect(tokenHashMatches(second.token, first.tokenHash)).toBe(false);
  });

  it('accepts only URI-shaped opaque secret references', () => {
    expect(normalizeSecretReference('cloudflare-secrets-store://store/github-token'))
      .toBe('cloudflare-secrets-store://store/github-token');
    expect(normalizeSecretReference('env://MCP_GITHUB_TOKEN')).toBe('env://MCP_GITHUB_TOKEN');
    expect(() => normalizeSecretReference('github_pat_this_is_not_a_reference'))
      .toThrow(/opaque URI reference/);
    expect(() => normalizeSecretReference('plain secret text')).toThrow(/opaque URI reference/);
  });

  it('normalizes and validates scopes', () => {
    expect(normalizeTokenScopes(['connections:resolve', 'connections:resolve', 'mcp:read']))
      .toEqual(['connections:resolve', 'mcp:read']);
    expect(() => normalizeTokenScopes([])).toThrow(/between 1 and 20/);
    expect(() => normalizeTokenScopes(['Bad Scope!'])).toThrow(/invalid token scope/);
  });

  it('fails closed for unknown environments', () => {
    expect(parseVaultEnvironment('preview')).toBe('preview');
    expect(() => parseVaultEnvironment('prod')).toThrow(/environment must be one of/);
  });
});
