import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const registryPath = 'config/founder-intelligence.inheritance.json';
const registry = JSON.parse(await readFile(new URL(registryPath, root), 'utf8'));
const portfolio = await readFile(new URL('src/config/portfolio.ts', root), 'utf8');
const l99Repository = await readFile(new URL('src/config/l99Repository.ts', root), 'utf8');
const entrypoint = await readFile(new URL('AGENTS_FOUNDER_INTELLIGENCE.md', root), 'utf8');
const constitution = await readFile(new URL('docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', root), 'utf8');

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

requireValue(registry.schemaVersion === 1, 'schemaVersion must be 1');
requireValue(registry.owner === 'Juss', 'owner must remain Juss');
requireValue(registry.authorityRepository === 'jussray/founder-control-room', 'authority repository mismatch');
requireValue(registry.canonicalConstitution === 'docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', 'canonical constitution mismatch');
requireValue(registry.canonicalEntrypoint === 'AGENTS_FOUNDER_INTELLIGENCE.md', 'canonical entrypoint mismatch');
requireValue(JSON.stringify(registry.requiredLoop) === JSON.stringify(expectedLoop), 'required remembrance loop drifted');
requireValue(typeof registry.inheritanceRule === 'string' && registry.inheritanceRule.includes('may not weaken'), 'inheritance rule must fail closed');
requireValue(typeof registry.truthBoundary === 'string' && registry.truthBoundary.includes('does not prove runtime behavior'), 'truth boundary must separate instruction evidence from runtime proof');
requireValue(/^\d{4}-\d{2}-\d{2}$/.test(registry.lastInspected), 'lastInspected must use YYYY-MM-DD');

const repositoryConstants = new Map(
  [...l99Repository.matchAll(/export const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"/g)]
    .map((match) => [match[1], match[2]]),
);

const projectBlocks = [
  ...portfolio.matchAll(
    /\{\s*slug:\s*"([^"]+)"[\s\S]*?repository:\s*(?:"([^"]+)"|([A-Z0-9_]+))[\s\S]*?status:\s*"active"[\s\S]*?\}/g,
  ),
].map((match) => {
  const repository = match[2] ?? repositoryConstants.get(match[3]);
  requireValue(
    typeof repository === 'string',
    `${match[1]}: unresolved repository constant ${match[3] ?? 'unknown'}`,
  );
  return { slug: match[1], repository };
});

const portfolioBySlug = new Map(projectBlocks.map((project) => [project.slug, project.repository]));
const registryProjects = Array.isArray(registry.projects) ? registry.projects : [];
const registryBySlug = new Map();
const repositoryNames = new Set();
const allowedStatuses = new Set(['enforced', 'partial', 'missing']);

for (const project of registryProjects) {
  requireValue(typeof project.slug === 'string' && project.slug.length > 0, 'project slug is required');
  requireValue(typeof project.repository === 'string' && project.repository.startsWith('jussray/'), `${project.slug ?? 'unknown'}: founder-owned repository required`);
  requireValue(typeof project.role === 'string' && project.role.length > 0, `${project.slug ?? 'unknown'}: role is required`);
  requireValue(project.entrypoint === 'AGENTS_FOUNDER_INTELLIGENCE.md', `${project.slug ?? 'unknown'}: entrypoint path drifted`);
  requireValue(project.constitution === 'docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md', `${project.slug ?? 'unknown'}: constitution path drifted`);
  requireValue(project.primaryAgentContract === 'AGENTS.md', `${project.slug ?? 'unknown'}: primary agent contract drifted`);
  requireValue(allowedStatuses.has(project.status), `${project.slug ?? 'unknown'}: invalid status`);
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

requireValue(entrypoint.includes(registryPath), 'Founder Intelligence entrypoint must link the inheritance registry');
requireValue(entrypoint.includes(registry.canonicalConstitution), 'Founder Intelligence entrypoint must link the canonical constitution');
for (const step of expectedLoop) {
  requireValue(entrypoint.includes(step), `entrypoint missing loop step ${step}`);
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

if (failures.length > 0) {
  console.error('Founder Intelligence inheritance contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

const counts = registryProjects.reduce((summary, project) => {
  summary[project.status] += 1;
  return summary;
}, { enforced: 0, partial: 0, missing: 0 });

console.log('Founder Intelligence inheritance contract passed.');
console.log(`Projects: ${registryProjects.length}`);
console.log(`Enforced: ${counts.enforced}; partial: ${counts.partial}; missing: ${counts.missing}`);
