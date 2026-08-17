import {readFile} from 'node:fs/promises';

const skills = {
  router: await readFile(new URL('../.agents/skills/control-room-agent-router/SKILL.md', import.meta.url), 'utf8'),
  skillRouter: await readFile(new URL('../.agents/skills/control-room-skill-router/SKILL.md', import.meta.url), 'utf8'),
  proof: await readFile(new URL('../.agents/skills/control-room-proof-ladder/SKILL.md', import.meta.url), 'utf8'),
  incident: await readFile(new URL('../.agents/skills/control-room-incident-triage/SKILL.md', import.meta.url), 'utf8'),
  handoff: await readFile(new URL('../.agents/skills/control-room-agent-handoff/SKILL.md', import.meta.url), 'utf8'),
  tokens: await readFile(new URL('../.agents/skills/control-room-token-efficient-execution/SKILL.md', import.meta.url), 'utf8'),
  futureyou: await readFile(new URL('../.agents/skills/control-room-futureyou-leverage/SKILL.md', import.meta.url), 'utf8'),
};

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};
const semanticVersion = /^version:\s*\d+\.\d+\.\d+\s*$/m;

for (const [label, source] of Object.entries(skills)) {
  for (const field of ['description:', 'status: active', 'scope: founder-control-room', 'owner: Juss']) {
    requireText(`${label} metadata`, source, field);
  }
  if (!semanticVersion.test(source)) failures.push(`${label} metadata: version must be semantic x.y.z`);
  requireText(`${label} done contract`, source, 'Definition of done');
}

for (const phrase of [
  'smallest capable agent',
  'one agent as execution owner',
  'Routing decision record',
  'A previous agent',
]) requireText('router invariant', skills.router, phrase);

for (const phrase of [
  'Chief AI Machine owns reasoning, capability composition, and skill/tool routing',
  'MUST NOT reconstruct specialist selection from prompt keywords',
  'hash-bound `juss-v10/capability-plan@v1`',
  '/sales /devil',
  '`unified-growth-inbox` capability',
  'authoritative `RepositoryProvider`',
  'Playwright evidence for UI/runtime claims',
  'Skill routing never grants write authority',
]) requireText('skill router invariant', skills.skillRouter, phrase);

for (const phrase of [
  'Evidence ladder',
  'Claim ceiling',
  'exact 40-character commit SHA',
  'Consumer-bound dependency proof',
  'Blocker fingerprint:',
  'Retry trigger:',
  'Do not call work done while required proof remains queued or in progress',
  'reacquire authority before continuing',
]) requireText('proof invariant', skills.proof, phrase);

for (const phrase of [
  'ULTRATHINK',
  'REDTEAM I',
  'LINDYMODE',
  '/futureyou',
  'Rank no more than three likely causes',
  'fix the earliest causal break',
]) requireText('incident invariant', skills.incident, phrase);

for (const phrase of [
  'Handoff packet',
  'A handoff transfers context, not authority',
  'EXACT HEAD SHA',
  'BASE / MAIN SHA',
  'BLOCKER FINGERPRINT',
  'RETRY TRIGGER',
  'ONE NEXT ACTION',
  'consumer',
]) requireText('handoff invariant', skills.handoff, phrase);

for (const phrase of [
  'Compress narrative, not evidence',
  'Search narrowly before opening large files',
  'Do not optimize token use by skipping tests',
  'FutureYou leverage pass',
  '`/loop` stop protocol',
  'blocker fingerprint',
  'reacquire authority before any new edit, review, or merge decision',
]) requireText('token invariant', skills.tokens, phrase);

for (const phrase of [
  'ULTRATHINK',
  'REDTEAM I',
  'LINDYMODE',
  '/futureyou',
  'authority class',
  'what it compounds',
  'Founder-touch reduction',
  'avoidable-system-friction',
  'external-authority-boundary',
  'does not portray uncertain economics as fact',
]) requireText('futureyou invariant', skills.futureyou, phrase);

const all = Object.values(skills).join('\n').toLowerCase();
for (const forbidden of [
  'bypass founder approval',
  'automatic production deploy',
  'skip verification to save tokens',
]) {
  if (all.includes(forbidden)) failures.push(`unsafe fleet skill text: ${forbidden}`);
}

if (failures.length) {
  console.error('Agent fleet skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Agent fleet skill contract passed.');
