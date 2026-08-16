import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONNECTION_VAULT_CONTRACT = Object.freeze({
  id: 'founder-control-room-connection-vault',
  version: '1.0.0',
});

export const VAULT_ENVIRONMENTS = Object.freeze([
  'development',
  'preview',
  'production',
] as const);

export type VaultEnvironment = (typeof VAULT_ENVIRONMENTS)[number];

const ENV_PREFIX: Record<VaultEnvironment, string> = {
  development: 'dev',
  preview: 'prv',
  production: 'prd',
};

const SCOPE_PATTERN = /^[a-z][a-z0-9:_-]{1,79}$/;
const SECRET_REFERENCE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S{3,1024}$/i;
const MAX_SCOPES = 20;

export interface IssuedFcrApiToken {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

export function parseVaultEnvironment(value: unknown): VaultEnvironment {
  if (typeof value !== 'string' || !VAULT_ENVIRONMENTS.includes(value as VaultEnvironment)) {
    throw new Error(`environment must be one of: ${VAULT_ENVIRONMENTS.join(', ')}`);
  }
  return value as VaultEnvironment;
}

export function normalizeSecretReference(value: unknown): string {
  const reference = typeof value === 'string' ? value.trim() : '';
  if (!SECRET_REFERENCE_PATTERN.test(reference)) {
    throw new Error('secretRef must be an opaque URI reference such as cloudflare-secrets-store://store/secret-name');
  }
  return reference;
}

export function normalizeTokenScopes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('scopes must be an array');
  const scopes = [...new Set(value.map((scope) => typeof scope === 'string' ? scope.trim() : ''))]
    .filter(Boolean)
    .sort();
  if (scopes.length === 0 || scopes.length > MAX_SCOPES) {
    throw new Error(`scopes must contain between 1 and ${MAX_SCOPES} entries`);
  }
  for (const scope of scopes) {
    if (!SCOPE_PATTERN.test(scope)) throw new Error(`invalid token scope: ${scope}`);
  }
  return scopes;
}

export function hashFcrApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueFcrApiToken(environment: VaultEnvironment): IssuedFcrApiToken {
  const token = `fcr_${ENV_PREFIX[environment]}_${randomBytes(32).toString('base64url')}`;
  return {
    token,
    tokenHash: hashFcrApiToken(token),
    tokenPrefix: token.slice(0, 20),
  };
}

export function tokenHashMatches(token: string, expectedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashFcrApiToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
