import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const FULL_SHA = /^[0-9a-f]{40}$/i;

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function resolveBaseSha() {
  const supplied = String(process.env.DOC_TRUTH_BASE_SHA || '').trim().toLowerCase();
  if (FULL_SHA.test(supplied)) return supplied;
  try {
    const parent = git('rev-parse', 'HEAD^').toLowerCase();
    if (FULL_SHA.test(parent)) return parent;
  } catch {
    // handled below
  }
  throw new Error('DOCUMENTATION_TRUTH_BASE_UNKNOWN: provide DOC_TRUTH_BASE_SHA or full git history');
}

const baseSha = resolveBaseSha();
const headSha = git('rev-parse', 'HEAD').toLowerCase();
if (!FULL_SHA.test(headSha)) throw new Error('DOCUMENTATION_TRUTH_HEAD_INVALID');

try {
  git('merge-base', '--is-ancestor', baseSha, headSha);
} catch {
  throw new Error(`DOCUMENTATION_TRUTH_BASE_NOT_ANCESTOR: ${baseSha} is not an ancestor of ${headSha}`);
}

const changedFiles = git('diff', '--name-only', `${baseSha}..${headSha}`)
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean);

const truthSensitiveRules = [
  { domain: 'publishing', match: /^src\/lib\/(?:firstParty|temporallyGoverned|n8n|founderSignal|truthLease)/ },
  { domain: 'publishing', match: /^src\/http\/routes\/n8nConveyor\.ts$/ },
  { domain: 'publishing', match: /^tools\/zapier\/(?:founder-content|social-distribution|buffer)/ },
  { domain: 'truth-governance', match: /^src\/governance\// },
  { domain: 'truth-governance', match: /^src\/lib\/mergeAuthorityBoundary\.ts$/ },
  { domain: 'truth-governance', match: /^src\/futureyou\// },
  { domain: 'provider-authority', match: /^src\/providers\// },
  { domain: 'provider-authority', match: /^config\/cloudflare-worker-git-authority-policy\.json$/ },
  { domain: 'provider-authority', match: /^wrangler\.worker\.toml$/ },
  { domain: 'provider-authority', match: /^\.github\/workflows\/(?:deploy|cloudflare-build-diagnostic)\.yml$/ },
  { domain: 'capability-authority', match: /^\.control\/capability\.(?:json|yaml)$/ },
  { domain: 'workflow-authority', match: /^\.github\/workflows\/(?:ci|quality-gate|pr-recovery-exact-head|founder-repo-cycle)\.yml$/ },
];

const truthSensitiveChanges = changedFiles
  .map((file) => ({
    file,
    domains: [...new Set(truthSensitiveRules.filter((rule) => rule.match.test(file)).map((rule) => rule.domain))],
  }))
  .filter((entry) => entry.domains.length > 0);

const changedDocs = changedFiles.filter((file) =>
  file === 'README.md' ||
  file.endsWith('.md') && (file.startsWith('docs/') || file.startsWith('.ai/skills/')),
);

const failures = [];
const requiredDocs = new Set();
const domains = new Set(truthSensitiveChanges.flatMap((entry) => entry.domains));

if (truthSensitiveChanges.length > 0) {
  requiredDocs.add('README.md');
  if (domains.has('publishing')) requiredDocs.add('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md');
  if (domains.has('truth-governance') || domains.has('workflow-authority')) {
    requiredDocs.add('docs/FOUNDER_MERGE_AUTHORITY.md');
    requiredDocs.add('.ai/skills/juss-flow-launch-loop/SKILL.md');
  }
  if (domains.has('provider-authority')) requiredDocs.add('docs/CLOUDFLARE_REASONING.md');
  if (domains.has('capability-authority')) requiredDocs.add('README.md');

  for (const required of requiredDocs) {
    if (!changedFiles.includes(required)) {
      failures.push(`truth-sensitive change requires documentation refresh: ${required}`);
    }
  }
}

const readme = read('README.md');
const publicTruth = read('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md');
const futureYouMe = read('docs/founder-signal-engine/futureyou-me-shared-output-contract.md');
const truthDecay = read('docs/TRUTH_DECAY_AUDIT.md');
const mergeAuthority = read('docs/FOUNDER_MERGE_AUTHORITY.md');
const launchLoop = read('.ai/skills/juss-flow-launch-loop/SKILL.md');

const consistencyChecks = [
  [readme.includes('Documentation truth gate'), 'README must describe the Documentation truth gate'],
  [readme.includes('first-party LinkedIn') && readme.includes('provider-neutral n8n'), 'README must describe current LinkedIn + n8n distribution authority'],
  [publicTruth.includes('Current executable publication authority'), 'public communication contract must declare current executable publication authority'],
  [publicTruth.includes('exact Current You approval'), 'public communication contract must require exact Current You approval for the current executable path'],
  [!publicTruth.includes('This standing authorization removes the need for per-post founder approval'), 'public communication contract must not retain the superseded no-per-post-approval claim as current truth'],
  [futureYouMe.includes('CURRENT EXECUTION UPDATE'), 'FutureYou + ME contract must distinguish the current execution update from historical Zapier budgeting'],
  [futureYouMe.includes('first-party LinkedIn') && futureYouMe.includes('provider-neutral n8n'), 'FutureYou + ME contract must name the current direct LinkedIn + n8n architecture'],
  [truthDecay.includes('Documentation truth gate'), 'truth-decay audit must record the documentation truth implementation'],
  [mergeAuthority.includes('Documentation truth'), 'merge authority must require documentation truth reconciliation'],
  [launchLoop.includes('Documentation truth gate'), 'launch loop must include the Documentation truth gate'],
  [launchLoop.includes('Truth Lease'), 'launch loop must include Truth Lease revalidation'],
  [launchLoop.includes('Hormozi pass'), 'launch loop must include the Hormozi value pass'],
  [launchLoop.includes('Parallel lenses, serialized authority'), 'launch loop must preserve parallel reasoning with serialized mutations'],
];

for (const [passed, message] of consistencyChecks) {
  if (!passed) failures.push(message);
}

const report = {
  contract: 'fcr/documentation-truth@v1',
  baseSha,
  headSha,
  changedFileCount: changedFiles.length,
  truthSensitiveFileCount: truthSensitiveChanges.length,
  truthSensitiveDomains: [...domains].sort(),
  changedDocs,
  requiredDocs: [...requiredDocs].sort(),
  documentationCoveragePercent: requiredDocs.size === 0
    ? 100
    : Math.round(([...requiredDocs].filter((file) => changedFiles.includes(file)).length / requiredDocs.size) * 100),
  consistencyCheckCount: consistencyChecks.length,
  failureCount: failures.length,
  failures,
  status: failures.length === 0 ? 'CURRENT' : 'DRIFT',
};

mkdirSync(path.join(root, 'artifacts'), { recursive: true });
writeFileSync(
  path.join(root, 'artifacts/documentation-truth-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

if (failures.length > 0) {
  console.error('Documentation truth verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log('Documentation truth verification passed.');
console.log(JSON.stringify(report, null, 2));
