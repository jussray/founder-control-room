import {readFile} from 'node:fs/promises';

const skillPath = new URL('../skills/portfolio-control-plane/SKILL.md', import.meta.url);
const agentsPath = new URL('../AGENTS.md', import.meta.url);
const globalPath = new URL('../GLOBAL_AI.md', import.meta.url);

const [skill, agents, globalContract] = await Promise.all([
  readFile(skillPath, 'utf8'),
  readFile(agentsPath, 'utf8'),
  readFile(globalPath, 'utf8'),
]);

const failures = [];

function requireText(label, source, expected) {
  if (!source.includes(expected)) {
    failures.push(`${label}: missing ${JSON.stringify(expected)}`);
  }
}

for (const field of [
  'name: portfolio-control-plane',
  'version: 1.0.0',
  'status: active',
  'scope: founder-control-room',
  'review_cadence: quarterly',
]) {
  requireText('skill metadata', skill, field);
}

for (const heading of [
  '## Who',
  '## What',
  '## When',
  '## Where',
  '## Why',
  '## How',
  '## Inputs',
  '## Outputs',
  '## Authority',
  '## Evidence',
  '## Project separation',
  '## Failure and rollback',
  '## Ten-year maintenance contract',
  '## Definition of done',
]) {
  requireText('skill structure', skill, heading);
}

for (const invariant of [
  '/garyvee lindymode redteam l99 redteam ooda',
  'No approval carries forward',
  'exact 40-character commit SHA',
  'steps: null',
  'private teen, family, journal, voice, media',
  'Never promise ten years of zero maintenance',
]) {
  requireText('skill invariant', skill, invariant);
}

requireText('AGENTS entry point', agents, 'skills/portfolio-control-plane/SKILL.md');
requireText('global contract alignment', globalContract, '/garyvee lindymode redteam l99 redteam ooda');

if (failures.length > 0) {
  console.error('AI skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('AI skill contract passed.');
