import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  contract,
  agents,
  chatgpt,
  claude,
  perplexity,
  council,
  court,
  audit,
] = await Promise.all([
  read('docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md'),
  read('AGENTS.md'),
  read('CHATGPT.md'),
  read('CLAUDE.md'),
  read('PERPLEXITY.md'),
  read('.control-room/COUNCIL.md'),
  read('.control-room/council-addresses/2026-09-25-storyengine-three-council-court.md'),
  read('.control-room/audits/2026-09-25-chat-to-fcr-productization-audit.md'),
]);

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};

for (const marker of [
  'Chat is the invention lab. Founder Control Room is the durable workflow product layer.',
  '## No chat captivity',
  '## User-facing abstraction',
  '### Founder Control Room',
  '### Chief AI',
  '### PromptOS',
  '## WorkflowCandidate contract',
  '## Graduation criteria',
  'OpenAI API key != GitHub authority',
  'Anthropic API key != Supabase authority',
  'MCP tool availability != permission',
  '## Council productization rule',
  '## Court productization rule',
  'the councils expand possibility; the creator makes the ruling.',
  '## Instruction inheritance',
  'DECLARED | SOURCE IMPLEMENTED | MERGED | DEPLOYED | RUNTIME VERIFIED | OUTCOME VERIFIED',
]) requireText('productization contract', contract, marker);

for (const marker of [
  'Founder Work Productization Contract',
  '## Work productization invariant',
  'juss/fcr-workflow-candidate@v1',
  'All leaf `SKILL.md` files inherit',
  'ONE-OFF',
  'WORKFLOW CANDIDATE',
  'Provider API keys grant provider capability',
]) requireText('AGENTS inheritance', agents, marker);

for (const [label, source] of [
  ['ChatGPT', chatgpt],
  ['Claude', claude],
  ['Perplexity', perplexity],
]) {
  requireText(`${label} parent`, source, 'AGENTS.md');
}

for (const marker of [
  'docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md',
  'juss/fcr-workflow-candidate@v1',
  'permanent chat dependency',
  'An OpenAI or Anthropic API key',
  'The StoryEngine Court remains',
  'WORKFLOW',
]) requireText('Council productization', council, marker);

for (const marker of [
  'inherits `docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md`',
  'The Court may discover a repeatable creative workflow',
  '## Court workflow graduation',
  'juss/fcr-workflow-candidate@v1',
  'The creator should not have to type the internal Court stack every time.',
  'Productization never authorizes publication',
  'the councils expand possibility; the creator makes the ruling.',
]) requireText('Court productization', court, marker);

for (const marker of [
  'SELF-AUDIT / CONFESS',
  'too many useful improvements were retained as behavior',
  'FCR Workflow Library + Runner',
  'Chief WorkflowCandidate handoff compilation',
  'NOT YET RUNTIME VERIFIED',
]) requireText('audit receipt', audit, marker);

for (const forbidden of [
  'Council consensus authorizes mutation',
  'OpenAI API key grants GitHub authority',
  'Anthropic API key grants Supabase authority',
  'Court is the execution authority',
]) {
  const all = [contract, agents, council, court].join('\n');
  if (all.includes(forbidden)) failures.push(`forbidden productization authority claim: ${forbidden}`);
}

if (failures.length) {
  console.error('Work productization contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Work productization contract passed.');
console.log('Chat → Chief candidate → FCR workflow ownership, provider-key boundaries, Council/Court roles, and instruction inheritance are aligned in source.');
console.log('This verifier proves source contract alignment only; it does not prove Workflow Library/Runner runtime or user outcomes.');
