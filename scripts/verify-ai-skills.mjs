import {access, readFile, readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'AGENTS.md',
  '.agents/skills/sales/SKILL.md',
  '.agents/skills/devil/SKILL.md',
  'artifacts/redteam/SALES_DEVIL_ATTACK.md',
  'artifacts/lindymode/SALES_DURABILITY.md',
  'artifacts/l99/SALES_AUTHORITY_MODEL.md',
  'artifacts/ooda/SALES_EXECUTION_LOOP.md',
  'artifacts/ultrathink/SALES_DEVIL_SYNTHESIS.md',
  'artifacts/billgates/SALES_PLATFORM_LEVERAGE.md',
];

const failures = [];

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
  } catch {
    failures.push(`missing required file: ${file}`);
  }
}

const skillRoot = '.agents/skills';
let operatorFiles = [];
try {
  const entries = await readdir(skillRoot, {withFileTypes: true});
  operatorFiles = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('operator'))
    .map((entry) => path.join(skillRoot, entry.name, 'SKILL.md'));
} catch {
  failures.push(`cannot read ${skillRoot}`);
}

if (operatorFiles.length !== 1) {
  failures.push(`expected exactly one repository operator skill, found ${operatorFiles.length}`);
}

const readableFiles = [...requiredFiles, ...operatorFiles];
const texts = new Map();
for (const file of readableFiles) {
  try {
    texts.set(file, await readFile(file, 'utf8'));
  } catch {
    // Missing files are reported above.
  }
}

const agents = texts.get('AGENTS.md') ?? '';
const sales = texts.get('.agents/skills/sales/SKILL.md') ?? '';
const devil = texts.get('.agents/skills/devil/SKILL.md') ?? '';
const all = [...texts.values()].join('\n').toLowerCase();

for (const requiredReference of [
  '.agents/skills/sales/SKILL.md',
  '.agents/skills/devil/SKILL.md',
]) {
  if (!agents.includes(requiredReference)) {
    failures.push(`AGENTS.md does not activate ${requiredReference}`);
  }
}

for (const token of [
  '/sales',
  '/devil',
  '5w1h',
  'redteam',
  'lindymode',
  'l99',
  'ooda',
  'ultrathink',
  'bill gates',
  'proof',
  'rollback',
  'approval',
]) {
  if (!all.includes(token)) failures.push(`missing contract token: ${token}`);
}

for (const [label, source, requiredPhrases] of [
  ['sales', sales, ['qualif', 'disqualif', 'evidence', 'not authorization']],
  ['devil', devil, ['premise', 'plan', 'kill criteria', 'does not authorize']],
]) {
  const lower = source.toLowerCase();
  for (const phrase of requiredPhrases) {
    if (!lower.includes(phrase)) failures.push(`${label} skill missing: ${phrase}`);
  }
}

for (const forbidden of [
  'guaranteed conversion',
  'invent scarcity',
  'bypass founder approval',
  'automatic outreach without approval',
]) {
  if (all.includes(forbidden)) failures.push(`forbidden unsafe contract text: ${forbidden}`);
}

if (!agents.toLowerCase().includes('separate')) {
  failures.push('AGENTS.md must preserve explicit project or data separation');
}

if (failures.length) {
  console.error('AI skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('AI skill contract passed.');