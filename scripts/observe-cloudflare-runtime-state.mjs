import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLOUDFLARE_READBACK_CONTRACT = 'fcr/cloudflare-worker-readback@v1';
const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const WORKER = 'founder-control-room';
const ACCOUNT = '9b59861bd1747cf7525571b4c51d2aa0';
const REPOSITORY = 'jussray/founder-control-room';
const CONFIG = 'wrangler.worker.toml';
const OUTPUT = 'artifacts/cloudflare-provider-readback.json';

function section(content, name) {
  return content.match(new RegExp('^\\[' + name + '\\]([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))', 'm'))?.[1] ?? '';
}

export function parseDesiredWorkerConfig(content) {
  const worker = content.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const requiredBlock = section(content, 'secrets').match(/required\s*=\s*\[([\s\S]*?)\]/);
  const cronBlock = section(content, 'triggers').match(/crons\s*=\s*\[([\s\S]*?)\]/);
  if (worker !== WORKER || !requiredBlock || !cronBlock) {
    throw new Error('CLOUDFLARE_DECLARATION_INVALID');
  }
  const requiredSecrets = [...requiredBlock[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((entry) => entry[1]);
  const crons = [...cronBlock[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
  if (!requiredSecrets.length || !crons.length || new Set(requiredSecrets).size !== requiredSecrets.length) {
    throw new Error('CLOUDFLARE_DECLARATION_INVALID');
  }
  return { worker, requiredSecrets: requiredSecrets.sort(), crons: crons.sort() };
}

function validName(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(value);
}

export function summarizeProviderState(desired, settings, schedules, observedAt = new Date()) {
  const bindings = settings?.bindings;
  const observedSchedules = schedules?.schedules;
  if (!Array.isArray(bindings) || !Array.isArray(observedSchedules)) {
    throw new Error('CLOUDFLARE_PROVIDER_RESPONSE_INVALID');
  }
  if (!Number.isFinite(observedAt.getTime())) throw new Error('CLOUDFLARE_OBSERVATION_TIME_INVALID');
  // Values and raw provider payloads are never included in a receipt.
  const sanitized = bindings.map((entry) => {
    if (!validName(entry?.name) || typeof entry?.type !== 'string' || !/^[a-z_]{1,64}$/.test(entry.type)) {
      throw new Error('CLOUDFLARE_PROVIDER_BINDING_INVALID');
    }
    return { name: entry.name, type: entry.type };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(sanitized.map((entry) => entry.name)).size !== sanitized.length) {
    throw new Error('CLOUDFLARE_PROVIDER_BINDING_DUPLICATE');
  }
  if (!observedSchedules.every((item) => typeof item?.cron === 'string')) {
    throw new Error('CLOUDFLARE_PROVIDER_CRON_INVALID');
  }
  const crons = observedSchedules.map((item) => item.cron).sort();
  const secretNames = new Set(sanitized.filter((entry) => entry.type === 'secret_text').map((entry) => entry.name));
  const missingSecrets = desired.requiredSecrets.filter((name) => !secretNames.has(name));
  const missingCrons = desired.crons.filter((cron) => !crons.includes(cron));
  const plaintextApiToken = sanitized.some((entry) => entry.name === 'CF_API_TOKEN' && entry.type === 'plain_text');
  const mismatches = [
    ...(missingSecrets.length ? ['missing_required_secret_bindings'] : []),
    ...(missingCrons.length ? ['missing_reconciliation_cron'] : []),
    ...(plaintextApiToken ? ['plaintext_api_token_binding'] : []),
  ];
  const stateDigest = 'sha256:' + createHash('sha256').update(JSON.stringify({
    worker: desired.worker, bindings: sanitized, crons,
  })).digest('hex');
  return {
    schema: CLOUDFLARE_READBACK_CONTRACT,
    repository: REPOSITORY,
    worker: desired.worker,
    accountId: ACCOUNT,
    observedAt: observedAt.toISOString(),
    scope: 'worker-bindings-and-crons-only',
    status: mismatches.length ? 'drift_detected' : 'aligned',
    observedStateDigest: stateDigest,
    observedCronSchedules: crons,
    missingRequiredSecretNames: missingSecrets,
    mismatchKinds: mismatches,
    secretValuesRead: false,
    exactDeploymentShaVerified: false,
    canAuthorizeProviderMutation: false,
  };
}

async function readCloudflareJson(apiToken, endpoint, fetcher) {
  const response = await fetcher(API_ORIGIN + endpoint, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + apiToken, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('CLOUDFLARE_READBACK_HTTP_' + response.status);
  const body = await response.json();
  if (body?.success !== true) throw new Error('CLOUDFLARE_READBACK_PROVIDER_ERROR');
  return body.result;
}

export async function observeCloudflareWorker({ token, fetcher = fetch, root = process.cwd(), observedAt = new Date() }) {
  // Do not trim a malformed credential into apparent validity.
  if (!token || /[^\x21-\x7e]/.test(token) || token.startsWith('Bearer ')) {
    throw new Error('CLOUDFLARE_READBACK_TOKEN_UNAVAILABLE_OR_UNSAFE');
  }
  const desired = parseDesiredWorkerConfig(fs.readFileSync(path.join(root, CONFIG), 'utf8'));
  const endpoint = '/accounts/' + ACCOUNT + '/workers/scripts/' + WORKER;
  const [settings, schedules] = await Promise.all([
    readCloudflareJson(token, endpoint + '/settings', fetcher),
    readCloudflareJson(token, endpoint + '/schedules', fetcher),
  ]);
  return summarizeProviderState(desired, settings, schedules, observedAt);
}

export async function writeCloudflareReadback(env = process.env, root = process.cwd()) {
  const receipt = await observeCloudflareWorker({ token: env.CF_RUNTIME_READ_TOKEN, root });
  const output = env.CONTROL_ROOM_PROVIDER_READBACK_PATH || OUTPUT;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return receipt;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeCloudflareReadback().then((receipt) => {
    console.log(JSON.stringify({ status: receipt.status, observedStateDigest: receipt.observedStateDigest, mismatchKinds: receipt.mismatchKinds }));
    if (receipt.status !== 'aligned') process.exitCode = 1;
  }).catch((error) => {
    // Fail closed without dumping raw provider response or authentication material.
    console.error(error instanceof Error && /^CLOUDFLARE_[A-Z0-9_]+$/.test(error.message)
      ? error.message : 'CLOUDFLARE_READBACK_UNAVAILABLE');
    process.exitCode = 1;
  });
}
