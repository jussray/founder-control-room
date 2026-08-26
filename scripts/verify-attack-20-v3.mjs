import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const policyPath = 'security/attack-20-v3.policy.json';
const registryPath = 'security/portfolio-worker-security.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const failures = [];

const ATTACK_IDS = Array.from({ length: 20 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`);
const ALLOWED_WORKER_STATES = new Set(['PASS', 'FAILED', 'UNVERIFIED']);
const ALLOWED_ALT_STATES = new Set(['disabled', 'protected', 'public', 'unknown']);
const FULL_SHA = /^[0-9a-f]{40}$/i;

function fail(message) {
  failures.push(message);
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

function parseTomlBoolean(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*$`, 'm'));
  return match ? match[1] === 'true' : null;
}

function parseTomlString(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"\\s*$`, 'm'));
  return match?.[1] ?? null;
}

requireValue(policy.schema === 'founder-control-room/attack-20-v3-policy@v1', 'policy schema must be attack-20-v3-policy@v1');
requireValue(policy.suiteVersion === 'attack-20-v3', 'suiteVersion must be attack-20-v3');
requireValue(policy.status === 'DESIGNED_UNVERIFIED', 'source policy status must remain DESIGNED_UNVERIFIED until live proof exists');
requireValue(policy.lineage?.parent === 'Founder Firewall v10', 'Attack-20 must retain Founder Firewall v10 lineage');
requireValue(policy.lineage?.parentPolicy === 'security/firewall-v10.policy.json', 'Attack-20 must point to the v10 parent policy');
requireValue(existsSync(policy.lineage?.parentPolicy ?? ''), 'Firewall v10 parent policy must exist');
requireValue(Array.isArray(policy.attacks) && policy.attacks.length === 20, 'policy must define exactly 20 attacks');
requireValue(JSON.stringify(policy.attacks?.map((attack) => attack.id)) === JSON.stringify(ATTACK_IDS), 'policy attack IDs must be canonical A01-A20 order');
requireValue(policy.anchors?.A07 === 'alternate-ingress-bypass', 'A07 anchor drifted');
requireValue(policy.anchors?.A10 === 'webhook-forgery-replay', 'A10 anchor drifted');
requireValue(policy.anchors?.A11 === 'bola', 'A11 anchor drifted');
requireValue(policy.anchors?.A12 === 'bopla-mass-assignment', 'A12 anchor drifted');
requireValue(policy.anchors?.A15 === 'self-approval-authority-scope-escalation', 'A15 anchor drifted');
requireValue(policy.anchors?.A18 === 'provider-runtime-false-success', 'A18 anchor drifted');
requireValue(policy.anchors?.A19 === 'independent-observability-witness', 'A19 anchor drifted');
requireValue(policy.anchors?.A20 === 'dependency-fingerprint-freshness', 'A20 anchor drifted');
requireValue(policy.invariants?.noAveraging === true, 'no-averaging invariant must remain enabled');
requireValue(policy.invariants?.noStaleGreen === true, 'no-stale-green invariant must remain enabled');
requireValue(policy.invariants?.notApplicableRequiresCapabilityAbsenceEvidence === true, 'NOT_APPLICABLE must require capability-absence evidence');
requireValue(policy.invariants?.independentWitnessRequiredForA19 === true, 'A19 must require an independent witness');
requireValue(policy.cookieSemanticBoundary?.not?.includes('HTTP/browser cookie'), 'proof cookie boundary must explicitly exclude HTTP/browser cookies');
requireValue(policy.cookieSemanticBoundary?.not?.includes('authentication token'), 'proof cookie boundary must explicitly exclude auth tokens');
requireValue(policy.cookieSemanticBoundary?.not?.includes('credential or secret'), 'proof cookie boundary must explicitly exclude credentials/secrets');

requireValue(registry.schema === 'founder-control-room/portfolio-worker-security@v1', 'registry schema is invalid');
requireValue(registry.suiteVersion === 'attack-20-v3', 'registry suiteVersion must be attack-20-v3');
requireValue(registry.repository === 'jussray/founder-control-room', 'registry repository must be jussray/founder-control-room');
requireValue(FULL_SHA.test(registry.declaredFromMainSha ?? ''), 'registry must name the exact main SHA it was discovered from');
requireValue(registry.aggregation?.noAveraging === true, 'registry must prohibit averaging');
requireValue(Array.isArray(registry.workers) && registry.workers.length >= 3, 'registry must contain every known production FCR Worker');

const workerNames = new Set();
for (const worker of registry.workers ?? []) {
  requireValue(worker.environment === 'production', `${worker.worker}: initial FCR registry is production-only`);
  requireValue(typeof worker.worker === 'string' && worker.worker.length > 0, 'worker name is required');
  requireValue(!workerNames.has(worker.worker), `duplicate worker registry entry: ${worker.worker}`);
  workerNames.add(worker.worker);
  requireValue(worker.worker !== 'founder-control-room2', 'retired founder-control-room2 must not return to the registry');
  requireValue(typeof worker.configPath === 'string' && existsSync(worker.configPath), `${worker.worker}: configPath must exist`);
  requireValue(ALLOWED_WORKER_STATES.has(worker.observedProtection?.state), `${worker.worker}: observedProtection.state is invalid`);
  requireValue(ALLOWED_WORKER_STATES.has(worker.attackTest?.result), `${worker.worker}: attackTest.result is invalid`);
  requireValue(worker.attackTest?.suiteVersion === 'attack-20-v3', `${worker.worker}: attack suite version drifted`);

  for (const [surface, state] of Object.entries(worker.alternateIngress ?? {})) {
    if (['customDomains', 'legacyDns'].includes(surface)) continue;
    if (typeof state === 'string') requireValue(ALLOWED_ALT_STATES.has(state), `${worker.worker}: invalid alternate ingress state ${surface}=${state}`);
  }

  const source = readFileSync(worker.configPath, 'utf8');
  const configuredName = parseTomlString(source, 'name');
  requireValue(configuredName === worker.worker, `${worker.worker}: registry name must match ${worker.configPath}`);

  const workersDev = parseTomlBoolean(source, 'workers_dev');
  const previewUrls = parseTomlBoolean(source, 'preview_urls');
  requireValue(workersDev !== null, `${worker.worker}: workers_dev must be explicit in Wrangler config`);
  requireValue(previewUrls !== null, `${worker.worker}: preview_urls must be explicit in Wrangler config`);
  requireValue(worker.sourceIntent?.workersDev === (workersDev ? 'enabled' : 'disabled'), `${worker.worker}: workers_dev source intent drifted`);
  requireValue(worker.sourceIntent?.previewUrls === (previewUrls ? 'enabled' : 'disabled'), `${worker.worker}: preview_urls source intent drifted`);

  if (worker.canonicalIngress?.classification === 'no-public-ingress') {
    requireValue(workersDev === false, `${worker.worker}: no-public-ingress Worker must disable workers.dev in source`);
    requireValue(previewUrls === false, `${worker.worker}: no-public-ingress Worker must disable preview URLs in source`);
  }

  if (worker.observedProtection?.state === 'PASS') {
    requireValue(Array.isArray(worker.observedProtection.evidenceReceiptIds) && worker.observedProtection.evidenceReceiptIds.length > 0, `${worker.worker}: PASS requires live evidence receipt IDs`);
    requireValue(FULL_SHA.test(worker.observedProtection.canonicalSourceSha ?? ''), `${worker.worker}: PASS requires exact observed source SHA`);
    requireValue(typeof worker.observedProtection.workerVersionId === 'string' && worker.observedProtection.workerVersionId.length > 0, `${worker.worker}: PASS requires Worker version identity`);
  }
}

for (const requiredWorker of ['founder-control-room', 'founder-control-room-review-email', 'founder-control-room-deletion-queue']) {
  requireValue(workerNames.has(requiredWorker), `missing canonical FCR Worker: ${requiredWorker}`);
}

if (registry.overallState === 'PASS') {
  requireValue((registry.workers ?? []).every((worker) => worker.observedProtection?.state === 'PASS' && worker.attackTest?.result === 'PASS'), 'portfolio registry cannot PASS unless every production Worker passes');
}

if (failures.length) {
  console.error('ATTACK-20 V3 source verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const expectedSha = process.env.EXPECTED_SHA?.trim() || null;
const githubSha = process.env.GITHUB_SHA?.trim() || null;
const headSha = expectedSha || githubSha;
const receiptShaSource = expectedSha ? 'EXPECTED_SHA' : githubSha ? 'GITHUB_SHA' : 'none';
if (process.env.GITHUB_ACTIONS === 'true' && !FULL_SHA.test(headSha ?? '')) {
  console.error('ATTACK-20 V3 source verification failed:');
  console.error('- EXPECTED_SHA or GITHUB_SHA must provide an exact 40-character commit SHA in CI');
  process.exit(1);
}

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/attack-20-v3-source-proof.json', `${JSON.stringify({
  schema: 'founder-control-room/attack-20-v3-source-proof@v1',
  suiteVersion: policy.suiteVersion,
  repository: registry.repository,
  headSha,
  receiptShaSource,
  lineage: policy.lineage,
  workerCount: registry.workers.length,
  workers: registry.workers.map((worker) => ({
    worker: worker.worker,
    observedState: worker.observedProtection.state,
    attackState: worker.attackTest.result,
    workersDevIntent: worker.sourceIntent.workersDev,
    previewUrlIntent: worker.sourceIntent.previewUrls,
  })),
  sourceContract: 'verified',
  liveSecurityState: registry.overallState,
  providerEvidence: 'not-observed-by-this-verifier',
  databaseEvidence: 'not-observed-by-this-verifier',
  note: 'Source verification is not live ATTACK-20 proof. Provider and runtime evidence remain independently required.',
}, null, 2)}\n`);

console.log(`ATTACK-20 V3 source contract verified for ${registry.repository}${headSha ? ` at ${headSha}` : ''}.`);
console.log(`Live security state remains ${registry.overallState}.`);
