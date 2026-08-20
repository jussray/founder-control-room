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
  { domain: 'merge-authority', match: /^src\/http\/routes\/approvals\.ts$/ },
  { domain: 'merge-authority', match: /^src\/review\/(?!.*\.test\.ts$)/ },
  { domain: 'repository-provider', match: /^src\/providers\/(?!__tests__\/)(?!.*\.test\.ts$)/ },
  { domain: 'publishing', match: /^src\/lib\/(?:firstPartyFounderContent|temporallyGovernedFounderContent|n8nFounderContent|n8nProviderNeutralFounderContent|founderSignal)/ },
  { domain: 'publishing', match: /^src\/http\/routes\/n8nConveyor\.ts$/ },
  { domain: 'truth-governance', match: /^src\/governance\/(?!.*\.test\.ts$)/ },
  { domain: 'truth-governance', match: /^src\/futureyou\/(?!.*\.test\.ts$)/ },
  { domain: 'truth-governance', match: /^src\/buildEvents\/(?!__tests\/)(?!.*\.test\.ts$)/ },
  { domain: 'truth-governance', match: /^src\/http\/routes\/(?:buildEvents|buildEventReceipts)\.ts$/ },
  { domain: 'capability-authority', match: /^\.control\/capability\.(?:json|yaml)$/ },
  { domain: 'workflow-authority', match: /^\.github\/workflows\/(?:ci|quality-gate|pr-recovery-exact-head|founder-repo-cycle|documentation-truth)\.yml$/ },
  { domain: 'cloudflare-authority', match: /^public\/_worker\.js$/ },
  { domain: 'cloudflare-authority', match: /^\.github\/workflows\/(?:deploy|cloudflare-build-diagnostic|fcr-access-front-door-recovery)\.yml$/ },
  { domain: 'cloudflare-authority', match: /^config\/cloudflare-/ },
  { domain: 'cloudflare-authority', match: /^wrangler\./ },
];

const truthSensitiveChanges = changedFiles
  .map((file) => ({
    file,
    domains: [...new Set(truthSensitiveRules.filter((rule) => rule.match.test(file)).map((rule) => rule.domain))],
  }))
  .filter((entry) => entry.domains.length > 0);

const domains = new Set(truthSensitiveChanges.flatMap((entry) => entry.domains));
const requiredDocs = new Set();

if (truthSensitiveChanges.length > 0) requiredDocs.add('README.md');
if (domains.has('merge-authority') || domains.has('workflow-authority')) {
  requiredDocs.add('docs/FOUNDER_MERGE_AUTHORITY.md');
  requiredDocs.add('GLOBAL_AI.md');
  requiredDocs.add('.ai/skills/juss-flow-launch-loop/SKILL.md');
}
if (domains.has('publishing')) requiredDocs.add('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md');
if (domains.has('truth-governance')) requiredDocs.add('docs/TRUTH_DECAY_AUDIT.md');
if (domains.has('repository-provider')) requiredDocs.add('docs/PROVIDERS.md');
if (domains.has('cloudflare-authority')) {
  requiredDocs.add('docs/CLOUDFLARE_REASONING.md');
  requiredDocs.add('docs/deployment/CLOUDFLARE_WORKER_TARGETS.md');
}

const failures = [];
for (const required of requiredDocs) {
  if (!changedFiles.includes(required)) {
    failures.push(`truth-sensitive change requires current documentation refresh: ${required}`);
  }
}

const readme = read('README.md');
const mergeAuthority = read('docs/FOUNDER_MERGE_AUTHORITY.md');
const globalAi = read('GLOBAL_AI.md');
const agents = read('AGENTS.md');
const chatgpt = read('CHATGPT.md');
const claude = read('CLAUDE.md');
const perplexity = read('PERPLEXITY.md');
const launchLoop = read('.ai/skills/juss-flow-launch-loop/SKILL.md');
const publicTruth = read('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md');
const truthDecay = read('docs/TRUTH_DECAY_AUDIT.md');
const cloudflareTargets = read('docs/deployment/CLOUDFLARE_WORKER_TARGETS.md');
const ci = read('.github/workflows/ci.yml');
const documentationWorkflow = read('.github/workflows/documentation-truth.yml');

const consistencyChecks = [
  [!readme.includes('**Last refreshed:**'), 'README must not present a manually refreshed date as durable current repository authority'],
  [readme.includes('Current identity is resolved at use time'), 'README must resolve current repository identity at use time'],
  [readme.includes('Documentation truth gate'), 'README must describe the Documentation truth gate'],
  [readme.includes('first-party LinkedIn') && readme.includes('provider-neutral n8n'), 'README must describe the current founder-content execution mesh'],
  [readme.includes('`.control/capability.json`') && readme.includes('canonical capability authority'), 'README must name capability.json as canonical capability authority'],
  [mergeAuthority.includes('deterministic independent review') && mergeAuthority.includes('founder-final') && mergeAuthority.includes('FCR_TRUSTED_SEMANTIC_REVIEWER_IDS'), 'merge authority must describe canonical founder-final review plus legacy semantic-review compatibility'],
  [mergeAuthority.includes('live GitHub') && mergeAuthority.includes('separate provider gate'), 'merge authority must distinguish FCR source/runtime enforcement from live GitHub provider enforcement'],
  [mergeAuthority.includes('Documentation truth'), 'merge authority must require documentation truth reconciliation'],
  [globalAi.includes('Truth Lease') && globalAi.includes('Documentation truth'), 'GLOBAL_AI must include truth-aging and documentation-truth rules'],
  [globalAi.includes('Product Design') && globalAi.includes('Data Analytics') && globalAi.includes('Hormozi'), 'GLOBAL_AI must include product, analytics, and value lenses'],
  [globalAi.includes('/garyvee lindymode redteam l99 redteam ooda'), 'GLOBAL_AI must preserve the legacy founder-stack compatibility alias'],
  [globalAi.includes('deterministic independent review') && globalAi.includes('founder-final'), 'GLOBAL_AI must preserve the FCR deterministic-review then founder-final authority split'],
  [launchLoop.includes('Parallel lenses, serialized authority'), 'launch loop must preserve parallel reasoning with serialized authority'],
  [launchLoop.includes('Truth Lease') && launchLoop.includes('Documentation truth gate'), 'launch loop must include truth aging and documentation reconciliation'],
  [launchLoop.includes('deterministic exact-head review') && launchLoop.includes('founder-final'), 'launch loop must preserve deterministic review before founder-final merge authority'],
  [agents.includes('Historical Day 3 provenance') && !agents.includes('Current Day 3 source:'), 'AGENTS must preserve old Day 3 state as historical provenance, never current authority'],
  [agents.includes('provider-neutral n8n') && agents.includes('Truth Lease') && agents.includes('Documentation Truth'), 'AGENTS must inherit the current provider-neutral truth-aging workflow'],
  [!agents.includes('approved automated publishing class explicitly authorized'), 'AGENTS must not retain the superseded standing automated-publication shortcut'],
  [chatgpt.includes('post-merge') && chatgpt.includes('Documentation Truth') && chatgpt.includes('Truth Lease'), 'ChatGPT contract must re-observe truth after merges'],
  [claude.includes('GLOBAL_AI.md') && claude.includes('provider-neutral n8n') && claude.includes('Truth Lease') && claude.includes('Documentation Truth'), 'Claude contract must inherit current provider-neutral truth-aging rules'],
  [!claude.includes('Current provider truth:'), 'Claude contract must not freeze provider routing as durable current truth'],
  [perplexity.includes('GLOBAL_AI.md') && perplexity.includes('provider-neutral n8n') && perplexity.includes('Truth Lease') && perplexity.includes('Documentation Truth'), 'Perplexity contract must inherit current provider-neutral truth-aging rules'],
  [publicTruth.includes('Temporal reuse and truth decay') && publicTruth.includes('Sauce boundary'), 'public communication contract must preserve temporal truth and sauce boundaries'],
  [truthDecay.includes('Documentation truth gate'), 'truth-decay audit must record the documentation drift control'],
  [truthDecay.includes('Analytics remains observation-only'), 'truth-decay audit must keep analytics observation-only'],
  [cloudflareTargets.includes('FCR_API') && cloudflareTargets.includes('Service Binding'), 'Cloudflare target docs must describe the Pages FCR_API service-binding dependency'],
  [cloudflareTargets.includes('not a claim that the current Cloudflare Pages project is configured correctly'), 'Cloudflare target docs must keep source dependency separate from live provider proof'],
  [ci.includes('documentation-truth:') && ci.includes('- documentation-truth'), 'CI Required Gate must depend on Documentation Truth'],
  [documentationWorkflow.includes('Documentation truth gate') && documentationWorkflow.includes('scripts/verify-documentation-truth.mjs'), 'standalone Documentation Truth workflow must execute the verifier'],
];

for (const [passed, message] of consistencyChecks) {
  if (!passed) failures.push(message);
}

const changedDocs = changedFiles.filter((file) =>
  file === 'README.md'
  || file === 'GLOBAL_AI.md'
  || file === 'AGENTS.md'
  || file === 'CHATGPT.md'
  || file === 'CLAUDE.md'
  || file === 'PERPLEXITY.md'
  || file.endsWith('.md') && (file.startsWith('docs/') || file.startsWith('.ai/skills/')),
);

const report = {
  contract: 'fcr/documentation-truth@v1',
  baseSha,
  headSha,
  changedFileCount: changedFiles.length,
  truthSensitiveFileCount: truthSensitiveChanges.length,
  truthSensitiveDomains: [...domains].sort(),
  requiredDocs: [...requiredDocs].sort(),
  changedDocs,
  documentationCoveragePercent: requiredDocs.size === 0
    ? 100
    : Math.round(([...requiredDocs].filter((file) => changedFiles.includes(file)).length / requiredDocs.size) * 100),
  consistencyCheckCount: consistencyChecks.length,
  failureCount: failures.length,
  failures,
  status: failures.length === 0 ? 'CURRENT' : 'DRIFT',
};

mkdirSync(path.join(root, 'artifacts'), { recursive: true });
writeFileSync(path.join(root, 'artifacts/documentation-truth-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('Documentation truth verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log('Documentation truth verification passed.');
console.log(JSON.stringify(report, null, 2));