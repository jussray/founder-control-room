import { readFileSync } from 'node:fs';

const contract = 'fcr/cloudflare-fcr-mail-verification-only@v1';
const policy = JSON.parse(
  readFileSync(new URL('../config/cloudflare-fcr-mail-provider-policy.json', import.meta.url), 'utf8'),
);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in Cloudflare Workers Builds`);
  return value;
}

if (policy.kind !== 'fcr/cloudflare-provider-only-worker-policy@v1') {
  throw new Error(`Unexpected fcr_mail policy kind: ${policy.kind}`);
}
if (policy.workerName !== 'fcr_mail') {
  throw new Error(`Unexpected provider-only Worker identity: ${policy.workerName}`);
}
if (policy.repositoryOwnsRuntimeCode !== false || policy.nativeGitBuildMode !== 'verification-only') {
  throw new Error('fcr_mail must remain provider-only and verification-only until separately migrated or retired');
}

const workersCi = required('WORKERS_CI');
if (workersCi !== '1') {
  throw new Error('fcr_mail verification-only command may run only inside Cloudflare Workers Builds');
}

const commitSha = required('WORKERS_CI_COMMIT_SHA').toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  throw new Error('WORKERS_CI_COMMIT_SHA must be an exact 40-character Git SHA');
}

const branch = required('WORKERS_CI_BRANCH');
const buildUuid = required('WORKERS_CI_BUILD_UUID');

const receipt = {
  contract,
  provider: 'cloudflare-workers-builds',
  worker: policy.workerName,
  source_status: policy.sourceStatus,
  mode: 'verification-only',
  build_uuid: buildUuid,
  branch,
  commit_sha: commitSha,
  production_mutation: false,
  worker_version_upload: false,
  wrangler_auto_configuration: false,
  repository_runtime_code_claimed: false,
  provider_mutation_authorized: false,
  next_gate: 'fresh provider readback before migrate-or-retire decision',
};

console.log(JSON.stringify(receipt));
