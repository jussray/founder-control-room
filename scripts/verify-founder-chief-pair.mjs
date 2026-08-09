import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [contractText, constitution, communication, pkgText, conveyorText] = await Promise.all([
  read('config/founder-chief-pair.contract.json'),
  read('docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md'),
  read('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md'),
  read('package.json'),
  read('automation/n8n/founder-conveyor.workflow.json'),
]);

const contract = JSON.parse(contractText);
const pkg = JSON.parse(pkgText);
const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(contract.schemaVersion === 1, 'pair contract schemaVersion must be 1');
requireValue(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(contract.contractVersion), 'contractVersion must be date.revision');
requireValue(contract.pair?.controlRoom === 'jussray/founder-control-room', 'control-room repository drifted');
requireValue(contract.pair?.chiefAI === 'jussray/chief-ai-machine', 'Chief AI repository drifted');
requireValue(pkg.name === 'founder-control-room', 'validator is running in the wrong repository');
requireValue(
  contract.roles?.controlRoom?.join('|') === 'memory|governance|evidence|coordination|execution authority|outcome receipts',
  'control-room V10 role contract drifted',
);
requireValue(
  contract.roles?.chiefAI?.join('|') === 'reasoning|synthesis|capability composition|recommendations|executive judgment',
  'Chief AI V10 role contract drifted',
);
requireValue(
  contract.roles?.n8n?.join('|') === 'workflow execution|retries|API orchestration|execution receipts',
  'n8n execution role contract drifted',
);
requireValue(contract.v10?.capabilityPlanContract === 'juss-v10/capability-plan@v1', 'V10 capability-plan contract drifted');
requireValue(contract.v10?.outcomeObservationContract === 'juss-v10/outcome-observation@v1', 'V10 outcome contract drifted');
requireValue(contract.v10?.conveyorContract === 'founder-control-room/n8n-conveyor@v3', 'V10 conveyor contract drifted');
requireValue(contract.v10?.capabilitySelector === 'chief-ai-machine', 'Chief AI must remain the capability selector');
requireValue(contract.v10?.governanceAuthority === 'founder-control-room', 'FCR must remain the governance authority');
requireValue(contract.v10?.finalAuthority === 'founder', 'founder must remain final authority');
requireValue(contract.v10?.authorityInvariant?.includes('may increase its own authority'), 'authority self-escalation invariant is required');
requireValue(contract.v10?.routingInvariant?.includes('must not reconstruct capability selection'), 'routing separation invariant is required');
requireValue(contract.v10?.learningInvariant?.includes('self-promote authority'), 'learning self-promotion invariant is required');
requireValue(contract.driftPolicy?.includes('pair drift'), 'pair drift policy is required');
requireValue(contract.runtimeTruthBoundary?.includes('does not prove deployed or runtime behavior'), 'runtime truth boundary is required');
requireValue(contract.postingTruthBoundary?.includes('observable platform artifact'), 'posting truth boundary is required');
requireValue(contract.postingApprovalPolicy?.includes('unless separately approved'), 'posting approval policy is required');

for (const mode of ['/futureyou', '/truthmode', '/confess']) {
  requireValue(contract.requiredPublicCommunicationModes?.includes(mode), `pair contract missing public communication mode ${mode}`);
  requireValue(communication.includes(mode), `public communication contract missing mode ${mode}`);
}

for (const control of [
  'Completeness',
  'Accuracy',
  'Consistency',
  'Cut-off',
  'Evidence and traceability',
  'Authorization',
  'Separation of record and promotion',
  'Conservatism',
  'Reconciliation',
  'Correction and audit trail',
]) {
  requireValue(communication.includes(control), `public communication contract missing accounting control ${control}`);
}

for (const marker of [
  'standing authorization',
  'observable platform artifact',
  'Fresh approval is still required',
]) {
  requireValue(communication.includes(marker), `public communication contract missing ${JSON.stringify(marker)}`);
}

for (const marker of [
  '@Juss V10 Twin Core',
  'Founder Control Room and Chief AI paired evolution',
  'Neither may be materially upgraded in isolation.',
  'capability-plan hash',
  'outcome observations',
  'UI/runtime claims require browser or Playwright evidence before merge',
]) {
  requireValue(constitution.includes(marker), `constitution missing ${JSON.stringify(marker)}`);
}

requireValue(conveyorText.includes('founder-control-room/n8n-conveyor@v3'), 'n8n artifact must use the V3 conveyor contract');
requireValue(conveyorText.includes("plan.selectedBy !== 'chief-ai-machine'"), 'n8n artifact must validate Chief AI selection ownership');
requireValue(!conveyorText.includes('const skillRoutes ='), 'n8n artifact must not choose skills by stage');
requireValue(conveyorText.includes('capabilityPlanHash'), 'n8n receipt must bind the capability-plan hash');
requireValue(conveyorText.includes('registryHash'), 'n8n receipt must bind the capability-registry hash');

const fields = contract.requiredExecutiveFields ?? [];
for (const field of ['Goal', 'Known', 'Unknown', 'Recommendation', 'Confidence', 'Next gate', 'Required evidence']) {
  requireValue(fields.includes(field), `pair contract missing executive field ${field}`);
}

if (failures.length > 0) {
  console.error('Founder Control Room / Chief AI local pair contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Pair contract ${contract.contractVersion} passed for Founder Control Room.`);
console.log('V10 Twin Core roles, capability routing, authority, outcomes, and public communication controls verified.');
console.log('Cross-repository equality is enforced by the Chief AI pair-sentinel workflow.');
console.log('Runtime behavior remains unverified.');
