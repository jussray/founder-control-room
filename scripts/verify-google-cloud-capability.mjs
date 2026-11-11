import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/google-cloud-capability.json', import.meta.url), 'utf8'));
const installer = await readFile(new URL('./install-google-cloud-cli.sh', import.meta.url), 'utf8');
const docs = await readFile(new URL('../docs/GOOGLE_CLOUD_CAPABILITY.md', import.meta.url), 'utf8');
const registry = await readFile(new URL('../src/capabilities/workbenchRegistry.ts', import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(config.cli.version === '584.0.0', 'Google Cloud CLI must stay pinned to 584.0.0');
assert(config.connectionType === 'other', 'Google Cloud must reuse the existing other provider slot');
assert(config.oauth.scopePolicy === 'least-privilege', 'OAuth must remain least-privilege');
assert(config.oauth.credentialsInRepository === false, 'OAuth credentials must never be stored in Git');
assert(config.assistantUse.allowed === true, 'Assistant-use boundary must be explicit');
assert(config.assistantUse.discoveryIsAuthority === false, 'Capability discovery must not grant authority');
assert(config.continuity.markersAreAuthority === false, 'Fingerprints/proof cookies must not grant authority');
assert(config.authority.billingIamSecretsDelete === 'never-implicit', 'High-impact Google mutations must never be implicit');

for (const required of [
  'GCLOUD_VERSION="584.0.0"',
  'sha256sum --check --status',
  '--usage-reporting=false',
  '--path-update=false',
]) {
  assert(installer.includes(required), `Pinned installer missing boundary: ${required}`);
}

for (const required of [
  'Supabase Google OAuth',
  'Discovery never grants authority',
  "project_connections.connection_type = 'other'",
  'real-path browser proof for login/signup',
]) {
  assert(docs.includes(required), `Google Cloud capability doc missing boundary: ${required}`);
}

for (const required of [
  "id: 'google-cloud-provider-v1'",
  'same Google capability',
  'least-privilege OAuth scopes',
  'credentials remain outside the repository',
]) {
  assert(registry.includes(required), `Capability registry missing Google boundary: ${required}`);
}

console.log('Google Cloud capability boundary verified');
