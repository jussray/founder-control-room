import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT = 'fcr/cloudflare-worker-binding-observation@v1';
const DEFAULT_RECEIPT_PATH = 'test-results/cloudflare-worker-binding-observation.json';
const MAX_RESPONSE_BYTES = 64 * 1024;
const SAFE_BINDING_NAME = /^[A-Z][A-Z0-9_]{1,127}$/;
const RELAY_REQUIRED_BINDINGS = [
  'GEMINI_API_KEY',
  'FCR_RELAY_GEMINI_MODEL',
  'FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP',
];

export function extractRequiredSecretNames(wranglerText) {
  const match = String(wranglerText).match(/\[secrets\]\s*\nrequired\s*=\s*\[([\s\S]*?)\n\]/m);
  if (!match) throw new Error('WRANGLER_REQUIRED_SECRETS_NOT_FOUND');

  const names = [...match[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((entry) => entry[1]);
  const unique = [...new Set(names)];
  if (unique.length === 0 || unique.some((name) => !SAFE_BINDING_NAME.test(name))) {
    throw new Error('WRANGLER_REQUIRED_SECRETS_INVALID');
  }
  return unique;
}

function baseReceipt({ accountId, workerName, requiredNames }) {
  return {
    contract: CONTRACT,
    observedAt: new Date().toISOString(),
    provider: 'cloudflare',
    accountFingerprint: accountId ? `account:${accountId.slice(0, 6)}…${accountId.slice(-4)}` : null,
    workerName,
    method: 'GET',
    endpointClass: 'workers-script-secret-name-list',
    requiredBindingCount: requiredNames.length,
    providerBindingCount: null,
    requiredBindings: requiredNames.map((name) => ({ name, present: false })),
    missingRequiredBindings: [...requiredNames],
    relayBindings: RELAY_REQUIRED_BINDINGS.map((name) => ({ name, present: false })),
    relayReady: false,
    providerValuesRetained: false,
    undeclaredBindingNamesRetained: false,
    canAuthorizeProviderMutation: false,
    status: 'BLOCKED',
    classification: 'unobserved',
  };
}

export function classifyBindingObservation({ providerNames, requiredNames, accountId, workerName }) {
  const receipt = baseReceipt({ accountId, workerName, requiredNames });
  const safeProviderNames = new Set(
    providerNames.filter((name) => typeof name === 'string' && SAFE_BINDING_NAME.test(name)),
  );

  receipt.providerBindingCount = safeProviderNames.size;
  receipt.requiredBindings = requiredNames.map((name) => ({
    name,
    present: safeProviderNames.has(name),
  }));
  receipt.missingRequiredBindings = receipt.requiredBindings
    .filter((entry) => !entry.present)
    .map((entry) => entry.name);
  receipt.relayBindings = RELAY_REQUIRED_BINDINGS.map((name) => ({
    name,
    present: safeProviderNames.has(name),
  }));
  receipt.relayReady = receipt.relayBindings.every((entry) => entry.present);
  receipt.status = receipt.missingRequiredBindings.length === 0 ? 'VERIFIED' : 'DRIFT';
  receipt.classification = receipt.status === 'VERIFIED'
    ? 'all-required-binding-names-present'
    : 'required-binding-name-drift';
  return receipt;
}

async function responseJson(response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    try { await response.body?.cancel(); } catch { /* receipt remains valid */ }
    throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
  }

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('PROVIDER_RESPONSE_INVALID_JSON');
  }
}

export async function observeCloudflareWorkerBindings({
  accountId,
  workerName,
  apiToken,
  requiredNames,
  fetchImpl = fetch,
}) {
  const receipt = baseReceipt({ accountId, workerName, requiredNames });
  if (!accountId || !workerName || !apiToken) {
    receipt.classification = 'provider-credential-unavailable';
    return receipt;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    receipt.classification = 'provider-read-failed';
    return receipt;
  }

  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* no raw provider body retained */ }
    receipt.classification = `provider-http-${response.status}`;
    return receipt;
  }

  let body;
  try {
    body = await responseJson(response);
  } catch (error) {
    receipt.classification = error instanceof Error ? error.message.toLowerCase() : 'provider-response-invalid';
    return receipt;
  }

  if (!body || body.success !== true || !Array.isArray(body.result)) {
    receipt.classification = 'provider-envelope-invalid';
    return receipt;
  }

  const providerNames = body.result
    .map((entry) => entry && typeof entry === 'object' ? entry.name : null)
    .filter((name) => typeof name === 'string');

  return classifyBindingObservation({ providerNames, requiredNames, accountId, workerName });
}

async function main() {
  const root = process.cwd();
  const wrangler = await readFile(path.join(root, 'wrangler.worker.toml'), 'utf8');
  const requiredNames = extractRequiredSecretNames(wrangler);
  const receipt = await observeCloudflareWorkerBindings({
    accountId: String(process.env.CF_ACCOUNT_ID || '').trim(),
    workerName: String(process.env.CF_WORKER_NAME || '').trim(),
    apiToken: String(process.env.CF_API_TOKEN || '').trim(),
    requiredNames,
  });

  const receiptPath = path.join(root, process.env.CF_WORKER_BINDINGS_RECEIPT_PATH || DEFAULT_RECEIPT_PATH);
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    contract: receipt.contract,
    status: receipt.status,
    classification: receipt.classification,
    relayReady: receipt.relayReady,
    missingRequiredBindings: receipt.missingRequiredBindings,
    canAuthorizeProviderMutation: false,
  }));

  if (receipt.status !== 'VERIFIED') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
