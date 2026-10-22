import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Use an entirely synthetic RSA keypair and a local mocked GitHub API.
// No live GitHub App credential, network request, or production environment
// secret is needed or permitted during these parser regression tests.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const mockedFetch = `
globalThis.fetch = async (input) => {
  const path = new URL(String(input)).pathname;
  if (path === '/users/jussray/installation') {
    return new Response(JSON.stringify({ id: 123456 }), { status: 200 });
  }
  if (path === '/app/installations/123456/access_tokens') {
    return new Response(JSON.stringify({ token: 'SYNTHETIC_TEST_ONLY' }), { status: 200 });
  }
  throw new Error('TEST_NETWORK_TARGET_NOT_ALLOWED');
};
`;

function runWithSyntheticSecret(secret: string) {
  const directory = mkdtempSync(join(tmpdir(), 'fcr-app-key-transport-'));
  const tokenFile = join(directory, 'synthetic-token');
  try {
    const result = spawnSync(process.execPath, [
      '--import', `data:text/javascript,${encodeURIComponent(mockedFetch)}`,
      'scripts/mint-portfolio-github-app-token.mjs',
    ], {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: 15000,
      env: {
        ...process.env,
        APP_ID: '123',
        APP_PRIVATE_KEY: secret,
        GITHUB_APP_OWNER: 'jussray',
        PORTFOLIO_SYNC_TOKEN_FILE: tokenFile,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      tokenCreated: existsSync(tokenFile),
      tokenValue: existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('FCR GitHub App private-key transport', () => {
  const cases = [
    ['raw-pem', pem],
    ['escaped-newline-pem', pem.replace(/\n/g, '\\n')],
    ['json-quoted-pem', JSON.stringify(pem)],
    ['base64-pem', Buffer.from(pem).toString('base64')],
    ['fenced-pem', `\`\`\`pem\n${pem.trim()}\n\`\`\``],
    ['env-assignment-pem', `APP_PRIVATE_KEY=${pem.trim()}`],
    ['json-object-pem', JSON.stringify({ private_key: pem })],
    ['old-mac-cr-pem', pem.replace(/\n/g, '\r')],
  ] as const;

  for (const [transport, value] of cases) {
    it(`accepts synthetic ${transport} only after RSA parsing`, () => {
      const result = runWithSyntheticSecret(value);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('token_written=true');
      expect(result.tokenCreated).toBe(true);
      expect(result.tokenValue).toBe('SYNTHETIC_TEST_ONLY');
      expect(result.stdout).not.toContain(pem.trim());
    });
  }

  for (const invalid of ['github_pat_not_a_private_key', 'sk-test_not_a_private_key', 'APP_PRIVATE_KEY=wrong-value']) {
    it('fails closed for a non-PEM credential', () => {
      const result = runWithSyntheticSecret(invalid);
      expect(result.status).not.toBe(0);
      expect(result.tokenCreated).toBe(false);
      expect(result.stdout).not.toContain(invalid);
    });
  }

  it('refuses valid-looking non-RSA key material', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
      .export({ type: 'pkcs8', format: 'pem' }).toString();
    const result = runWithSyntheticSecret(ec);
    expect(result.status).not.toBe(0);
    expect(result.tokenCreated).toBe(false);
  });

  it('keeps the synthetic key parseable independently for test validity', () => {
    expect(createPrivateKey({ key: pem, format: 'pem' }).asymmetricKeyType).toBe('rsa');
  });
});
