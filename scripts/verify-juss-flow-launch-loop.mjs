import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, '.ai/skills/juss-flow-launch-loop/SKILL.md');
const founderSkillPath = path.join(root, '.ai/skills/juss-founder-os/SKILL.md');
const skill = await readFile(skillPath, 'utf8');
const founderSkill = await readFile(founderSkillPath, 'utf8');

const requiredSkillTokens = [
  'ULTRATHINK',
  'Steal',
  'Lindy',
  'L99',
  'OODA',
  'Bill Gates pass',
  'Elon Musk pass',
  'GoalFix',
  'Product Design gate',
  'Review loop',
  'Merge gate',
  'Release and launch truth',
  'Rollback',
  'Next founder gate',
];

const missingSkillTokens = requiredSkillTokens.filter(
  (token) => !skill.includes(token),
);

if (missingSkillTokens.length > 0) {
  throw new Error(
    `Juss Flow launch-loop skill is missing: ${missingSkillTokens.join(', ')}`,
  );
}

const requiredFounderGovernanceTokens = [
  '## Founder governance kernel',
  '### Opportunity-cost receipts',
  '### Decision invalidation',
  '### Contradiction receipts and domain authority',
  '### Evidence lineage and independence',
  '### Uncertainty classes',
  '### Founder override without truth override',
  'SUPERSEDED/INVALIDATED',
  '`Deployable` does not mean `should deploy`',
  'Multiple agents repeating one source are not multiple independent witnesses.',
  '`security_uncertainty`',
  'It may not make missing evidence exist',
  'production fully verified',
];

const missingFounderGovernanceTokens = requiredFounderGovernanceTokens.filter(
  (token) => !founderSkill.includes(token),
);

if (missingFounderGovernanceTokens.length > 0) {
  throw new Error(
    `Juss Founder OS governance kernel is missing: ${missingFounderGovernanceTokens.join(', ')}`,
  );
}

const requiredReleaseStates = [
  'specified',
  'implemented',
  'unit-verified',
  'integration-verified',
  'browser-verified',
  'CI-verified',
  'merged',
  'deployed',
  'runtime-verified',
  'launch-ready',
  'launched',
];

const missingReleaseStates = requiredReleaseStates.filter(
  (state) => !skill.includes(state),
);

if (missingReleaseStates.length > 0) {
  throw new Error(
    `Launch truth ladder is incomplete: ${missingReleaseStates.join(', ')}`,
  );
}

if (!skill.includes('Do not run an uncontrolled autonomous merge loop.')) {
  throw new Error('The merge loop must remain evidence-gated and bounded.');
}

if (!skill.includes('Never quietly shrink `full app launch`')) {
  throw new Error('GoalFix must preserve the full-app-launch objective.');
}

// CI-backed proof that the founder's self-answer workflow remains in canonical
// agent instructions. This validates policy text, not an agent's runtime conduct.
const operatorSkill = await readFile(
  path.join(root, '.agents/skills/founder-control-room-operator/SKILL.md'),
  'utf8',
);
const operatorWorkflow = await readFile(
  path.join(root, 'docs/FOUNDER_AI_OPERATOR_WORKFLOW_V1.md'),
  'utf8',
);
const agentEntry = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
if (!agentEntry.includes('.agents/skills/founder-control-room-operator/SKILL.md')) {
  throw new Error('AGENTS.md must route agents to the canonical operator contract.');
}
for (const [label, body] of [
  ['operator skill', operatorSkill],
  ['operator workflow', operatorWorkflow],
]) {
  const required = [
    'ANSWERED',
    'AUTHORIZED_LOOKUP',
    'SAFE_DEFAULT',
    'FOUNDER_GATE',
    'BLOCKED',
    'Devil/Red Team',
    'Product Design',
    'Frontend Design Premium',
    'Codex Material Themes',
    'Codex Coordinator',
    'Codex Dev Workflows',
    'Data',
    'Shopify App Builder',
    'Stripe',
    'AWS Core',
    'Game Development Studio',
    'Faceless Video Maker',
  ];
  const missing = required.filter((token) => !body.includes(token));
  if (missing.length) {
    throw new Error(`Self-answer contract missing from ${label}: ${missing.join(', ')}`);
  }
}
if (!operatorSkill.includes('Connector availability alone grants no access permission.') ||
    !operatorWorkflow.includes('never infer new permission or a sensitive recipient')) {
  throw new Error('The operator self-answer contract must not infer access or consent.');
}
// The skill and workflow must independently preserve consent and stop conditions.
for (const [source, value] of [
  ['operator skill', operatorSkill],
  ['operator workflow', operatorWorkflow],
]) {
  if (!/connector availability alone grants no access permission|available connector or remembered account is not consent/i.test(value) ||
      !/background execution|background work|unattended monitoring/i.test(value) ||
      !/self-approve/i.test(value)) {
    throw new Error(`Self-answer contract lacks authority or bounded-continuation controls in ${source}`);
  }
}

// Validate the additional goal-continuation policy and its canonical prompt.
// This is source-contract verification, not proof of runtime agent behavior.
const goalContinuationTokens = [
  "## Goal continuation and parallel lanes",
  "single-writer ownership",
  "Hold only the blocked lane",
  "USER-REPORTED",
  "NOT_PERSISTED",
  "exact deployed identity",
  "Scheduled continuation requires an explicitly authorized supported mechanism"
];
for (const [label, body] of [['operator skill', operatorSkill], ['operator workflow', operatorWorkflow]]) {
  const missing = goalContinuationTokens.filter(token => !body.includes(token));
  if (missing.length) throw new Error(`Goal continuation contract missing from ${label}: ${missing.join(', ')}`);
}
for (const token of ['### Reusable operator prompt', '/Goal CONTINUE', '@5w1h', 'ULTRATHINK / DEVIL / GODMODE', 'REALITY / FIX / PROOF / RISK / ROLLBACK / NEXT GATE']) {
  if (!operatorWorkflow.includes(token)) throw new Error(`Canonical operator prompt missing: ${token}`);
}

console.log('Juss Flow launch-loop and Founder governance contracts verified.');
