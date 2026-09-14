import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
};

requireValue(contract.schemaVersion === 1, 'pair contract schemaVersion must be 1');
requireValue(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(contract.contractVersion), 'contractVersion must be date.revision');
requireValue(contract.pair?.controlRoom === 'jussray/founder-control-room', 'control-room repository drifted');
requireValue(contract.pair?.chiefAI === 'jussray/chief-ai-machine', 'Chief AI repository drifted');
requireValue(pkg.name === 'founder-control-room', 'validator is running in the wrong repository');

requireValue(contract.candidatePairing?.schema === 'juss/founder-chief-pair-candidate@v1', 'pair candidate schema drifted');
requireValue(Number.isInteger(contract.candidatePairing?.founderControlRoomPullRequest) && contract.candidatePairing.founderControlRoomPullRequest > 0, 'FCR candidate PR must be a positive integer');
requireValue(Number.isInteger(contract.candidatePairing?.chiefAIPullRequest) && contract.candidatePairing.chiefAIPullRequest > 0, 'Chief candidate PR must be a positive integer');
requireValue(contract.candidatePairing?.truthBoundary?.includes('does not grant merge'), 'candidate pairing must remain non-authorizing');

const relationship = contract.relationship ?? {};
const crossSystem = relationship.crossSystem ?? {};
for (const [system, value] of [['controlRoom', relationship.controlRoom], ['chiefAI', relationship.chiefAI]]) {
  requireValue(value?.independentlyCallable === true, `${system} must remain independently callable`);
  requireValue(value?.ownsIdentity === true, `${system} must own its identity`);
  requireValue(value?.ownsLifecycle === true, `${system} must own its lifecycle`);
  requireValue(value?.ownsReceipts === true, `${system} must own its receipts`);
  requireValue(value?.ownsFailureState === true, `${system} must own its failure state`);
  requireValue(value?.ownsContinuityMarkers === true, `${system} must own its continuity markers`);
}
requireValue(relationship.topology === 'standalone-peers', 'FCR and Chief must remain standalone peers');
requireValue(crossSystem.sharedRuntimeRequired === false, 'standalone peers must not require one shared runtime');
requireValue(crossSystem.identityCollapseAllowed === false, 'cross-system identity collapse must remain forbidden');
requireValue(crossSystem.implicitAuthorityTransferAllowed === false, 'implicit authority transfer must remain forbidden');
requireValue(crossSystem.receiptCollapseAllowed === false, 'receipt collapse must remain forbidden');
requireValue(crossSystem.failureCollapseAllowed === false, 'failure collapse must remain forbidden');
requireValue(crossSystem.continuityCollapseAllowed === false, 'continuity collapse must remain forbidden');
requireValue(crossSystem.evidenceCreatesAuthority === false, 'evidence must not create authority');
requireValue(crossSystem.cooperationMayProceedWithinEachSystemsOwnAuthority === true, 'peer cooperation must stay bounded to each system own authority');
requireValue(relationship.continuityBoundary?.includes('non-secret') && relationship.continuityBoundary?.includes('non-authorizing'), 'continuity markers must remain non-secret and non-authorizing');
requireValue(relationship.continuityBoundary?.includes('recipient-side verification') && relationship.continuityBoundary?.includes('never transfers authority'), 'cross-system evidence must require recipient verification and never transfer authority');
requireValue(relationship.cooperationBoundary?.includes('independently valid systems') && relationship.cooperationBoundary?.includes('distinct receipts'), 'peer cooperation must preserve independent validity and distinct receipts');
requireValue(relationship.cooperationBoundary?.includes('never silently replaces'), 'one system state must never silently replace the other');

requireValue(contract.roles?.controlRoom?.join('|') === 'memory|governance|evidence|coordination|execution authority|outcome receipts', 'control-room V10 role contract drifted');
requireValue(contract.roles?.chiefAI?.join('|') === 'reasoning|synthesis|capability composition|recommendations|executive judgment', 'Chief AI V10 role contract drifted');
requireValue(contract.roles?.n8n?.join('|') === 'workflow execution|retries|API orchestration|execution receipts', 'n8n execution role contract drifted');
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
requireValue(contract.automatedPostingAuthorization?.includes('never weakens a stricter executable authority contract'), 'standing publication approval must not weaken stricter executable authority');
requireValue(contract.automatedPostingAuthorization?.includes('execution-time standing-approval readback'), 'standing publication approval requires authoritative execution-time readback');
requireValue(contract.automatedPostingAuthorization?.includes('fresh exact Current You approval'), 'first-party LinkedIn publication must require fresh exact Current You approval');
requireValue(contract.postingApprovalPolicy?.includes('caller-supplied approval JSON'), 'caller-supplied publication approval must remain non-authoritative');
requireValue(contract.postingApprovalPolicy?.includes('fresh exact-proposal approval'), 'first-party direct publication must require fresh exact-proposal approval');
requireValue(contract.postingApprovalPolicy?.includes('unless separately approved'), 'high-consequence publication must remain separately approved');

for (const mode of ['/futureyou', '/truthmode', '/confess']) {
  requireValue(contract.requiredPublicCommunicationModes?.includes(mode), `pair contract missing public communication mode ${mode}`);
  requireValue(communication.includes(mode), `public communication contract missing mode ${mode}`);
}

for (const control of ['Completeness','Accuracy','Consistency','Cut-off','Evidence and traceability','Authorization','Separation of record and promotion','Conservatism','Reconciliation','Correction and audit trail']) {
  requireValue(communication.includes(control), `public communication contract missing accounting control ${control}`);
}

for (const marker of ['standing class authorization','observable platform artifact','Fresh approval is required']) {
  requireValue(communication.includes(marker), `public communication contract missing ${JSON.stringify(marker)}`);
}

for (const marker of ['@Juss V10 Twin Core','Founder Control Room and Chief AI paired evolution','Neither may be materially upgraded in isolation.','capability-plan hash','outcome observations','UI/runtime claims require browser or Playwright evidence before merge']) {
  requireValue(constitution.includes(marker), `constitution missing ${JSON.stringify(marker)}`);
}

requireValue(conveyorText.includes('founder-control-room/n8n-conveyor@v3'), 'n8n artifact must use the V3 conveyor contract');
requireValue(conveyorText.includes("plan.selectedBy !== 'chief-ai-machine'"), 'n8n artifact must validate Chief AI selection ownership');
requireValue(!conveyorText.includes('const skillRoutes ='), 'n8n artifact must not choose skills by stage');
requireValue(conveyorText.includes('capabilityPlanHash'), 'n8n receipt must bind the capability-plan hash');
requireValue(conveyorText.includes('registryHash'), 'n8n receipt must bind the capability-registry hash');

const fields = contract.requiredExecutiveFields ?? [];
for (const field of ['Goal','Known','Unknown','Recommendation','Confidence','Next gate','Required evidence']) {
  requireValue(fields.includes(field), `pair contract missing executive field ${field}`);
}

const counterpartPath = process.env.PAIR_CONTRACT_PATH;
const crossRepoRequired = process.env.PAIR_CROSS_REPO_REQUIRED === 'true';
if (crossRepoRequired) requireValue(Boolean(counterpartPath), 'PAIR_CONTRACT_PATH is required when cross-repository verification is enforced');
if (counterpartPath) {
  try {
    const counterpart = JSON.parse(await readFile(resolve(process.cwd(), counterpartPath), 'utf8'));
    requireValue(counterpart.contractVersion === contract.contractVersion, `pair drift: Chief AI version ${counterpart.contractVersion ?? 'missing'} does not match Founder Control Room ${contract.contractVersion}`);
    requireValue(JSON.stringify(normalize(counterpart)) === JSON.stringify(normalize(contract)), 'pair drift: Founder Control Room and Chief AI contract content does not match');
  } catch (error) {
    failures.push(`Chief AI contract could not be read: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('Founder Control Room / Chief AI pair contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Pair contract ${contract.contractVersion} passed for Founder Control Room.`);
console.log('Standalone-peer identity, lifecycle, receipt, failure, continuity, V10 authority, outcome, and public communication controls verified.');
console.log(counterpartPath ? 'Cross-repository static policy alignment verified.' : 'Local FCR contract verified; cross-repository comparison was not requested.');
console.log('Runtime behavior remains unverified.');
