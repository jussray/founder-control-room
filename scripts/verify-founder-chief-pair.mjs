import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  contractText,
  constitution,
  communication,
  pkgText,
  conveyorText,
  standingFounderPolicyText,
] = await Promise.all([
  read('config/founder-chief-pair.contract.json'),
  read('docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md'),
  read('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md'),
  read('package.json'),
  read('automation/n8n/founder-conveyor.workflow.json'),
  read('src/lib/standingFounderPolicy.ts'),
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

const necessaryFixGateBlock = standingFounderPolicyText.match(
  /const\s+NECESSARY_FIX_FOUNDER_GATES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s*as const\);/,
);
const necessaryFixFounderGates = necessaryFixGateBlock
  ? [...necessaryFixGateBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];

requireValue(contract.schemaVersion === 1, 'pair contract schemaVersion must be 1');
requireValue(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(contract.contractVersion), 'contractVersion must be date.revision');
requireValue(contract.pair?.controlRoom === 'jussray/founder-control-room', 'control-room repository drifted');
requireValue(contract.pair?.chiefAI === 'jussray/chief-ai-machine', 'Chief AI repository drifted');
requireValue(pkg.name === 'founder-control-room', 'validator is running in the wrong repository');
requireValue(contract.roles?.controlRoom?.join('|') === 'memory|governance|evidence|coordination|execution authority|outcome receipts', 'control-room V10 role contract drifted');
requireValue(contract.roles?.chiefAI?.join('|') === 'reasoning|synthesis|capability composition|recommendations|executive judgment', 'Chief AI V10 role contract drifted');
requireValue(contract.roles?.n8n?.join('|') === 'workflow execution|retries|API orchestration|execution receipts', 'n8n execution role contract drifted');
requireValue(contract.v10?.capabilityPlanContract === 'juss-v10/capability-plan@v1', 'V10 capability-plan contract drifted');
requireValue(contract.v10?.outcomeObservationContract === 'juss-v10/outcome-observation@v1', 'V10 outcome contract drifted');
requireValue(contract.v10?.conveyorContract === 'founder-control-room/n8n-conveyor@v3', 'V10 conveyor contract drifted');
requireValue(contract.v10?.capabilitySelector === 'chief-ai-machine', 'Chief AI must remain the capability selector');
requireValue(contract.v10?.governanceAuthority === 'founder-control-room', 'FCR must remain governance authority');
requireValue(contract.v10?.finalAuthority === 'founder', 'founder must remain final authority');
requireValue(contract.v10?.authorityInvariant?.includes('may increase its own authority'), 'authority self-escalation invariant is required');
requireValue(contract.v10?.routingInvariant?.includes('must not reconstruct capability selection'), 'routing separation invariant is required');
requireValue(contract.v10?.learningInvariant?.includes('self-promote authority'), 'learning self-promotion invariant is required');
requireValue(contract.driftPolicy?.includes('pair drift'), 'pair drift policy is required');
requireValue(contract.runtimeTruthBoundary?.includes('does not prove deployed or runtime behavior'), 'runtime truth boundary is required');
requireValue(contract.postingTruthBoundary?.includes('observable platform artifact'), 'posting truth boundary is required');
requireValue(contract.postingApprovalPolicy?.includes('unless separately approved'), 'posting approval policy is required');

requireValue(
  JSON.stringify(necessaryFixFounderGates) === JSON.stringify([
    'scope-expansion',
    'external-publication',
    'spend',
    'destructive-change',
    'irreversible-change',
    'authority-expansion',
  ]),
  'FCR necessary-fix founder gates drifted',
);
requireValue(
  standingFounderPolicyText.includes('unless a separate explicit communication policy exists.'),
  'FCR standing policy must preserve a separate explicit communication-policy exception',
);
requireValue(
  standingFounderPolicyText.includes("necessaryFixDefault: Object.freeze({")
    && standingFounderPolicyText.includes('doesNotGrantAuthority: true')
    && standingFounderPolicyText.includes('requiresCurrentAuthority: true')
    && standingFounderPolicyText.includes('proofGatedActionsRemainProofGated: true'),
  'FCR necessary-fix authority/proof boundary drifted',
);

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
const counterpartNecessaryFixPolicyPath = process.env.PAIR_NECESSARY_FIX_POLICY_PATH;
const crossRepoRequired = process.env.PAIR_CROSS_REPO_REQUIRED === 'true';
if (crossRepoRequired) {
  requireValue(Boolean(counterpartPath), 'PAIR_CONTRACT_PATH is required when cross-repository verification is enforced');
  requireValue(Boolean(counterpartNecessaryFixPolicyPath), 'PAIR_NECESSARY_FIX_POLICY_PATH is required when cross-repository verification is enforced');
}
if (counterpartPath) {
  try {
    const counterpart = JSON.parse(await readFile(resolve(process.cwd(), counterpartPath), 'utf8'));
    requireValue(counterpart.contractVersion === contract.contractVersion, `pair drift: Chief AI version ${counterpart.contractVersion ?? 'missing'} does not match Founder Control Room ${contract.contractVersion}`);
    requireValue(JSON.stringify(normalize(counterpart)) === JSON.stringify(normalize(contract)), 'pair drift: Founder Control Room and Chief AI contract content does not match');
  } catch (error) {
    failures.push(`Chief AI contract could not be read: ${error.message}`);
  }
}

if (counterpartNecessaryFixPolicyPath) {
  try {
    const counterpartPolicy = JSON.parse(await readFile(resolve(process.cwd(), counterpartNecessaryFixPolicyPath), 'utf8'));
    requireValue(
      JSON.stringify(counterpartPolicy.founderRequiredWhen) === JSON.stringify(necessaryFixFounderGates),
      `pair drift: Chief AI necessary-fix founder gates ${JSON.stringify(counterpartPolicy.founderRequiredWhen ?? [])} do not match FCR ${JSON.stringify(necessaryFixFounderGates)}`,
    );
    requireValue(
      counterpartPolicy.externalCommunication?.defaultDisposition === 'founder-required',
      'pair drift: Chief AI external communication default is no longer founder-required',
    );
    requireValue(
      counterpartPolicy.externalCommunication?.standingApprovedAutomationMayProceed === true,
      'pair drift: Chief AI no longer preserves approved automated publishing classes',
    );
    requireValue(
      counterpartPolicy.externalCommunication?.standingAuthorizationSources?.includes('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md')
        && counterpartPolicy.externalCommunication?.standingAuthorizationSources?.includes('config/founder-chief-pair.contract.json'),
      'pair drift: Chief AI standing communication authorization sources changed',
    );
    requireValue(
      counterpartPolicy.truthBoundary?.doesNotGrantAuthority === true
        && counterpartPolicy.truthBoundary?.requiresCurrentAuthority === true
        && counterpartPolicy.truthBoundary?.continuityMarkersAuthorize === false,
      'pair drift: Chief AI necessary-fix authority boundary changed',
    );
  } catch (error) {
    failures.push(`Chief AI necessary-fix policy could not be read: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('Founder Control Room / Chief AI pair contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Pair contract ${contract.contractVersion} passed for Founder Control Room.`);
console.log('V10 Twin Core roles, capability routing, authority, outcomes, public communication, and necessary-fix controls verified.');
console.log(counterpartPath ? 'Cross-repository static policy alignment verified.' : 'Local FCR contract verified; cross-repository comparison was not requested.');
console.log(counterpartNecessaryFixPolicyPath ? 'Cross-repository necessary-fix policy alignment verified.' : 'Local FCR necessary-fix policy verified; Chief counterpart comparison was not requested.');
console.log('Runtime behavior remains unverified.');
