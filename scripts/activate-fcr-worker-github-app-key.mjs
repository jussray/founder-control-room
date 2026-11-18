import { sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePrivateKey } from './mint-portfolio-github-app-token.mjs';

const REPOSITORY = 'jussray/founder-control-room';
const WORKER = 'founder-control-room';
const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
const BINDING = 'GITHUB_PRIVATE_KEY';
const CONFIRM = 'INSTALL_EXISTING_FCR_APP_KEY';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + '_MISSING');
  return value;
}

export function checkDispatch({ actor, ref, confirmation, sha, expectedSha }) {
  if (actor !== 'jussray' || ref !== 'refs/heads/main' || confirmation !== CONFIRM) {
    throw new Error('FOUNDER_MAIN_APPROVAL_REQUIRED');
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSha) || sha !== expectedSha) {
    throw new Error('EXACT_MAIN_SHA_MISMATCH');
  }
}

async function readJson(url, { token, method = 'GET', payload } = {}) {
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
    'User-Agent': 'fcr-one-time-github-app-worker-install',
  };
  if (payload) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    redirect: 'error',
  });
  // Never print provider response bodies: a provider could echo a secret.
  if (!response.ok) throw new Error('PROVIDER_HTTP_' + response.status);
  return response.json();
}

function appJwt(appId, key) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const message = encode({ alg: 'RS256', typ: 'JWT' }) + '.' +
    encode({ iss: appId, iat: now - 60, exp: now + 540 });
  return message + '.' + sign('RSA-SHA256', Buffer.from(message), key).toString('base64url');
}

async function assertCurrentMain(token, expectedSha) {
  const current = await readJson(
    'https://api.github.com/repos/' + REPOSITORY + '/git/ref/heads/main',
    { token },
  );
  if (current?.object?.sha !== expectedSha) throw new Error('MAIN_MOVED_REFUSE_SECRET_TRANSFER');
}

async function assertAppInstallation(appId, key) {
  const token = appJwt(appId, key);
  const base = 'https://api.github.com';
  const app = await readJson(base + '/app', { token });
  if (String(app.id) !== appId) throw new Error('GITHUB_APP_ISSUER_MISMATCH');
  const installation = await readJson(base + '/repos/' + REPOSITORY + '/installation', { token });
  if (String(installation.app_id) !== appId || !installation.id) {
    throw new Error('FCR_REPOSITORY_APP_INSTALLATION_MISMATCH');
  }
}

async function cloudflare(path, apiToken, { method = 'GET', payload } = {}) {
  const result = await readJson('https://api.cloudflare.com/client/v4' + path, {
    token: apiToken, method, payload,
  });
  if (result?.success !== true) throw new Error('CLOUDFLARE_API_REJECTED');
  return result.result;
}

export function hasBinding(bindings, name) {
  return Array.isArray(bindings) && bindings.some((entry) => entry?.name === name);
}

async function run() {
  const expectedSha = required('EXPECTED_MAIN_SHA');
  checkDispatch({
    actor: required('GITHUB_ACTOR'),
    ref: required('GITHUB_REF'),
    confirmation: required('FCR_INSTALL_CONFIRMATION'),
    sha: required('GITHUB_SHA'),
    expectedSha,
  });
  if (required('CLOUDFLARE_ACCOUNT_ID') !== ACCOUNT_ID) {
    throw new Error('WRONG_CLOUDFLARE_ACCOUNT');
  }
  const githubToken = required('GH_TOKEN');
  const cloudflareToken = required('CLOUDFLARE_API_TOKEN');
  await assertCurrentMain(githubToken, expectedSha);

  const appId = required('APP_ID').trim();
  if (!/^[0-9]+$/.test(appId)) throw new Error('APP_ID_NOT_NUMERIC');
  const { key } = normalizePrivateKey(required('APP_PRIVATE_KEY'));
  await assertAppInstallation(appId, key);
  // GitHub's existing key may be encoded or wrapped. Export only normalized
  // PKCS8 PEM to the specific Worker secret endpoint, never logs/artifacts.
  const pem = key.export({ type: 'pkcs8', format: 'pem' }).toString();
  const path = '/accounts/' + ACCOUNT_ID + '/workers/scripts/' + WORKER;
  const beforeDeployments = await cloudflare(path + '/deployments', cloudflareToken);
  const previousDeploymentId = beforeDeployments?.deployments?.[0]?.id ?? null;
  const current = await cloudflare(path + '/secrets', cloudflareToken);
  if (!hasBinding(current, 'GITHUB_APP_ID')) throw new Error('WORKER_APP_ID_BINDING_MISSING');
  if (hasBinding(current, BINDING)) throw new Error('WORKER_PRIVATE_KEY_ALREADY_BOUND_REFUSE_OVERWRITE');

  // Re-read mutable source identity immediately before the only write.
  await assertCurrentMain(githubToken, expectedSha);
  await cloudflare(path + '/secrets', cloudflareToken, {
    method: 'PUT',
    payload: { name: BINDING, type: 'secret_text', text: pem },
  });

  const after = await cloudflare(path + '/secrets', cloudflareToken);
  const afterDeployments = await cloudflare(path + '/deployments', cloudflareToken);
  const resultingDeploymentId = afterDeployments?.deployments?.[0]?.id ?? null;
  if (!hasBinding(after, BINDING)) throw new Error('WORKER_PRIVATE_KEY_READBACK_MISSING');
  const receipt = {
    contract: 'fcr/one-time-github-app-worker-activation@v1',
    repository: REPOSITORY,
    headSha: expectedSha,
    worker: WORKER,
    binding: BINDING,
    githubAppIssuerVerified: true,
    repositoryInstallationVerified: true,
    cloudflareBindingPresent: true,
    previousDeploymentId,
    resultingDeploymentId,
    secretValuePrinted: false,
    liveReconciliationVerified: false,
    deploymentVerified: false,
  };
  const receiptPath = required('RECEIPT_PATH');
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log('GitHub App issuer and installation verified; fixed FCR Worker secret binding installed.');
  console.log('Live reconciliation remains a separate verification gate.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
if (process.argv.includes('--self-test')) {
  checkDispatch({
    actor: 'jussray',
    ref: 'refs/heads/main',
    confirmation: CONFIRM,
    sha: 'a'.repeat(40),
    expectedSha: 'a'.repeat(40),
  });
  for (const incorrect of [
    { actor: 'attacker' }, { ref: 'refs/heads/feature' },
    { confirmation: 'wrong' }, { sha: 'b'.repeat(40) },
  ]) {
    const args = {
      actor: 'jussray', ref: 'refs/heads/main', confirmation: CONFIRM,
      sha: 'a'.repeat(40), expectedSha: 'a'.repeat(40),
      ...incorrect,
    };
    let rejected = false;
    try { checkDispatch(args); } catch { rejected = true; }
    if (!rejected) throw new Error('SELF_TEST_FAILED');
  }
  if (!hasBinding([{ name: 'GITHUB_APP_ID' }], 'GITHUB_APP_ID')) throw new Error('SELF_TEST_FAILED');
  if (hasBinding([{ name: 'GITHUB_APP_ID' }], BINDING)) throw new Error('SELF_TEST_FAILED');
  console.log('One-time FCR App-key activation guards: local tests passed; no provider mutation.');
} else {
  await run();
}
}
