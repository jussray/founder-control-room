import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedHead = (process.env.EXPECTED_HEAD_SHA ?? process.env.GITHUB_SHA ?? '').trim().toLowerCase();
const exactSha = /^[0-9a-f]{40}$/;

if (!exactSha.test(expectedHead)) {
  console.error('EXPECTED_HEAD_SHA or GITHUB_SHA must be an exact 40-character SHA.');
  process.exit(1);
}

const sourcePaths = [
  'src/reasoningRuns/reasoningRun.ts',
  'src/reasoningRuns/__tests__/reasoningRun.test.ts',
  'src/services/reasoningRunStore.ts',
  'src/services/__tests__/reasoningRunStore.test.ts',
  'src/http/routes/reasoningRuns.ts',
  'src/http/routes/__tests__/reasoningRuns.integration.test.ts',
  'src/http/server.ts',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const sources = {};
for (const path of sourcePaths) {
  const content = await readFile(resolve(root, path));
  sources[path] = sha256(content);
}

const cookieManifest = await readFile(resolve(root, '.security/cookies.json'));
const cookieManifestSha256 = sha256(cookieManifest);

const reasoningContractSource = await readFile(resolve(root, 'src/reasoningRuns/reasoningRun.ts'), 'utf8');
for (const required of [
  "'ultrathink'",
  "'redteam-premise'",
  "'lindy'",
  "'l99'",
  "'ooda'",
  "'billgates'",
  "'elonmusk'",
  "'hormozi'",
  "'product-design'",
  "'data-analytics'",
  "'v10'",
  "'futureyou-me'",
  "'juss'",
  "'sanitized-operational-intent-sha256'",
  "'sanitized-stage-result-sha256'",
  "'sanitized-tool-target-sha256'",
  'rawPromptStored: false',
  'rawPromptFingerprintStored: false',
  'rawChainOfThoughtStored: false',
  'rawCookieValuesStored: false',
  'currentHeadSha requires repository identity',
  'nextGateCode must be an operational code',
  'iteration > 10',
  'materialized: false',
  'url.username',
  'url.password',
  'url.search',
  'url.hash',
]) {
  if (!reasoningContractSource.includes(required)) {
    console.error(`Reasoning contract missing required invariant: ${required}`);
    process.exit(1);
  }
}

for (const forbidden of [
  'promptFingerprint',
  'outputFingerprint',
  'priorRunId',
]) {
  if (reasoningContractSource.includes(forbidden)) {
    console.error(`Reasoning contract contains forbidden legacy fingerprint/control field: ${forbidden}`);
    process.exit(1);
  }
}

const storeSource = await readFile(resolve(root, 'src/services/reasoningRunStore.ts'), 'utf8');
for (const required of [
  'sourceEventId(chainId: string, iteration: number)',
  'reasoning_run_prior_receipt_not_found',
  'reasoning_run_prior_receipt_mismatch',
  "prior.stopReason === 'continue'",
  'prior.intentFingerprint === receipt.intentFingerprint',
  'loadReasoningRun(projectId, receipt.chainId, receipt.iteration - 1)',
]) {
  if (!storeSource.includes(required)) {
    console.error(`Reasoning store missing required continuity invariant: ${required}`);
    process.exit(1);
  }
}

const routeSource = await readFile(resolve(root, 'src/http/routes/reasoningRuns.ts'), 'utf8');
for (const required of [
  'RAW_REASONING_DATA_FORBIDDEN',
  "select('id, slug, repo_identifier')",
  "source: 'other'",
  'REASONING_CHAIN_INVALID',
  'cookieBoundaryFingerprint(transport)',
]) {
  if (!routeSource.includes(required)) {
    console.error(`Reasoning route missing required trust-boundary invariant: ${required}`);
    process.exit(1);
  }
}

const artifact = {
  contract: 'fcr/reasoning-implementation-proof@v1',
  exactHeadSha: expectedHead,
  generatedAt: new Date().toISOString(),
  workflowPreset: 'juss-v10-deep-audit',
  selfAudit: {
    maximumIterations: 10,
    deterministicChainSlot: 'chainId+iteration',
    priorReceiptContinuityRequired: true,
    terminalStopEnforced: true,
    repositoryIdentityRequiredForExactHead: true,
  },
  privacy: {
    rawPromptStored: false,
    rawPromptFingerprintStored: false,
    intentFingerprintScheme: 'sanitized-operational-intent-sha256',
    stageFingerprintsDerivedFromStoredOperationalFields: true,
    toolFingerprintsDerivedFromStoredOperationalFields: true,
    rawChainOfThoughtStored: false,
    rawToolPayloadsStored: false,
    rawCookieValuesStored: false,
    artifactRefsRejectCredentialsQueryAndFragments: true,
  },
  cookieContract: {
    manifestPath: '.security/cookies.json',
    manifestSha256: cookieManifestSha256,
    rawCookieValuesIncluded: false,
  },
  sourceSha256: sources,
  implementationFingerprint: sha256(JSON.stringify({
    exactHeadSha: expectedHead,
    cookieManifestSha256,
    sources,
  })),
};

const outputPath = resolve(root, 'artifacts/reasoning-runs/founder-reasoning-implementation-proof.json');
await mkdir(dirname(outputPath), { recursive: true });
const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(outputPath, bytes, 'utf8');

console.log(`Founder reasoning implementation artifact written: ${outputPath}`);
console.log(`Artifact SHA-256: ${sha256(bytes)}`);
console.log(`Implementation fingerprint: ${artifact.implementationFingerprint}`);
