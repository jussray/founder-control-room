import { Buffer } from 'node:buffer';

const RAW_CREDENTIAL_KEYS = new Set([
  'secret',
  'secretvalue',
  'token',
  'accesstoken',
  'refreshtoken',
  'bearer',
  'authorization',
  'apikey',
  'password',
  'credential',
  'credentialvalue',
  'privatekey',
  'clientsecret',
  'webhooksecret',
  'signingsecret',
]);

const PRIVATE_KEY_PEM = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const BEARER_VALUE = /^Bearer\s+\S{8,}$/i;
const COMMON_PROVIDER_KEY = /^(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|pplx-[A-Za-z0-9_-]{16,})$/;
const BASE64_VALUE = /^[A-Za-z0-9+/_-]+={0,2}$/;

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nonEmptyCredentialValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function decodesToPrivateKey(value: string): boolean {
  const compact = value.trim();
  if (compact.length < 64 || !BASE64_VALUE.test(compact)) return false;

  try {
    // Node accepts both ordinary base64 and URL-safe alphabet variants here.
    const decoded = Buffer.from(compact, 'base64').toString('utf8');
    return PRIVATE_KEY_PEM.test(decoded);
  } catch {
    return false;
  }
}

function stringLooksSecret(value: string): boolean {
  const trimmed = value.trim();
  return PRIVATE_KEY_PEM.test(trimmed)
    || BEARER_VALUE.test(trimmed)
    || COMMON_PROVIDER_KEY.test(trimmed)
    || decodesToPrivateKey(trimmed);
}

export function containsRawCredentialMaterial(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'string') return stringLooksSecret(value);
  if (value === null || typeof value !== 'object') return false;

  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => containsRawCredentialMaterial(entry, seen));
  }

  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
    if (RAW_CREDENTIAL_KEYS.has(normalizedKey(key)) && nonEmptyCredentialValue(entry)) return true;
    return containsRawCredentialMaterial(entry, seen);
  });
}

export const NON_SECRET_CONFIG_ERROR =
  'config must contain non-secret metadata only; store credentials outside FCR and use secretRef as an opaque pointer';
