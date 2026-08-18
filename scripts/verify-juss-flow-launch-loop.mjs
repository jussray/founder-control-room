import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, '.ai/skills/juss-flow-launch-loop/SKILL.md');
const skill = await readFile(skillPath, 'utf8');

const requiredSkillTokens = [
  'ULTRATHINK',
  'Steal',
  'Redteam',
  'Lindy',
  'L99',
  'OODA',
  'Hormozi pass',
  'Bill Gates pass',
  'Elon Musk pass',
  'GoalFix',
  'Product Design gate',
  'Data Analytics gate',
  'Truth Lease',
  'Documentation truth gate',
  'Founder product publishing / sauce boundary',
  'Parallel lenses, serialized authority',
  'Review loop',
  'Merge gate',
  'Release and launch truth',
  'Post-merge re-observation',
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

const requiredTruthRules = [
  'A fact can be true when checked and unsafe when reused later.',
  'mark older contradictory material `HISTORICAL` or `SUPERSEDED`',
  'run the post-merge Documentation truth gate',
  'analytics may observe',
  'Keep private prompts, raw diffs, credentials',
];

for (const rule of requiredTruthRules) {
  if (!skill.includes(rule)) {
    throw new Error(`Juss Flow truth-aging rule is missing: ${rule}`);
  }
}

if (!skill.includes('Do not run an uncontrolled autonomous merge loop.')) {
  throw new Error('The merge loop must remain evidence-gated and bounded.');
}

if (!skill.includes('Never quietly shrink `full app launch`')) {
  throw new Error('GoalFix must preserve the full-app-launch objective.');
}

console.log('Juss Flow launch-loop contract verified.');
console.log('Parallel lenses remain advisory while authority and mutations stay serialized.');
console.log('Truth Lease, documentation reconciliation, sauce protection, and post-merge re-observation are required.');
