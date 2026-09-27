import {readFile} from 'node:fs/promises';

const EXPECTED_PROJECT = 'jussray/founder-control-room';
const REQUIRED_SUBJECTS = [
  'portfolio_truth',
  'workflow_authority',
  'execution',
  'revenue_and_money_path',
  'deployment_and_runtime',
  'task_accuracy',
  'evidence_receipts',
  'rollback',
  'outcome_proof',
  'production_proof',
];
const REQUIRED_DURABLE_FORMS = ['code', 'internal_modules', 'policies', 'evaluators', 'workflow_engines', 'tests', 'receipts'];
const REQUIRED_INTERNAL = ['internal_orchestration', 'hidden_prompts', 'private_reasoning', 'evaluator_notes', 'private_learning_records', 'proprietary_lineage'];
const REQUIRED_LIVE_PROOF = ['source_head', 'deployment_identity', 'runtime_path', 'playwright_evidence', 'successor_fingerprint'];

const contract = JSON.parse(await readFile('.control-room/council-residency.contract.json', 'utf8'));
const errors = [];
const requireTrue = (label, value) => { if (value !== true) errors.push(`${label}: expected true`); };
const requireIncludes = (label, values, expected) => {
  if (!Array.isArray(values) || !values.includes(expected)) errors.push(`${label}: missing ${expected}`);
};

if (contract.contract !== 'juss/founder-council-residency@v1') errors.push('wrong Council residency contract id');
if (contract.project !== EXPECTED_PROJECT) errors.push(`wrong project: expected ${EXPECTED_PROJECT}`);
requireTrue('same Court/Council kernel', contract.jurisdiction?.sameCourtCouncilKernel);
requireTrue('repo/product/production scope', contract.jurisdiction?.repoProductProductionScoped);
for (const subject of REQUIRED_SUBJECTS) requireIncludes('FCR subject', contract.jurisdiction?.subjects, subject);

if (contract.intelligenceBoundary?.principle !== 'learn_encode_verify_compound_expose_value_protect_machinery') {
  errors.push('protected intelligence principle drifted');
}
requireTrue('reusable intelligence becomes durable capability', contract.intelligenceBoundary?.reusableIntelligenceMustBecomeDurableCapability);
requireTrue('intelligence does not depend on founder memory', contract.intelligenceBoundary?.intelligenceMustNotDependOnFounderMemory);
requireTrue('users own data and outputs', contract.intelligenceBoundary?.usersOwnTheirDataAndOutputs);
requireTrue('external providers remain replaceable', contract.intelligenceBoundary?.externalProvidersReplaceable);
for (const value of REQUIRED_DURABLE_FORMS) requireIncludes('durable intelligence form', contract.intelligenceBoundary?.durableForms, value);
for (const value of REQUIRED_INTERNAL) requireIncludes('internal-only intelligence', contract.intelligenceBoundary?.internalOnly, value);

requireTrue('affected live projects require end-to-end runtime proof', contract.completion?.affectedLiveProjectsRequireEndToEndRuntimeProof);
requireTrue('done words require runtime verification', contract.completion?.doneWordsRequireRuntimeVerificationWhenLiveGoal);
requireTrue('earlier stages do not satisfy live', contract.completion?.earlierStagesDoNotSatisfyLive);
for (const value of REQUIRED_LIVE_PROOF) requireIncludes('required live proof', contract.completion?.requiredLiveProof, value);

if (errors.length) {
  console.error('Founder Control Room protected intelligence contract failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  contract: contract.contract,
  project: contract.project,
  status: 'passed',
  subjects: REQUIRED_SUBJECTS,
  liveCompletion: REQUIRED_LIVE_PROOF,
}));
