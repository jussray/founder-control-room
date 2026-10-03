import { createPrivateKey, sign } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';

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

function decodeBase64Pem(value) {
  const compact = value.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return null;
  const standard = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (standard.length % 4 === 1) return null;
  const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '=');
  try {
    const decoded = Buffer.from(padded, 'base64')
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .trim();
    return decoded.includes('-----BEGIN') && decoded.includes('PRIVATE KEY-----') ? decoded : null;
  } catch {
    return null;
  }
}

function normalizePrivateKey(secret) {
  const trimmed = String(secret ?? '').trim().replace(/^\uFEFF/, '');
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
    normalized = decodeBase64Pem(normalized) ?? normalized;
  }

  const pemBoundary = /^-----BEGIN (?:RSA )?PRIVATE KEY-----\n/.test(normalized)
    && /\n-----END (?:RSA )?PRIVATE KEY-----$/.test(normalized);

  if (!pemBoundary) {
    throw new Error(`APP_PRIVATE_KEY_SHAPE_INVALID:${transportClass}`);
  }

  let key;
  try {
    key = createPrivateKey({ key: normalized, format: 'pem' });
  } catch {
    throw new Error(`APP_PRIVATE_KEY_RSA_PARSE_FAILED:${transportClass}`);
  }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'rsa') {
    throw new Error(`APP_PRIVATE_KEY_NOT_RSA_PRIVATE:${transportClass}`);
  }
  return { key, transportClass };
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

await main();
