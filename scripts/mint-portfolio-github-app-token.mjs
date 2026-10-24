import { createPrivateKey, sign } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function decodeJsonQuotedString(value) {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    const decoded = JSON.parse(value);
    return typeof decoded === 'string' ? decoded : value;
  } catch {
    return value;
  }
}

function unwrapMatchingSingleQuotes(value) {
  return value.length >= 2 && value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1)
    : value;
}

function base64Bytes(value) {
  const compact = value.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return null;
  const standard = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (standard.length % 4 === 1) return null;
  const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '=');
  try {
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

function decodeBase64Pem(value) {
  const bytes = base64Bytes(value);
  if (bytes === null) return null;
  const decoded = bytes
    .toString('utf8')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .trim();
  return decoded.includes('-----BEGIN') && decoded.includes('PRIVATE KEY-----') ? decoded : null;
}

// A PEM body whose header lines were stripped base64-decodes to exactly the DER
// bytes, so this single path recovers both that paste and a base64-encoded DER
// export. Both previously classified as 'unknown' and failed closed.
function decodeDerToPem(value) {
  const bytes = base64Bytes(value);
  if (bytes === null) return null;
  for (const type of ['pkcs8', 'pkcs1']) {
    try {
      return createPrivateKey({ key: bytes, format: 'der', type })
        .export({ type: 'pkcs8', format: 'pem' })
        .trim();
    } catch {
      // Try the next DER container shape.
    }
  }
  return null;
}

// Rewrap a PEM whose newlines a single-line input field collapsed to spaces.
function rewrapCollapsedPem(value) {
  const match = /^-----BEGIN ((?:RSA )?PRIVATE KEY)-----([\s\S]*?)-----END \1-----$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const body = match[2].replace(/\s+/g, '');
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  const wrapped = body.replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${match[1]}-----\n${wrapped}\n-----END ${match[1]}-----`;
}

// Boolean shape facts only, so a rejected secret stays debuggable without being
// re-pasted. Emits no substring, hash, length, or other reconstructable metadata.
function shapeDiagnostics(trimmed) {
  const compact = trimmed.replace(/\s+/g, '');
  return [
    `begin=${trimmed.includes('-----BEGIN')}`,
    `end=${trimmed.includes('-----END')}`,
    `b64charset=${compact !== '' && /^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)}`,
    `escapedNewlines=${trimmed.includes('\\n')}`,
    `multiline=${trimmed.includes('\n')}`,
  ].join(' ');
}

// Single source of truth for App private-key transport classification. The
// minting path and the read-only founder shape diagnostic both consume this, so
// the diagnostic can never disagree with what minting actually accepts.
function classifyPrivateKey(secret) {
  const raw = String(secret ?? '');
  const trimmed = raw.trim().replace(/^﻿/, '');
  let transportClass = 'unknown';
  let normalized = trimmed;

  if (!trimmed) {
    transportClass = 'empty';
  } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    normalized = decodeJsonQuotedString(trimmed);
    transportClass = normalized !== trimmed ? 'json-quoted-pem' : 'unknown';
  } else if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    normalized = unwrapMatchingSingleQuotes(trimmed);
    transportClass = 'single-quoted-pem';
  } else if (trimmed.includes('\\n') || trimmed.includes('\\r\\n')) {
    transportClass = 'escaped-newline-pem';
  } else if (trimmed.startsWith('-----BEGIN')) {
    transportClass = 'raw-pem';
  } else {
    const decoded = decodeBase64Pem(trimmed);
    if (decoded !== null) {
      normalized = decoded;
      transportClass = 'base64-pem';
    }
  }

  normalized = unwrapMatchingSingleQuotes(decodeJsonQuotedString(normalized))
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!normalized.includes('-----BEGIN')) {
    const pem = decodeBase64Pem(normalized);
    if (pem !== null) {
      normalized = pem;
    } else {
      const der = decodeDerToPem(normalized);
      if (der !== null) {
        normalized = der;
        transportClass = 'base64-der';
      }
    }
  }

  let pemBoundary = /^-----BEGIN (?:RSA )?PRIVATE KEY-----\n/.test(normalized)
    && /\n-----END (?:RSA )?PRIVATE KEY-----$/.test(normalized);

  if (!pemBoundary) {
    const rewrapped = rewrapCollapsedPem(normalized);
    if (rewrapped !== null) {
      normalized = rewrapped;
      if (transportClass === 'raw-pem') transportClass = 'collapsed-pem';
      pemBoundary = true;
    }
  }

  const result = {
    present: raw.length > 0,
    transportClass,
    recognizedTransport: transportClass !== 'unknown' && transportClass !== 'empty',
    pemBoundary,
    parseFailed: false,
    rsaParse: false,
    key: null,
    diagnostics: shapeDiagnostics(trimmed),
  };

  if (!pemBoundary) return result;

  let key;
  try {
    key = createPrivateKey({ key: normalized, format: 'pem' });
  } catch {
    result.parseFailed = true;
    return result;
  }
  result.rsaParse = key.type === 'private' && key.asymmetricKeyType === 'rsa';
  if (result.rsaParse) result.key = key;
  return result;
}

function normalizePrivateKey(secret) {
  const classified = classifyPrivateKey(secret);
  const { transportClass } = classified;
  if (!classified.pemBoundary) {
    throw new Error(
      `APP_PRIVATE_KEY_SHAPE_INVALID:${transportClass} [${classified.diagnostics}]`,
    );
  }
  if (classified.parseFailed) {
    throw new Error(`APP_PRIVATE_KEY_RSA_PARSE_FAILED:${transportClass}`);
  }
  if (!classified.rsaParse) {
    throw new Error(`APP_PRIVATE_KEY_NOT_RSA_PRIVATE:${transportClass}`);
  }
  return { key: classified.key, transportClass };
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function appJwt(appId, key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = b64urlJson({ iat: now - 60, exp: now + 540, iss: appId });
  const signingInput = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function request(jwt, path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'founder-control-room-portfolio-token-minter',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!response.ok) throw new Error(`GITHUB_APP_HTTP_${response.status}:${path}`);
  return parsed;
}

async function main() {
  const appId = requiredEnv('APP_ID').trim();
  if (!/^\d+$/.test(appId)) throw new Error('APP_ID_NOT_NUMERIC');
  const owner = (process.env.GITHUB_APP_OWNER || 'jussray').trim();
  const tokenFile = requiredEnv('PORTFOLIO_SYNC_TOKEN_FILE');
  const { key, transportClass } = normalizePrivateKey(requiredEnv('APP_PRIVATE_KEY'));
  const jwt = appJwt(appId, key);
  const installation = await request(jwt, `/users/${encodeURIComponent(owner)}/installation`);
  if (!installation?.id) throw new Error('GITHUB_APP_INSTALLATION_NOT_FOUND');
  const tokenResponse = await request(jwt, `/app/installations/${installation.id}/access_tokens`, {
    method: 'POST',
    body: {
      permissions: {
        contents: 'write',
        pull_requests: 'read',
        checks: 'read',
      },
    },
  });
  if (!tokenResponse?.token) throw new Error('GITHUB_APP_INSTALLATION_TOKEN_MISSING');
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, `${tokenResponse.token}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(tokenFile, 0o600);
  console.log(`transport_class=${transportClass}`);
  console.log(`installation_id=${installation.id}`);
  console.log('token_written=true');
  console.log('secret_material_logged=false');
}

export { normalizePrivateKey, classifyPrivateKey };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
