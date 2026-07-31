import { readFile } from 'node:fs/promises';

const files = {
  factCheck: await readFile(new URL('../skills/fact-check-every-claim/SKILL.md', import.meta.url), 'utf8'),
  portableApprovals: await readFile(new URL('../docs/PORTABLE_FOUNDER_APPROVALS.md', import.meta.url), 'utf8'),
  mirrorDocs: await readFile(new URL('../docs/MIRROR_ENGINE_V1.md', import.meta.url), 'utf8'),
  mirrorRoute: await readFile(new URL('../src/http/routes/mirror.ts', import.meta.url), 'utf8'),
  mirrorClient: await readFile(new URL('../src/mirror/openaiClient.ts', import.meta.url), 'utf8'),
  agents: await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
  claude: await readFile(new URL('../CLAUDE.md', import.meta.url), 'utf8'),
};

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};

for (const field of [
  'name: fact-check-every-claim',
  'version: 1.0.0',
  'status: active',
  'scope: founder-control-room',
]) requireText('fact-check metadata', files.factCheck, field);

for (const phrase of [
  'Fact-check line by line',
  '`[NUMBER]`',
  '`[ACTION]`',
  '`[QUOTE]`',
  'two credible, independent sources',
  'SINGLE SOURCE ONLY',
  'CORRECTED',
  'UNVERIFIED',
  'For content with 40 or more claims',
  'Tone Guard may improve phrasing',
  'ask whether the founder wants the corrections applied automatically',
  'Perplexity MCP is a fast research and source-discovery lane',
]) requireText('fact-check invariant', files.factCheck, phrase);

for (const phrase of [
  'Juss may give founder direction and approval through approved conversational consoles',
  '`chatgpt`',
  '`claude`',
  '`perplexity`',
  '`founder-control-room`',
  'contentHash',
  'expectedCommitSha',
  'oneTime',
  'registered-adapter-signature',
  'Evidence is the lock',
  'participant_not_found',
  'capability_version_not_found',
]) requireText('portable approval invariant', files.portableApprovals, phrase);

for (const phrase of [
  'POST /mirror/run',
  'draft-only response',
  '`store: false`',
  'strict JSON Schema Structured Outputs',
  'Fact Check Every Claim',
  'Playwright is not required for the API-only V1 route',
]) requireText('Mirror docs invariant', files.mirrorDocs, phrase);

for (const phrase of [
  'router.use(requireFounder)',
  "distribution_mode: 'draft_only'",
  "code: 'AUDIT_PERSISTENCE_FAILED'",
  'externalActionAllowed: false',
]) requireText('Mirror route invariant', files.mirrorRoute, phrase);

for (const phrase of [
  'OPENAI_API_KEY',
  'store: false',
  "type: 'json_schema'",
  'MAX_RESPONSE_BYTES',
  'storedByProvider: false',
]) requireText('Mirror provider invariant', files.mirrorClient, phrase);

requireText('AGENTS fact-check entry', files.agents, 'skills/fact-check-every-claim/SKILL.md');
requireText('AGENTS portable approval entry', files.agents, 'docs/PORTABLE_FOUNDER_APPROVALS.md');
requireText('CLAUDE fact-check entry', files.claude, 'skills/fact-check-every-claim/SKILL.md');
requireText('CLAUDE portable approval entry', files.claude, 'docs/PORTABLE_FOUNDER_APPROVALS.md');

const combined = Object.values(files).join('\n').toLowerCase();
for (const forbidden of [
  'model output is founder approval',
  'plain copied chat text is a valid mutation receipt',
  'one source counts as fully verified',
  'tone guard can verify claims',
]) {
  if (combined.includes(forbidden)) failures.push(`unsafe Mirror/fact-check contract text: ${forbidden}`);
}

if (failures.length) {
  console.error('Mirror and fact-check contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Mirror and fact-check contract passed.');