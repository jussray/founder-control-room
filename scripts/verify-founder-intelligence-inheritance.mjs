import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const registryPath = 'config/founder-intelligence.inheritance.json';
const cohesionAuditPath = 'docs/FCR_SINGLE_OS_COHESION_AUDIT.md';
const registry = JSON.parse(await readFile(new URL(registryPath, root), 'utf8'));
const portfolio = await readFile(new URL('src/config/portfolio.ts', root), 'utf8');
const l99Repository = await readFile(new URL('src/config/l99Repository.ts', root), 'utf8');
const entrypoint = await readFile(new URL('AGENTS_FOUNDER_INTELLIGENCE.md', root), 'utf8');
const constitution = await readFile(new URL('docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', root), 'utf8');
const cohesionAudit = await readFile(new URL(cohesionAuditPath, root), 'utf8');

const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

const expectedLoop = [
  '/human',
  '/futureyou',
  '/truthmode',
  '/confess',
  '/billgates',
  '/elonmusk',
  'Build',
  'Verify',
  'Explain',
  'Leave evidence',
  'Teach the next builder',
  'Repeat',
];

const expectedChallengeStack = [
  'ULTRATHINK',
  'Red Team 1 — premise',
  'Lindy mode',
  'L99',
  'Red Team 2 — implementation',
  'OODA',
  'Proof',
  'Rollback / Next Gate',
];

requireValue(registry.schemaVersion === 1, 'schemaVersion must be 1');
requireValue(registry.owner === 'Juss', 'owner must remain Juss');
requireValue(registry.authorityRepository === 'jussray/founder-control-room', 'authority repository mismatch');
requireValue(registry.canonicalConstitution === 'docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', 'canonical constitution mismatch');
requireValue(registry.canonicalEntrypoint === 'AGENTS_FOUNDER_INTELLIGENCE.md', 'canonical entrypoint mismatch');
requireValue(JSON.stringify(registry.requiredLoop) === JSON.stringify(expectedLoop), 'required remembrance loop drifted');
requireValue(JSON.stringify(registry.requiredChallengeStack) === JSON.stringify(expectedChallengeStack), 'required founder challenge stack drifted');
requireValue(typeof registry.inheritanceRule === 'string' && registry.inheritanceRule.includes('may not weaken'), 'inheritance rule must fail closed');
requireValue(typeof registry.truthBoundary === 'string' && registry.truthBoundary.includes('does not prove runtime behavior'), 'truth boundary must separate instruction evidence from runtime proof');
requireValue(
  typeof registry.challengeStackTruthBoundary === 'string'
    && registry.challengeStackTruthBoundary.includes('pending-main must never be reported as landed')
    && registry.challengeStackTruthBoundary.includes('never promotes an external repository into FCR authority'),
  'challenge-stack truth boundary must separate rollout state and external continuity from authority',
);
requireValue(/^\d{4}-\d{2}-\d{2}$/.test(registry.lastInspected), 'lastInspected must use YYYY-MM-DD');

const repositoryConstants = new Map(
  [...l99Repository.matchAll(/export const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"/g)]
    .map((match) => [match[1], match[2]]),
);

const activeStart = portfolio.indexOf('export const PORTFOLIO_PROJECTS');
const externalStart = portfolio.indexOf('export const EXTERNAL_PROJECTS');
const quarantineStart = portfolio.indexOf('export const QUARANTINED_REPOSITORIES');
requireValue(activeStart >= 0, 'portfolio.ts missing PORTFOLIO_PROJECTS');
requireValue(externalStart > activeStart, 'portfolio.ts missing EXTERNAL_PROJECTS after active portfolio');
requireValue(quarantineStart > externalStart, 'portfolio.ts missing quarantine boundary after external projects');

const activePortfolioSource = activeStart >= 0 && externalStart > activeStart
  ? portfolio.slice(activeStart, externalStart)
  : '';
const externalPortfolioSource = externalStart >= 0 && quarantineStart > externalStart
  ? portfolio.slice(externalStart, quarantineStart)
  : '';

function parsePortfolioProjects(source, expectedStatus) {
  return [
    ...source.matchAll(
      /\{\s*slug:\s*"([^"]+)"[\s\S]*?repository:\s*(?:"([^"]+)"|([A-Z0-9_]+))[\s\S]*?status:\s*"([^"]+)"[\s\S]*?\}/g,
    ),
  ].map((match) => {
    const repository = match[2] ?? repositoryConstants.get(match[3]);
    requireValue(
      typeof repository === 'string',
      `${match[1]}: unresolved repository constant ${match[3] ?? 'unknown'}`,
    );
    requireValue(match[4] === expectedStatus, `${match[1]}: expected portfolio status ${expectedStatus}, found ${match[4]}`);
    return { slug: match[1], repository };
  });
}

const projectBlocks = parsePortfolioProjects(activePortfolioSource, 'active');
const externalProjectBlocks = parsePortfolioProjects(externalPortfolioSource, 'external');
const portfolioBySlug = new Map(projectBlocks.map((project) => [project.slug, project.repository]));
const externalPortfolioBySlug = new Map(externalProjectBlocks.map((project) => [project.slug, project.repository]));

const registryProjects = Array.isArray(registry.projects) ? registry.projects : [];
const registryBySlug = new Map();
const repositoryNames = new Set();
const allowedStatuses = new Set(['enforced', 'partial', 'missing']);
const allowedChallengeStatuses = new Set(['on-main', 'pending-main']);

for (const project of registryProjects) {
  requireValue(typeof project.slug === 'string' && project.slug.length > 0, 'project slug is required');
  requireValue(typeof project.repository === 'string' && project.repository.startsWith('jussray/'), `${project.slug ?? 'unknown'}: founder-owned repository required`);
  requireValue(typeof project.role === 'string' && project.role.length > 0, `${project.slug ?? 'unknown'}: role is required`);
  requireValue(project.entrypoint === 'AGENTS_FOUNDER_INTELLIGENCE.md', `${project.slug ?? 'unknown'}: entrypoint path drifted`);
  requireValue(project.constitution === 'docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', `${project.slug ?? 'unknown'}: constitution path drifted`);
  requireValue(project.primaryAgentContract === 'AGENTS.md', `${project.slug ?? 'unknown'}: primary agent contract drifted`);
  requireValue(allowedStatuses.has(project.status), `${project.slug ?? 'unknown'}: invalid inheritance status`);
  requireValue(allowedChallengeStatuses.has(project.challengeStackStatus), `${project.slug ?? 'unknown'}: invalid challenge-stack status`);
  requireValue(typeof project.challengeStackCarrier === 'string' && project.challengeStackCarrier.length > 0, `${project.slug ?? 'unknown'}: challenge-stack carrier is required`);
  requireValue(typeof project.challengeStackEvidence === 'string' && project.challengeStackEvidence.length > 0, `${project.slug ?? 'unknown'}: challenge-stack evidence is required`);
  requireValue(typeof project.challengeStackNextGate === 'string' && project.challengeStackNextGate.length > 0, `${project.slug ?? 'unknown'}: challenge-stack next gate is required`);
  requireValue(typeof project.nextAction === 'string' && project.nextAction.length > 0, `${project.slug ?? 'unknown'}: nextAction is required`);
  requireValue(!registryBySlug.has(project.slug), `${project.slug}: duplicate slug`);
  requireValue(!repositoryNames.has(project.repository), `${project.repository}: duplicate repository`);
  registryBySlug.set(project.slug, project.repository);
  repositoryNames.add(project.repository);
}

requireValue(registryProjects.length === portfolioBySlug.size, 'registry project count must match the active portfolio');
for (const [slug, repository] of portfolioBySlug) {
  requireValue(registryBySlug.get(slug) === repository, `${slug}: registry repository does not match portfolio.ts`);
}
for (const [slug] of registryBySlug) {
  requireValue(portfolioBySlug.has(slug), `${slug}: registry contains a non-active project`);
}

const chiefProject = registryProjects.find((project) => project.slug === 'chief-ai-machine');
requireValue(chiefProject?.challengeStackStatus === 'pending-main', 'Chief challenge stack must remain pending-main until its protected PR is re-observed on main');
requireValue(/PR #148/.test(chiefProject?.challengeStackEvidence ?? ''), 'Chief pending-main evidence must name PR #148');
requireValue(/auto-merge/i.test(chiefProject?.challengeStackEvidence ?? ''), 'Chief pending-main evidence must record auto-merge state');

const externalCoverage = Array.isArray(registry.externalChallengeStackCoverage)
  ? registry.externalChallengeStackCoverage
  : [];
const externalCoverageBySlug = new Map();
const externalRepositories = new Set();
for (const project of externalCoverage) {
  requireValue(typeof project.slug === 'string' && project.slug.length > 0, 'external coverage slug is required');
  requireValue(typeof project.repository === 'string' && project.repository.startsWith('jussray/'), `${project.slug ?? 'unknown'}: external founder-owned repository required`);
  requireValue(project.challengeStackStatus === 'on-main', `${project.slug ?? 'unknown'}: external challenge stack must be re-observed on-main before registry inclusion`);
  requireValue(typeof project.challengeStackCarrier === 'string' && project.challengeStackCarrier.length > 0, `${project.slug ?? 'unknown'}: external challenge-stack carrier required`);
  requireValue(typeof project.challengeStackEvidence === 'string' && project.challengeStackEvidence.length > 0, `${project.slug ?? 'unknown'}: external challenge-stack evidence required`);
  requireValue(typeof project.challengeStackNextGate === 'string' && project.challengeStackNextGate.length > 0, `${project.slug ?? 'unknown'}: external challenge-stack next gate required`);
  requireValue(
    typeof project.authorityBoundary === 'string'
      && /identity\/continuity evidence only/i.test(project.authorityBoundary)
      && /grants no FCR portfolio, MCP/i.test(project.authorityBoundary),
    `${project.slug ?? 'unknown'}: external coverage must explicitly deny FCR portfolio/MCP authority`,
  );
  requireValue(!externalCoverageBySlug.has(project.slug), `${project.slug}: duplicate external coverage slug`);
  requireValue(!externalRepositories.has(project.repository), `${project.repository}: duplicate external coverage repository`);
  requireValue(!repositoryNames.has(project.repository), `${project.repository}: repository cannot be both active and external coverage`);
  externalCoverageBySlug.set(project.slug, project.repository);
  externalRepositories.add(project.repository);
}

requireValue(externalCoverage.length === externalPortfolioBySlug.size, 'external challenge-stack coverage must match EXTERNAL_PROJECTS exactly');
for (const [slug, repository] of externalPortfolioBySlug) {
  requireValue(externalCoverageBySlug.get(slug) === repository, `${slug}: external challenge-stack coverage does not match portfolio.ts`);
}
for (const [slug] of externalCoverageBySlug) {
  requireValue(externalPortfolioBySlug.has(slug), `${slug}: challenge-stack coverage contains a repo not declared in EXTERNAL_PROJECTS`);
}

requireValue(entrypoint.includes(registryPath), 'Founder Intelligence entrypoint must link the inheritance registry');
requireValue(entrypoint.includes(cohesionAuditPath), 'Founder Intelligence entrypoint must link the FCR cohesion audit');
requireValue(entrypoint.includes(registry.canonicalConstitution), 'Founder Intelligence entrypoint must link the canonical constitution');
for (const step of expectedLoop) {
  requireValue(entrypoint.includes(step), `entrypoint missing loop step ${step}`);
}
let previousChallengeIndex = -1;
for (const step of expectedChallengeStack) {
  const index = entrypoint.indexOf(step);
  requireValue(index >= 0, `entrypoint missing challenge-stack step ${step}`);
  requireValue(index > previousChallengeIndex, `challenge-stack order drifted at ${step}`);
  if (index >= 0) previousChallengeIndex = index;
}
for (const phrase of [
  'Build technology that leaves humans stronger than it found them.',
  '## /futureyou',
  'How would it be remembered by building this?',
  'Evidence outranks confidence',
  'Every agent should leave the next agent with less uncertainty than it inherited.',
  'Founder Control Room and Chief AI paired evolution',
]) {
  requireValue(constitution.includes(phrase), `constitution missing ${JSON.stringify(phrase)}`);
}

for (const phrase of [
  '## Infrastructure consequence filter',
  '**Consequence-only infrastructure attention**',
  'Routine changelog noise is not a founder task.',
  'A provider incident is provider-state evidence, not proof of an application defect.',
  'MATERIAL',
  'WATCH',
  'NOISE',
  'UNKNOWN',
  'at most two founder review gates',
]) {
  requireValue(cohesionAudit.includes(phrase), `cohesion audit missing infrastructure consequence rule ${JSON.stringify(phrase)}`);
}

for (const phrase of [
  '**Revenue Proof OS attention**',
  '## Revenue Proof OS filter',
  'reply-first',
  'Historical recipients remain in the duplicate guard.',
  'Investor discovery and tailored draft preparation may advance independently',
  'investor outreach is `REVIEW_REQUIRED`',
  'Se’kret Bip is the sole flagship company for its current $500,000 pre-seed SAFE thesis.',
  'CUSTOMER REVENUE',
  'OWNED / CREATOR COMMERCE',
  'FINANCING CAPITAL',
  'Do not merge these state machines into one vanity pipeline.',
  'MONEY PLANE',
]) {
  requireValue(cohesionAudit.includes(phrase), `cohesion audit missing Revenue Proof OS rule ${JSON.stringify(phrase)}`);
}

for (const phrase of [
  '## Unified capability runtime',
  'modalities',
  'Capability discovery is not authority.',
  'Credentials stay behind the capability boundary.',
  'Progressive capability disclosure.',
  '`READ`, `REVERSIBLE_WRITE`, and `CONSEQUENTIAL_WRITE`',
  'Voice approval must bind to the exact pending proposal',
  'PROPOSED',
  'WAITING_APPROVAL',
  'PRE_COMMIT',
  'PROVIDER_ACCEPTED',
  'VERIFIED | UNKNOWN | CONTRADICTED',
  'Execution truth and outcome truth stay separate.',
  'Receipts are modality-independent.',
  'Accessibility cannot become an authority downgrade.',
  'Reconnects must not replay old approvals or duplicate writes.',
  'FCR remains the control plane.',
  'SURFACE',
  'CLAIM',
]) {
  requireValue(cohesionAudit.includes(phrase), `cohesion audit missing unified capability runtime rule ${JSON.stringify(phrase)}`);
}

if (failures.length > 0) {
  console.error('Founder Intelligence inheritance contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

const counts = registryProjects.reduce((summary, project) => {
  summary[project.status] += 1;
  return summary;
}, { enforced: 0, partial: 0, missing: 0 });
const challengeCounts = registryProjects.reduce((summary, project) => {
  summary[project.challengeStackStatus] += 1;
  return summary;
}, { 'on-main': 0, 'pending-main': 0 });

console.log('Founder Intelligence inheritance contract passed.');
console.log(`Active projects: ${registryProjects.length}`);
console.log(`Inheritance — enforced: ${counts.enforced}; partial: ${counts.partial}; missing: ${counts.missing}`);
console.log(`Challenge stack — on-main: ${challengeCounts['on-main']}; pending-main: ${challengeCounts['pending-main']}`);
console.log(`External continuity coverage: ${externalCoverage.length}; authority promoted: 0`);
