import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  contract,
  twinCore,
  pairContractText,
  missionControl,
  missionControlTest,
  agents,
  chatgpt,
  claude,
  perplexity,
  council,
  court,
  audit,
] = await Promise.all([
  read('docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md'),
  read('docs/TWIN_CORE_CONTROL_PLANE_CONTRACT.md'),
  read('config/founder-chief-pair.contract.json'),
  read('src/lib/founderMissionControl.ts'),
  read('src/lib/__tests__/founderMissionControl.test.ts'),
  read('AGENTS.md'),
  read('CHATGPT.md'),
  read('CLAUDE.md'),
  read('PERPLEXITY.md'),
  read('.control-room/COUNCIL.md'),
  read('.control-room/council-addresses/2026-09-25-storyengine-three-council-court.md'),
  read('.control-room/audits/2026-09-25-chat-to-fcr-productization-audit.md'),
]);

const pairContract = JSON.parse(pairContractText);
const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const marker of [
  'Chat is the invention lab. Founder Control Room is the durable workflow product layer.',
  '## No chat captivity',
  '## User-facing abstraction',
  '### Founder Control Room',
  '### Chief AI',
  '### PromptOS',
  '## WorkflowCandidate contract',
  'required_proof_stage',
  '## Graduation criteria',
  'OpenAI API key != GitHub authority',
  'Anthropic API key != Supabase authority',
  'MCP tool availability != permission',
  '## Council productization rule',
  '## Court productization rule',
  'the councils expand possibility; the creator makes the ruling.',
  '## Instruction inheritance',
  '## Task clearance invariant',
  'A task clears only when the proof required by the original goal is satisfied by current evidence.',
  'OPEN | ACTIVE | BLOCKED | PROOF_PENDING | PROVEN | CLEARED',
  '`PROVEN` is an evidence predicate. `CLEARED` is the task-state transition',
  'Earlier stages never silently satisfy a later-stage goal.',
  'Do not mark it complete, close it, archive it, remove it from the active ledger, or tell the user it cleared.',
  'For assistant behavior, words such as `done`, `complete`, `fixed`, `cleared`, `live`, or `working` are proof claims',
  'DECLARED | SOURCE IMPLEMENTED | MERGED | DEPLOYED | RUNTIME VERIFIED | OUTCOME VERIFIED',
]) requireText('productization contract', contract, marker);

for (const marker of [
  '# Twin Core Control Plane Contract',
  'main@eb7c0861ba6ab3ed772efc672aff307bad7539fa',
  '## Adopt mechanics, not identity',
  '5W1H mission contract',
  'mission-brief',
  'system-map',
  'red-team-register',
  'artifact-ledger',
  'bottleneck-map',
  'verification-report',
  'founder-decision-pack',
  'Append-only history',
  'Allowlisted execution',
  'UI render is not runtime proof',
  '## Twin Core anti-collapse invariant',
  'FCR must **not** become the capability selector',
  'Chief must **not** become the durable workflow registry',
  'FCR == Chief',
  'Chief == FCR',
  'commercial packaging == technical absorption',
  'Copy the control-plane mechanism. Re-express it in portfolio-neutral contracts.',
  'Chief creates/decomposes the mission envelope',
  'FCR validates, persists, executes through authorized paths, records evidence, and controls task clearance.',
  '## Provenance and supersession',
]) requireText('Twin Core donor contract', twinCore, marker);

requireValue(pairContract.relationship?.topology === 'standalone-peers', 'Twin Core topology must remain standalone-peers');
requireValue(pairContract.relationship?.controlRoom?.independentlyCallable === true, 'FCR must remain independently callable');
requireValue(pairContract.relationship?.chiefAI?.independentlyCallable === true, 'Chief must remain independently callable');
requireValue(pairContract.relationship?.controlRoom?.ownsIdentity === true, 'FCR must retain its own identity');
requireValue(pairContract.relationship?.chiefAI?.ownsIdentity === true, 'Chief must retain its own identity');
requireValue(pairContract.relationship?.controlRoom?.ownsLifecycle === true, 'FCR must retain its own lifecycle');
requireValue(pairContract.relationship?.chiefAI?.ownsLifecycle === true, 'Chief must retain its own lifecycle');
requireValue(pairContract.relationship?.controlRoom?.ownsReceipts === true, 'FCR must retain its own receipts');
requireValue(pairContract.relationship?.chiefAI?.ownsReceipts === true, 'Chief must retain its own receipts');
requireValue(pairContract.relationship?.controlRoom?.ownsFailureState === true, 'FCR must retain its own failure state');
requireValue(pairContract.relationship?.chiefAI?.ownsFailureState === true, 'Chief must retain its own failure state');
requireValue(pairContract.relationship?.crossSystem?.identityCollapseAllowed === false, 'FCR/Chief identity collapse must stay forbidden');
requireValue(pairContract.relationship?.crossSystem?.implicitAuthorityTransferAllowed === false, 'implicit authority transfer must stay forbidden');
requireValue(pairContract.relationship?.crossSystem?.receiptCollapseAllowed === false, 'receipt collapse must stay forbidden');
requireValue(pairContract.relationship?.crossSystem?.failureCollapseAllowed === false, 'failure collapse must stay forbidden');
requireValue(pairContract.relationship?.crossSystem?.continuityCollapseAllowed === false, 'continuity collapse must stay forbidden');
requireValue(pairContract.commercialPackaging?.technicalTopology === 'standalone-peers', 'commercial packaging must not rewrite technical topology');
requireValue(pairContract.commercialPackaging?.chiefTechnicalIndependence === true, 'Chief technical independence must remain true');
requireValue(pairContract.commercialPackaging?.chiefDefaultCommercialPackaging === 'inside-founder-control-room', 'Chief may be packaged inside FCR only as commercial/product packaging');
requireValue(pairContract.v10?.capabilitySelector === 'chief-ai-machine', 'Chief must remain capability selector');
requireValue(pairContract.v10?.governanceAuthority === 'founder-control-room', 'FCR must remain governance authority');

for (const marker of [
  "FOUNDER_MISSION_ENVELOPE_CONTRACT = 'juss/founder-mission-envelope@v1'",
  'FOUNDER_MISSION_CORE_ARTIFACT_IDS',
  "'mission-brief'",
  "'verification-report'",
  "'founder-decision-pack'",
  'evaluateFounderMissionClearance',
  'task cannot clear before proof is proven at the required level',
  'createFounderMissionSuccessor',
  'mission identity cannot change across append-only successors',
  'isRegisteredActionId',
  'REGISTERED_ACTION_ID',
]) requireText('FCR mission control source', missionControl, marker);

for (const marker of [
  'keeps task clearance separate from progress until required proof is proven',
  'rejects false clearance when proof is weaker than the original goal',
  'requires the Bip-derived core artifact spine',
  'creates append-only successor lineage without changing mission identity',
  'accepts only registered action identifiers rather than free-form command text',
  "expect(isRegisteredActionId('npm run verify:frontend')).toBe(false)",
]) requireText('FCR mission control tests', missionControlTest, marker);

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
  'a PR exists, therefore the task is complete',
]) {
  const all = [contract, twinCore, missionControl, agents, council, court].join('\n');
  if (all.includes(forbidden)) failures.push(`forbidden productization/anti-collapse claim: ${forbidden}`);
}

if (failures.length) {
  console.error('Work productization contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Work productization contract passed.');
console.log('Chat → Chief candidate → FCR workflow ownership, Bip-derived control-plane mechanics, machine-enforced Twin Core anti-collapse, provider-key boundaries, Council/Court roles, instruction inheritance, and proven-only task clearance are aligned in source.');
console.log('This verifier proves source contract alignment only; it does not prove Workflow Library/Runner runtime or user outcomes.');
