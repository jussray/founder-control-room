import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, '.ai/skills/juss-flow-launch-loop/SKILL.md');
const agentsPath = path.join(root, 'AGENTS.md');

const [skill, agents] = await Promise.all([
  readFile(skillPath, 'utf8'),
  readFile(agentsPath, 'utf8'),
]);

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

const agentsLink = '.ai/skills/juss-flow-launch-loop/SKILL.md';
if (!agents.includes(agentsLink)) {
  throw new Error(`AGENTS.md must link to ${agentsLink}`);
}

if (!skill.includes('Do not run an uncontrolled autonomous merge loop.')) {
  throw new Error('The merge loop must remain evidence-gated and bounded.');
}

console.log('Juss Flow launch-loop contract verified.');
