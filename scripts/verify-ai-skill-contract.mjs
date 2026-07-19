import {readFile} from 'node:fs/promises';

const files = {
  portfolio: await readFile(new URL('../skills/portfolio-control-plane/SKILL.md', import.meta.url), 'utf8'),
  sales: await readFile(new URL('../skills/sales/SKILL.md', import.meta.url), 'utf8'),
  devil: await readFile(new URL('../skills/devil/SKILL.md', import.meta.url), 'utf8'),
  typescriptAudit: await readFile(new URL('../skills/typescript-audit/SKILL.md', import.meta.url), 'utf8'),
  agents: await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
  global: await readFile(new URL('../GLOBAL_AI.md', import.meta.url), 'utf8'),
  redteam: await readFile(new URL('../artifacts/redteam/SALES_DEVIL_ATTACK.md', import.meta.url), 'utf8'),
  lindy: await readFile(new URL('../artifacts/lindymode/SALES_DURABILITY.md', import.meta.url), 'utf8'),
  l99: await readFile(new URL('../artifacts/l99/SALES_AUTHORITY_MODEL.md', import.meta.url), 'utf8'),
  ooda: await readFile(new URL('../artifacts/ooda/SALES_EXECUTION_LOOP.md', import.meta.url), 'utf8'),
  ultrathink: await readFile(new URL('../artifacts/ultrathink/SALES_DEVIL_SYNTHESIS.md', import.meta.url), 'utf8'),
  billgates: await readFile(new URL('../artifacts/billgates/SALES_PLATFORM_LEVERAGE.md', import.meta.url), 'utf8'),
};

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};

for (const field of [
  'name: portfolio-control-plane',
  'version: 1.0.0',
  'status: active',
  'scope: founder-control-room',
  'review_cadence: quarterly',
]) requireText('portfolio metadata', files.portfolio, field);

for (const heading of [
  '## Who', '## What', '## When', '## Where', '## Why', '## How',
  '## Inputs', '## Outputs', '## Authority', '## Evidence',
  '## Project separation', '## Failure and rollback',
  '## Ten-year maintenance contract', '## Definition of done',
]) requireText('portfolio structure', files.portfolio, heading);

for (const invariant of [
  '/garyvee lindymode redteam l99 redteam ooda',
  'No approval carries forward',
  'exact 40-character commit SHA',
  'steps: null',
  'private teen, family, journal, voice, media',
  'Never promise ten years of zero maintenance',
]) requireText('portfolio invariant', files.portfolio, invariant);

for (const [label, source, metadata] of [
  ['sales', files.sales, ['name: sales', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['devil', files.devil, ['name: devil', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['typescript-audit', files.typescriptAudit, ['name: typescript-audit', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
]) for (const field of metadata) requireText(`${label} metadata`, source, field);

for (const phrase of ['5W1H', 'Qualify', 'disqualifiers', 'evidence', 'No approval carries forward', 'A sales plan is not authorization']) {
  requireText('sales invariant', files.sales, phrase);
}
for (const phrase of ['Pass I — premise attack', 'Pass II — selected-plan attack', 'kill criteria', 'does not authorize execution']) {
  requireText('devil invariant', files.devil, phrase);
}
for (const phrase of [
  'Audit first, then suggest',
  'Open draft PRs are part of the work',
  'Recommended next step only',
  'Never treat `mergeable: true` alone as merge approval',
  'Zero-step/no-log GitHub Actions runs are infrastructure evidence',
]) requireText('typescript-audit invariant', files.typescriptAudit, phrase);

requireText('AGENTS portfolio entry', files.agents, 'skills/portfolio-control-plane/SKILL.md');
requireText('AGENTS sales entry', files.agents, 'skills/sales/SKILL.md');
requireText('AGENTS devil entry', files.agents, 'skills/devil/SKILL.md');
requireText('AGENTS TypeScript audit entry', files.agents, 'skills/typescript-audit/SKILL.md');
requireText('AGENTS commercial extension', files.agents, '/sales /devil');
requireText('AGENTS separation', files.agents, 'separate approval gates');
requireText('global alignment', files.global, '/garyvee lindymode redteam l99 redteam ooda');

for (const [label, source, phrase] of [
  ['redteam artifact', files.redteam, 'Premise attack'],
  ['lindy artifact', files.lindy, 'Lindy Sales Durability'],
  ['l99 artifact', files.l99, 'No state authorizes the next'],
  ['ooda artifact', files.ooda, 'OODA Sales Execution Loop'],
  ['ultrathink artifact', files.ultrathink, 'ULTRATHINK'],
  ['billgates artifact', files.billgates, 'Bill Gates Artifact'],
]) requireText(label, source, phrase);

const all = Object.values(files).join('\n').toLowerCase();
for (const forbidden of ['guaranteed conversion', 'bypass founder approval', 'automatic outreach without approval']) {
  if (all.includes(forbidden)) failures.push(`unsafe contract text: ${forbidden}`);
}

if (failures.length) {
  console.error('AI skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('AI skill contract passed.');