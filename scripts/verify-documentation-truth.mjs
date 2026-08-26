import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const FULL_SHA = /^[0-9a-f]{40}$/i;
const DOCUMENTATION_RECEIPT_PATH = 'docs/DOCUMENTATION_TRUTH_RECEIPT.json';
const DOCUMENTATION_RECEIPT_CONTRACT = 'fcr/documentation-truth-receipt@v1';
const MINIMUM_MEANINGFUL_DOC_TEXT_LENGTH = 32;
const MINIMUM_MEANINGFUL_INVARIANT_LENGTH = 48;

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
if (baseSha === headSha) {
  throw new Error('DOCUMENTATION_TRUTH_BASE_EQUALS_HEAD: a truth receipt requires a non-empty reviewed range');
}

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
  { domain: 'truth-governance', match: /^src\/services\/buildEventStore\.ts$/ },
  { domain: 'truth-governance', match: /^scripts\/verify-documentation-truth\.mjs$/ },
  { domain: 'truth-governance', match: /^\.ai\/skills\/goalfix\/SKILL\.md$/ },
  { domain: 'truth-governance', match: /^\.claude\/skills\/goalfix\/SKILL\.md$/ },
  { domain: 'truth-governance', match: /^docs\/(?:FOUNDER_ADAPTIVE_KERNEL_V0|GOALFIX_EXECUTION_WORKFLOW_V2|CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC|PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC)\.md$/ },
  { domain: 'evidence-authority', match: /^src\/evidence\/(?!__tests__\/)(?!.*\.test\.ts$)/ },
  { domain: 'evidence-authority', match: /^public\/control-room\/evidence-trust\.html$/ },
  { domain: 'evidence-authority', match: /^\.github\/workflows\/playwright\.yml$/ },
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
if (domains.has('truth-governance') || domains.has('evidence-authority')) requiredDocs.add('docs/TRUTH_DECAY_AUDIT.md');
if (domains.has('repository-provider')) requiredDocs.add('docs/PROVIDERS.md');
if (domains.has('cloudflare-authority')) {
  requiredDocs.add('docs/CLOUDFLARE_REASONING.md');
  requiredDocs.add('docs/deployment/CLOUDFLARE_WORKER_TARGETS.md');
}

const failures = [];

function nonEmptyString(value, maximumLength = 600) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximumLength;
}

function normalizedNarrativeText(value) {
  return String(value)
    .replace(/[\`*>#~\[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulNarrative(value, minimumLength = MINIMUM_MEANINGFUL_DOC_TEXT_LENGTH) {
  const normalized = normalizedNarrativeText(value);
  const words = normalized.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  return normalized.length >= minimumLength
    && words.length >= 5
    && words.some((word) => word.length >= 4);
}

function visibleOutsideHtmlComments(value, state) {
  let cursor = 0;
  let visible = '';
  while (cursor < value.length) {
    if (state.insideComment) {
      const closing = value.indexOf('-->', cursor);
      if (closing < 0) return visible;
      state.insideComment = false;
      cursor = closing + 3;
      continue;
    }

    const opening = value.indexOf('<!--', cursor);
    if (opening < 0) return `${visible}${value.slice(cursor)}`;
    visible += value.slice(cursor, opening);
    state.insideComment = true;
    cursor = opening + 4;
  }
  return visible;
}

function semanticDocChange(relativePath) {
  const diff = git('diff', '--unified=0', '--no-ext-diff', `${baseSha}..${headSha}`, '--', relativePath);
  const commentState = { added: { insideComment: false }, removed: { insideComment: false } };
  return diff.split('\n').some((line) => {
    if (!line.startsWith('+') && !line.startsWith('-')) return false;
    if (line.startsWith('+++') || line.startsWith('---')) return false;
    const state = line.startsWith('+') ? commentState.added : commentState.removed;
    const content = visibleOutsideHtmlComments(line.slice(1), state);
    return meaningfulNarrative(content);
  });
}

function meaningfulInvariant(claim, sourcePath) {
  return meaningfulNarrative(claim, MINIMUM_MEANINGFUL_INVARIANT_LENGTH)
    && String(claim).includes(sourcePath)
    && /\b(must|cannot|requires?|rejects?|withhold|binds?|only|never|fail(?:s|ed)?\s+closed)\b/i.test(claim);
}

function documentationReceipt() {
  let parsed;
  try {
    parsed = JSON.parse(read(DOCUMENTATION_RECEIPT_PATH));
  } catch {
    failures.push('documentation truth receipt must be valid JSON');
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    failures.push('documentation truth receipt must be an object');
    return null;
  }
  if (parsed.contract !== DOCUMENTATION_RECEIPT_CONTRACT) {
    failures.push('documentation truth receipt contract is invalid');
  }
  if (!nonEmptyString(parsed.purpose) || !meaningfulNarrative(parsed.purpose, MINIMUM_MEANINGFUL_INVARIANT_LENGTH)) {
    failures.push('documentation truth receipt must state a bounded purpose');
  }
  if (!Array.isArray(parsed.domains)
    || parsed.domains.some((value) => !nonEmptyString(value, 120) || !/^[a-z][a-z0-9-]{2,119}$/.test(value))
    || new Set(parsed.domains).size !== parsed.domains.length) {
    failures.push('documentation truth receipt domains are invalid');
  }
  if (!Array.isArray(parsed.changes)) {
    failures.push('documentation truth receipt changes are invalid');
    return null;
  }

  const claimsByPath = new Map();
  for (const change of parsed.changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      failures.push('documentation truth receipt change is invalid');
      continue;
    }
    if (!nonEmptyString(change.path, 300) || !Array.isArray(change.claims)
      || change.claims.length === 0 || change.claims.some((claim) => !nonEmptyString(claim))) {
      failures.push('documentation truth receipt change must name a path and one or more bounded invariants');
      continue;
    }
    claimsByPath.set(change.path, change.claims);
  }
  return {
    domains: new Set(Array.isArray(parsed.domains) ? parsed.domains : []),
    claimsByPath,
  };
}

let receipt = null;
if (truthSensitiveChanges.length > 0) {
  if (!changedFiles.includes(DOCUMENTATION_RECEIPT_PATH)) {
    failures.push(`truth-sensitive change requires a current documentation receipt: ${DOCUMENTATION_RECEIPT_PATH}`);
  }
  if (!semanticDocChange(DOCUMENTATION_RECEIPT_PATH)) {
    failures.push('documentation truth receipt must contain a substantive, non-comment change');
  }
  receipt = documentationReceipt();
  if (receipt) {
    for (const domain of domains) {
      if (!receipt.domains.has(domain)) {
        failures.push(`documentation truth receipt must name changed domain: ${domain}`);
      }
    }
    for (const change of truthSensitiveChanges) {
      const claims = receipt.claimsByPath.get(change.file) ?? [];
      if (!claims.some((claim) => meaningfulInvariant(claim, change.file))) {
        failures.push(`documentation truth receipt must name a meaningful path-bound invariant for: ${change.file}`);
      }
    }
  }
}

for (const required of requiredDocs) {
  if (!changedFiles.includes(required)) {
    failures.push(`truth-sensitive change requires current documentation refresh: ${required}`);
  } else if (!semanticDocChange(required)) {
    failures.push(`truth-sensitive change requires a substantive documentation refresh: ${required}`);
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
const goalfixSkill = read('.ai/skills/goalfix/SKILL.md');
const claudeGoalfixSkill = read('.claude/skills/goalfix/SKILL.md');
const goalfixWorkflow = read('docs/GOALFIX_EXECUTION_WORKFLOW_V2.md');
const adaptiveKernel = read('docs/FOUNDER_ADAPTIVE_KERNEL_V0.md');
const claudeMaster = read('docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md');
const perplexityMaster = read('docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md');
const ci = read('.github/workflows/ci.yml');
const documentationWorkflow = read('.github/workflows/documentation-truth.yml');

const goalfixExecutionPaths = [
  ['portable Goalfix skill', goalfixSkill],
  ['Claude Goalfix skill', claudeGoalfixSkill],
  ['canonical Goalfix workflow', goalfixWorkflow],
  ['Claude master Goalfix entry point', claudeMaster],
  ['Perplexity master Goalfix entry point', perplexityMaster],
];

const goalfixInvariantChecks = goalfixExecutionPaths.flatMap(([label, content]) => [
  [content.includes('runner_startup_failure') && content.includes('workflow_no_jobs'), `${label} must preserve runner-startup/no-job CI classification before source blame`],
  [/Sauce Guard/i.test(content), `${label} must preserve Sauce Guard stop boundaries`],
  [/Playwright/i.test(content) && /(non-browser|backend)/i.test(content), `${label} must distinguish browser Playwright proof from non-browser/backend proof`],
  [/verified target/i.test(content), `${label} must carry the verified target branch instead of assuming main`],
  [/Founder Final/i.test(content) && /authenticated founder/i.test(content), `${label} must require Founder Final through current authenticated founder authority`],
  [/after Founder Final/i.test(content) && /(?:re-?read|reread)/i.test(content) && /provider/i.test(content), `${label} must reread mutable provider/PR state after Founder Final and immediately before integration`],
  [content.includes('MERGED_UNVERIFIED'), `${label} must preserve MERGED_UNVERIFIED until required runtime truth exists`],
]);

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
  [goalfixWorkflow.includes('FINAL PROVIDER / PR / TARGET / BASE / HEAD / DIFF / CHECK / REVIEW REREAD') && goalfixWorkflow.includes('MERGED_UNVERIFIED'), 'Goalfix workflow must preserve final mutable provider reread and merged-unverified runtime state'],
  [goalfixWorkflow.includes('verified target branch') && !goalfixWorkflow.includes('Reacquire current `main`'), 'Goalfix workflow must carry the verified target branch instead of assuming main'],
  [goalfixSkill.includes('runner_startup_failure') && goalfixSkill.includes('workflow_no_jobs') && goalfixSkill.includes('Sauce Guard'), 'portable Goalfix skill must preserve no-job failure classification and Sauce Guard stops'],
  [/final provider/i.test(goalfixSkill) && /authenticated founder[- ]authority/i.test(goalfixSkill), 'portable Goalfix skill must preserve authenticated Founder Final plus final provider reread'],
  [claudeGoalfixSkill.includes('runner_startup_failure') && claudeGoalfixSkill.includes('workflow_no_jobs') && claudeGoalfixSkill.includes('MERGED_UNVERIFIED'), 'Claude Goalfix skill must preserve no-job classification and merged-unverified state'],
  [adaptiveKernel.includes('does **not** claim') && adaptiveKernel.includes('instruction and decision loops'), 'adaptive kernel must stay scoped to governance behavior unless runtime integration is separately proven'],
  [!goalfixWorkflow.includes('APPROVED SOURCE CONTRACT') && !adaptiveKernel.includes('APPROVED SOURCE CONTRACT'), 'Goalfix durable contracts must use lifecycle-neutral source status rather than manufacturing approved authority'],
  [claudeMaster.includes('Canonical execution contract: `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`') && claudeMaster.includes('canonical workflow wins'), 'Claude master entry point must defer Goalfix execution order to the canonical workflow'],
  [perplexityMaster.includes('Canonical execution contract: `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`') && perplexityMaster.includes('canonical workflow wins'), 'Perplexity master entry point must defer Goalfix execution order to the canonical workflow'],
  ...goalfixInvariantChecks,
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
  || file === DOCUMENTATION_RECEIPT_PATH
  || file.endsWith('.md') && (file.startsWith('docs/') || file.startsWith('.ai/skills/') || file.startsWith('.claude/skills/')),
);

const report = {
  contract: 'fcr/documentation-truth@v2',
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
  documentationReceipt: truthSensitiveChanges.length === 0
    ? { required: false }
    : {
        required: true,
        path: DOCUMENTATION_RECEIPT_PATH,
        updated: changedFiles.includes(DOCUMENTATION_RECEIPT_PATH),
        declaredDomainCount: receipt?.domains.size ?? 0,
        declaredInvariantCount: receipt?.claimsByPath.size ?? 0,
      },
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
