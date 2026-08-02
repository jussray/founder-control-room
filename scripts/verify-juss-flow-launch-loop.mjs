import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, '.ai/skills/juss-flow-launch-loop/SKILL.md');
const skill = await readFile(skillPath, 'utf8');

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

if (!skill.includes('Do not run an uncontrolled autonomous merge loop.')) {
  throw new Error('The merge loop must remain evidence-gated and bounded.');
}

if (!skill.includes('Never quietly shrink `full app launch`')) {
  throw new Error('GoalFix must preserve the full-app-launch objective.');
}

console.log('Juss Flow launch-loop contract verified.');
