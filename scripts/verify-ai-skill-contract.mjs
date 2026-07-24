import {readFile} from 'node:fs/promises';

const files = {
  portfolio: await readFile(new URL('../skills/portfolio-control-plane/SKILL.md', import.meta.url), 'utf8'),
  sales: await readFile(new URL('../skills/sales/SKILL.md', import.meta.url), 'utf8'),
  devil: await readFile(new URL('../skills/devil/SKILL.md', import.meta.url), 'utf8'),
  typescriptAudit: await readFile(new URL('../skills/typescript-audit/SKILL.md', import.meta.url), 'utf8'),
  typescriptDebugger: await readFile(new URL('../skills/typescript-root-cause-debugger/SKILL.md', import.meta.url), 'utf8'),
  typescriptPatch: await readFile(new URL('../skills/typescript-minimal-patch/SKILL.md', import.meta.url), 'utf8'),
  typescriptTests: await readFile(new URL('../skills/typescript-behavior-tests/SKILL.md', import.meta.url), 'utf8'),
  typescriptReview: await readFile(new URL('../skills/typescript-strict-review/SKILL.md', import.meta.url), 'utf8'),
  productDesign: await readFile(new URL('../skills/product-design-gate/SKILL.md', import.meta.url), 'utf8'),
  zapierSteering: await readFile(new URL('../docs/founder-signal-engine/openai-zapier-steering-contract.md', import.meta.url), 'utf8'),
  zapierGitHubMetadata: await readFile(new URL('../docs/founder-signal-engine/zapier-github-metadata-contract.md', import.meta.url), 'utf8'),
  chatgptZapierBridge: await readFile(new URL('../.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md', import.meta.url), 'utf8'),
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
  ['typescript-root-cause-debugger', files.typescriptDebugger, ['name: typescript-root-cause-debugger', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['typescript-minimal-patch', files.typescriptPatch, ['name: typescript-minimal-patch', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['typescript-behavior-tests', files.typescriptTests, ['name: typescript-behavior-tests', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['typescript-strict-review', files.typescriptReview, ['name: typescript-strict-review', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
  ['product-design-gate', files.productDesign, ['name: product-design-gate', 'version: 1.0.0', 'status: active', 'scope: founder-control-room']],
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
for (const phrase of [
  'root-cause analysis',
  'Rank no more than three likely causes by probability',
  'Ordered debug checklist',
  'Smallest viable patch',
  'Regression risks after patch',
]) requireText('typescript-debugger invariant', files.typescriptDebugger, phrase);
for (const phrase of [
  'minimal patch',
  'Touch the fewest files possible',
  'No placeholder logic',
  'Unified diff or exact replacement blocks',
  'Manual test steps',
]) requireText('typescript-patch invariant', files.typescriptPatch, phrase);
for (const phrase of [
  'Test real behavior, not implementation details',
  'No tests that would pass if the function were deleted',
  'Use Jest or Vitest',
  'Test retirement contract',
  'Never delete tests merely to make GitHub Actions green',
]) requireText('typescript-tests invariant', files.typescriptTests, phrase);
for (const phrase of [
  'Correctness',
  'Regression risk',
  'Type safety',
  'Supabase or Worker integration safety',
  'Merge recommendation: YES, NO, or YES WITH CHANGES',
]) requireText('typescript-review invariant', files.typescriptReview, phrase);
for (const phrase of [
  'Product Design evidence is design evidence',
  'source visual plus rendered implementation',
  'No screenshot evidence means no completed audit',
  'Supabase Auth, RLS, Storage, Realtime, Edge Functions',
  'design QA can pass while Supabase verification remains blocked',
]) requireText('product-design invariant', files.productDesign, phrase);
for (const phrase of [
  'Credential plane',
  'Control plane',
  'GitHub metadata plane',
  'Key possession alone is not a Zapier control surface or administration surface',
  'does not need to see the raw key',
  'No direct-control or end-to-end claim',
  'HubSpot task or note associated with deal `337185466050`',
  'does not authorize blind publication',
]) requireText('OpenAI Zapier steering invariant', files.zapierSteering, phrase);
for (const phrase of [
  'read/write metadata layer, not as the GitHub Actions workflow runtime',
  'Find Repository',
  'Get File Contents',
  'Create Issue',
  'GitHub Actions or deploy failure email',
  'Polling triggers deduplicate items by unique identifier',
  'must not auto-merge',
]) requireText('Zapier GitHub metadata invariant', files.zapierGitHubMetadata, phrase);
for (const phrase of [
  'ChatGPT',
  '@OpenAI Developers / OpenAI Platform secure key reference',
  'zapier-founder-signal-engine',
  'approved Founder Signal Engine Catch Hook, webhook, or named bridge target',
  'A bridge response without a Zapier run ID is not proof that Zapier executed',
  'do not create, rotate, or duplicate it',
  'Bridge invocation does not silently grant Zapier administration',
  'read/write metadata layer, not the GitHub Actions workflow-runtime layer',
  'Find Repository',
  'Create Issue',
  '## Separate founder approval required',
]) requireText('ChatGPT Zapier bridge invariant', files.chatgptZapierBridge, phrase);

requireText('AGENTS portfolio entry', files.agents, 'skills/portfolio-control-plane/SKILL.md');
requireText('AGENTS sales entry', files.agents, 'skills/sales/SKILL.md');
requireText('AGENTS devil entry', files.agents, 'skills/devil/SKILL.md');
requireText('AGENTS TypeScript audit entry', files.agents, 'skills/typescript-audit/SKILL.md');
requireText('AGENTS TypeScript debugger entry', files.agents, 'skills/typescript-root-cause-debugger/SKILL.md');
requireText('AGENTS TypeScript patch entry', files.agents, 'skills/typescript-minimal-patch/SKILL.md');
requireText('AGENTS TypeScript tests entry', files.agents, 'skills/typescript-behavior-tests/SKILL.md');
requireText('AGENTS TypeScript review entry', files.agents, 'skills/typescript-strict-review/SKILL.md');
requireText('AGENTS Product Design entry', files.agents, 'skills/product-design-gate/SKILL.md');
requireText('AGENTS ChatGPT Zapier bridge skill', files.agents, '.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md');
requireText('AGENTS Zapier cockpit rule', files.agents, 'treat Zapier as an operable workflow cockpit');
requireText('AGENTS Zapier connector discovery', files.agents, 'OpenAI Developers');
requireText('AGENTS dedicated Zapier key', files.agents, 'zapier-founder-signal-engine');
requireText('AGENTS existing key boundary', files.agents, 'do not recreate, rotate, or duplicate without explicit founder approval');
requireText('AGENTS run proof', files.agents, 'Require a real Zapier run ID');
requireText('AGENTS Product Design/Supabase split', files.agents, 'design evidence and Supabase evidence separate');
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