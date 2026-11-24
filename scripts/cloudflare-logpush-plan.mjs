import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const CONFIG = 'config/cloudflare-logpush.portfolio.json';
const RECEIPT = 'test-results/cloudflare-logpush.json';
const clean = (v) => typeof v === 'string' ? v.trim() : '';
const fp = (v) => createHash('sha256').update(String(v)).digest('hex');
const envv = (env, name) => clean(env?.[name]);

export function validateConfig(config) {
  if (!config || config.schemaVersion !== '1.0') throw new Error('Logpush schemaVersion must be 1.0.');
  const a = config.authority ?? {};
  for (const key of ['repository','accountIdEnv','inspectTokenEnv','applyTokenEnv','destinationEnv','approvalReferenceEnv']) {
    if (!clean(a[key])) throw new Error(`Logpush authority.${key} is required.`);
  }
  if (a.mutationPolicy !== 'manual-founder-gated') throw new Error('Logpush mutationPolicy must remain manual-founder-gated.');
  if (!Array.isArray(config.repositories) || !config.repositories.length) throw new Error('Logpush repositories are required.');
  if (new Set(config.repositories).size !== config.repositories.length) throw new Error('Duplicate Logpush repository.');
  if (!Array.isArray(config.jobs) || !config.jobs.length) throw new Error('Logpush jobs are required.');
  const names = new Set();
  for (const job of config.jobs) {
    if (!clean(job?.name) || !clean(job?.dataset)) throw new Error('Each Logpush job requires name and dataset.');
    if (job.scope !== 'account') throw new Error('Only account-scoped Logpush jobs are enabled by this control plane.');
    if (typeof job.enabled !== 'boolean') throw new Error('Each Logpush job requires boolean enabled.');
    if (names.has(job.name)) throw new Error(`Duplicate Logpush job name: ${job.name}`);
    names.add(job.name);
  }
  return config;
}

export async function loadConfig(path = CONFIG) {
  return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}

async function cf({ token, fetchImpl }, method, path, body) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const error = new Error(`Cloudflare ${method} ${path} failed with status ${response.status}`);
    error.classification = 'provider-request-failed';
    error.providerStatus = response.status;
    throw error;
  }
  return payload?.result ?? null;
}

const listJobs = async (ctx) => {
  const result = await cf(ctx, 'GET', `/accounts/${ctx.accountId}/logpush/jobs`);
  return Array.isArray(result) ? result : [];
};
const matches = (jobs, d) => jobs.filter((j) => clean(j?.name) === d.name && clean(j?.dataset) === d.dataset);
const bodyFor = (d, destination) => ({ name: d.name, dataset: d.dataset, enabled: d.enabled, destination_conf: destination });
const diff = (j, d, destination) => [
  ...(j.enabled === d.enabled ? [] : ['enabled']),
  ...(destination && clean(j.destination_conf) !== destination ? ['destination'] : []),
];
const publicJob = (j) => ({
  id: Number.isInteger(j?.id) ? j.id : null,
  name: clean(j?.name) || null,
  dataset: clean(j?.dataset) || null,
  enabled: typeof j?.enabled === 'boolean' ? j.enabled : null,
  lastComplete: clean(j?.last_complete) || null,
  lastError: clean(j?.last_error) || null,
  errorMessagePresent: Boolean(clean(j?.error_message)),
  destinationFingerprint: clean(j?.destination_conf) ? fp(j.destination_conf) : null,
});

export async function reconcileLogpush({ config, env = process.env, fetchImpl = fetch, apply = false } = {}) {
  const c = validateConfig(config);
  const a = c.authority;
  const accountId = envv(env, a.accountIdEnv);
  const credentialSource = apply ? a.applyTokenEnv : a.inspectTokenEnv;
  const token = envv(env, credentialSource);
  const destination = envv(env, a.destinationEnv);
  const approvalReference = envv(env, a.approvalReferenceEnv);
  if (!accountId) { const e = new Error(`${a.accountIdEnv} is required.`); e.classification='account-id-required'; throw e; }
  if (!token) { const e = new Error(`${credentialSource} is required.`); e.classification = apply ? 'dedicated-write-credential-required' : 'dedicated-read-credential-required'; throw e; }
  if (apply && !approvalReference) { const e = new Error(`${a.approvalReferenceEnv} is required for apply.`); e.classification='approval-reference-required-for-apply'; throw e; }
  if (apply && !destination) { const e = new Error(`${a.destinationEnv} is required for apply.`); e.classification='destination-required-for-apply'; throw e; }

  const ctx = { token, fetchImpl, accountId };
  const before = await listJobs(ctx);
  const receipts = [];
  let mutationPerformed = false;
  for (const desired of c.jobs) {
    const found = matches(before, desired);
    if (found.length > 1) { const e = new Error(`Multiple provider jobs match ${desired.name}.`); e.classification='duplicate-provider-jobs'; throw e; }
    if (!found.length) {
      if (!apply) { receipts.push({ name:desired.name, dataset:desired.dataset, state:'attention', action:'would-create', existing:null }); continue; }
      const created = await cf(ctx, 'POST', `/accounts/${accountId}/logpush/jobs`, bodyFor(desired, destination));
      mutationPerformed = true;
      receipts.push({ name:desired.name, dataset:desired.dataset, state:'changed', action:'created', existing:publicJob(created) });
      continue;
    }
    const current = found[0];
    const differences = diff(current, desired, destination);
    if (!differences.length) { receipts.push({ name:desired.name, dataset:desired.dataset, state:'clear', action:'none', existing:publicJob(current) }); continue; }
    if (!apply) { receipts.push({ name:desired.name, dataset:desired.dataset, state:'attention', action:'would-update', differences, existing:publicJob(current) }); continue; }
    if (!Number.isInteger(current.id)) { const e = new Error(`Provider job ${desired.name} has no numeric id.`); e.classification='provider-job-id-missing'; throw e; }
    const updated = await cf(ctx, 'PUT', `/accounts/${accountId}/logpush/jobs/${current.id}`, bodyFor(desired, destination));
    mutationPerformed = true;
    receipts.push({ name:desired.name, dataset:desired.dataset, state:'changed', action:'updated', differences, existing:publicJob(updated) });
  }

  const after = apply ? await listJobs(ctx) : before;
  const readback = c.jobs.map((desired) => {
    const found = matches(after, desired);
    if (found.length !== 1) return { name:desired.name, verified:false, reason:`match-count-${found.length}` };
    const differences = diff(found[0], desired, destination);
    const destinationVerified = destination ? clean(found[0].destination_conf) === destination : null;
    return {
      name:desired.name,
      verified:differences.length === 0 && destinationVerified === true,
      destinationVerified,
      differences,
      state:publicJob(found[0]),
    };
  });
  return {
    schemaVersion:1,
    scope:'cloudflare-logpush-portfolio',
    authorityRepository:a.repository,
    observedAt:new Date().toISOString(),
    expectedHeadSha:envv(env,'EXPECTED_HEAD_SHA') || envv(env,'GITHUB_SHA') || null,
    accountIdFingerprint:fp(accountId),
    credentialSource,
    applyRequested:apply,
    approvalReference:apply ? approvalReference : null,
    mutationPerformed,
    destinationConfigured:Boolean(destination),
    destinationFingerprint:destination ? fp(destination) : null,
    repositories:c.repositories,
    jobs:receipts,
    readback,
    verified:readback.every((r) => r.verified),
  };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'verify';
  const config = await loadConfig();
  if (command === 'verify') return void process.stdout.write(`${JSON.stringify({ok:true,repositories:config.repositories.length,jobs:config.jobs.length})}\n`);
  if (!['inspect','apply'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const receipt = await reconcileLogpush({ config, apply: command === 'apply' });
  await mkdir('test-results', { recursive:true });
  await writeFile(RECEIPT, `${JSON.stringify(receipt,null,2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({verified:receipt.verified,mutationPerformed:receipt.mutationPerformed,receipt:RECEIPT})}\n`);
  if (command === 'apply' && !receipt.verified) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({error:error?.message || String(error),classification:error?.classification || 'unclassified',providerStatus:error?.providerStatus ?? null})}\n`);
    process.exitCode = 1;
  });
}
