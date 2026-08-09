const contract = 'founder-control-room/cloudflare-build-verification-only@v1';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in Cloudflare Workers Builds`);
  return value;
}

const workersCi = required('WORKERS_CI');
if (workersCi !== '1') {
  throw new Error('verification-only command may run only inside Cloudflare Workers Builds');
}

const commitSha = required('WORKERS_CI_COMMIT_SHA');
if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  throw new Error(`WORKERS_CI_COMMIT_SHA must be an exact 40-character Git SHA, got ${commitSha.length}`);
}

const branch = required('WORKERS_CI_BRANCH');
const buildUuid = required('WORKERS_CI_BUILD_UUID');

const receipt = {
  contract,
  provider: 'cloudflare-workers-builds',
  mode: 'verification-only',
  build_uuid: buildUuid,
  branch,
  commit_sha: commitSha.toLowerCase(),
  production_mutation: false,
  worker_version_upload: false,
  runtime_secret_access_required: false,
  production_authority: 'github-actions:.github/workflows/deploy.yml',
};

console.log(JSON.stringify(receipt));
