import { Buffer } from 'node:buffer';

/**
 * Raw-credential detector for project connection slots.
 *
 * `project_connections.config` is non-secret metadata by contract and
 * `secret_ref` is an opaque pointer to where the real credential lives (env
 * var name, secret-manager path). This module is the single check used both
 * when a connection is written (reject) and when connections are read back
 * (flag legacy rows in the read audit).
 *
 * It is a heuristic boundary, not a secret scanner: it catches credential-named
 * keys with a non-empty value and obviously credential-shaped values under any
 * key. Callers must never echo the offending value; the returned path is built
 * from keys only, and keys that themselves look like credentials are redacted.
 */

// Normalized (lowercase, alphanumerics only) key suffixes that name a raw
// credential. Suffix matching catches `githubToken`, `db_password`,
// `slackWebhookSecret`; it does not catch `tokenEndpoint`, `secretRef`,
// `maxTokens`, or `passwordPolicy`.
const CREDENTIAL_KEY_SUFFIXES = [
  'apikey',
  'apisecret',
  'appsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'bearer',
  'authorization',
  'password',
  'passwd',
  'passphrase',
  'secret',
  'secretkey',
  'secretvalue',
  'clientsecret',
  'privatekey',
  'credential',
  'credentials',
  'credentialvalue',
] as const;

const PRIVATE_KEY_PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/i;
const CREDENTIAL_VALUE_PATTERNS: readonly RegExp[] = [
  PRIVATE_KEY_PEM,
  /^Bearer\s+\S{8,}$/i,
  /^Basic\s+[A-Za-z0-9+/]{8,}={0,2}$/i,
  /^(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|glpat-[A-Za-z0-9_-]{16,})$/,
  /^(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}$/,
  /^(?:sk|pplx)-[A-Za-z0-9_-]{16,}$/,
  /^xox[abprs]-[A-Za-z0-9-]{8,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  // JWT-shaped values (e.g. service-role keys).
  /^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/,
  // URLs / connection strings with embedded user:password.
  /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
];
const BASE64_VALUE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const MAX_DEPTH = 32;
const MAX_PATH_KEY_LENGTH = 64;

export const CONNECTION_CONFIG_SECRET_REJECTED = 'CONNECTION_CONFIG_SECRET_REJECTED';
export const CONNECTION_CONFIG_SECRET_ERROR =
  'Connection config must contain non-secret metadata only; store the credential in secret storage and reference it with secretRef.';
export const CONNECTION_SECRET_REF_ERROR =
  'secretRef must be a reference to where the credential is stored (for example an env var name), never the credential itself.';

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function credentialNamedKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return CREDENTIAL_KEY_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

function decodesToPrivateKey(value: string): boolean {
  if (value.length < 64 || !BASE64_VALUE.test(value)) return false;
  try {
    return PRIVATE_KEY_PEM.test(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return false;
  }
}

/** True when a single string looks like raw credential material. */
export function looksLikeRawCredential(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return CREDENTIAL_VALUE_PATTERNS.some(pattern => pattern.test(trimmed))
    || decodesToPrivateKey(trimmed);
}

function nonEmptyCredentialValue(value: unknown): boolean {
  if (value === null || value === undefined || typeof value === 'boolean') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function pathKey(key: string): string {
  return looksLikeRawCredential(key) || key.length > MAX_PATH_KEY_LENGTH ? '[redacted-key]' : key;
}

/**
 * Returns the first credential-shaped path inside `value` (e.g.
 * `config.auth.apiKey`, `config.options[0]`), or null when none is found.
 * Over-deep structures fail closed and are reported at the depth limit.
 */
export function connectionConfigSecretViolation(
  value: unknown,
  path = 'config',
  depth = 0,
): string | null {
  if (depth > MAX_DEPTH) return path;
  if (typeof value === 'string') return looksLikeRawCredential(value) ? path : null;
  if (value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const violation = connectionConfigSecretViolation(value[index], `${path}[${index}]`, depth + 1);
      if (violation) return violation;
    }
    return null;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${path}.${pathKey(key)}`;
    if (looksLikeRawCredential(key)) return nextPath;
    if (credentialNamedKey(key) && nonEmptyCredentialValue(nested)) return nextPath;
    const violation = connectionConfigSecretViolation(nested, nextPath, depth + 1);
    if (violation) return violation;
  }
  return null;
}

/** True when a stored or submitted connection carries raw credential material. */
export function connectionRowHasRawCredential(row: { config?: unknown; secret_ref?: unknown }): boolean {
  if (connectionConfigSecretViolation(row.config ?? {}) !== null) return true;
  return typeof row.secret_ref === 'string' && looksLikeRawCredential(row.secret_ref);
}
