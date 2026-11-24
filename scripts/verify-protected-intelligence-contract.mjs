import {readFile} from 'node:fs/promises';

const EXPECTED_PROJECT = 'jussray/founder-control-room';
const EXPECTED_ROLE = 'founder_operating_build_intelligence';
const REQUIRED_SUBJECTS = [
  'portfolio_truth',
  'workflow_authority',
  'execution',
  'revenue_and_money_path',
  'deployment_and_runtime',
  'visual_truth',
  'witness_provenance',
  'task_accuracy',
  'evidence_receipts',
  'rollback',
  'outcome_proof',
  'production_proof',
];
const REQUIRED_DURABLE_FORMS = ['code', 'internal_modules', 'policies', 'evaluators', 'workflow_engines', 'tests', 'receipts'];
const REQUIRED_INTERNAL = ['internal_orchestration', 'hidden_prompts', 'private_reasoning', 'evaluator_notes', 'private_learning_records', 'proprietary_lineage'];
const REQUIRED_LIVE_PROOF = ['source_head', 'deployment_identity', 'runtime_path', 'playwright_evidence', 'successor_fingerprint'];
const REQUIRED_WITNESS_CLASSES = [
  'repository_source',
  'ci_receipt',
  'provider_readback',
  'runtime_identity',
  'browser_functional',
  'browser_visual',
  'independent_challenger',
  'human_observation',
];
const REQUIRED_COMPLETION_LAYERS = [
  'SOURCE_IMPLEMENTED',
  'MERGED',
  'DEPLOYED',
  'RUNTIME_VERIFIED',
  'VISUAL_VERIFIED',
  'OUTCOME_VERIFIED',
];
const REQUIRED_CORE_SYSTEMS = new Map([
  ['jussray/founder-control-room', 'founder_operating_build_intelligence'],
  ['jussray/chief-ai-machine', 'executive_synthesis_reasoning_intelligence'],
  ['jussray/solcontinuity', 'challenge_evaluation_continuity_intelligence'],
  ['jussray/promptos', 'prompt_workflow_compiler_routing_intelligence'],
]);

const contract = JSON.parse(await readFile('.control-room/council-residency.contract.json', 'utf8'));
const court = await readFile('.control-room/COURT.md', 'utf8');
const errors = [];
const requireTrue = (label, value) => { if (value !== true) errors.push(`${label}: expected true`); };
const requireFalse = (label, value) => { if (value !== false) errors.push(`${label}: expected false`); };
const requireIncludes = (label, values, expected) => {
  if (!Array.isArray(values) || !values.includes(expected)) errors.push(`${label}: missing ${expected}`);
};
const requireCourtPhrase = (phrase) => {
  if (!court.includes(phrase)) errors.push(`Court contract missing phrase: ${phrase}`);
};

if (contract.contract !== 'juss/founder-council-federation@v2') errors.push('wrong Council federation contract id');
if (contract.project !== EXPECTED_PROJECT) errors.push(`wrong project: expected ${EXPECTED_PROJECT}`);
if (contract.projectRole !== EXPECTED_ROLE) errors.push(`wrong project role: expected ${EXPECTED_ROLE}`);

const shared = contract.topology?.sharedCouncilLayer;
requireTrue('shared Council layer is neutral', shared?.neutral);
requireFalse('shared Council layer is not owned by a core system', shared?.ownedByCoreSystem);
requireFalse('shared Council layer is not owned by an external provider', shared?.ownedByExternalProvider);
requireTrue('shared Council survives provider replacement', shared?.mustRemainAvailableAcrossExternalProviderReplacement);
requireTrue('shared Council is not required for peer core operation', shared?.mustNotBecomeCoreDependencyForPeerOperation);
if (shared?.physicalBacking !== 'UNDECIDED_UNTIL_SEPARATELY_AUTHORIZED') errors.push('shared Council physical backing was pre-selected without a separate authority gate');

const coreSystems = Array.isArray(contract.topology?.coreSystems) ? contract.topology.coreSystems : [];
for (const [repository, role] of REQUIRED_CORE_SYSTEMS) {
  const peer = coreSystems.find((entry) => entry?.repository === repository);
  if (!peer) {
    errors.push(`missing core peer: ${repository}`);
    continue;
  }
  requireTrue(`${repository} standalone`, peer.standalone);
  requireTrue(`${repository} peer`, peer.peer);
  requireTrue(`${repository} core function survives Council unavailability`, peer.coreFunctionSurvivesCouncilUnavailable);
  if (peer.role !== role) errors.push(`${repository}: wrong core role ${String(peer.role)}`);
}

const fcr = coreSystems.find((entry) => entry?.repository === EXPECTED_PROJECT);
if (!String(fcr?.description ?? '').includes('planning, inspecting, building, repairing, verifying, operating, and advancing the portfolio')) {
  errors.push('FCR standalone founder operating/build capability drifted');
}

const external = contract.topology?.externalProviderSeats;
requireTrue('external providers remain replaceable Council seats', external?.replaceable);
requireFalse('external providers are not a core dependency', external?.coreDependency);
requireTrue('external providers may be invoked from FCR', external?.mayBeInvokedFromFCR);
requireTrue('provider loss cannot erase portfolio state', external?.providerLossMustNotErasePortfolioState);
requireTrue('local project adapter is required', contract.topology?.localProjectAdapter?.required);
if (contract.topology?.localProjectAdapter?.path !== '.control-room') errors.push('local project adapter path drifted');
requireFalse('shared Council does not centralize execution authority', contract.topology?.centralizedExecutionAuthority);
requireFalse('shared Council layer grants no execution authority', contract.authority?.sharedCouncilLayerGrantsExecutionAuthority);

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

for (const value of REQUIRED_WITNESS_CLASSES) requireIncludes('witness class', contract.evidence?.witnessClasses, value);
requireTrue('verified claims carry witness class', contract.evidence?.verifiedClaimsRequireWitnessClass);
requireTrue('single evidence chain is labeled', contract.evidence?.singleEvidenceChainMustBeLabeled);
requireTrue('repeated upstream receipt does not create independence', contract.evidence?.repeatedUpstreamReceiptDoesNotCreateIndependence);

requireTrue('functional and visual truth are separate', contract.visualTruth?.functionalAndVisualTruthAreSeparate);
requireTrue('runtime proof does not imply visual proof', contract.visualTruth?.runtimeVerifiedDoesNotImplyVisualVerified);
requireTrue('source does not prove rendered fidelity', contract.visualTruth?.sourceDoesNotProveRenderedFidelity);
requireTrue('visual proof requires current target render', contract.visualTruth?.visualProofRequiresCurrentTargetRender);
requireTrue('visual proof compares current approved canon', contract.visualTruth?.compareAgainstCurrentApprovedCanon);
requireTrue('cross-domain visual proof cannot transfer without equivalence', contract.visualTruth?.crossDomainVisualProofTransferForbiddenWithoutEquivalenceProof);
for (const state of ['FAIL', 'UNKNOWN', 'BLOCKED']) requireIncludes('visual launch hold state', contract.visualTruth?.launchHoldStates, state);

requireTrue('promotion requires destination identity', contract.promotionGate?.requireDestinationIdentity);
requireTrue('promotion requires functional runtime when applicable', contract.promotionGate?.requireFunctionalRuntimeWhenApplicable);
requireTrue('promotion requires visual canon when presentation matters', contract.promotionGate?.requireVisualCanonWhenPresentationMatters);
requireTrue('promotion preserves witness limitations', contract.promotionGate?.preserveWitnessLimitations);
requireTrue('publication holds on visual failure', contract.promotionGate?.holdPublicationWhenVisualTruthFails);

requireTrue('affected live projects require end-to-end runtime proof', contract.completion?.affectedLiveProjectsRequireEndToEndRuntimeProof);
requireTrue('done words require runtime verification', contract.completion?.doneWordsRequireRuntimeVerificationWhenLiveGoal);
requireTrue('user-facing launch requires visual verification', contract.completion?.userFacingLaunchRequiresVisualVerification);
requireTrue('earlier stages do not satisfy live', contract.completion?.earlierStagesDoNotSatisfyLive);
for (const value of REQUIRED_LIVE_PROOF) requireIncludes('required live proof', contract.completion?.requiredLiveProof, value);
for (const value of REQUIRED_COMPLETION_LAYERS) requireIncludes('completion layer', contract.completion?.layeredCompletion, value);

requireCourtPhrase('verification carries a witness class');
requireCourtPhrase('functional truth and visual truth are separate');
requireCourtPhrase('promotion and publication destination gate');
requireCourtPhrase('runtime-green / visual-fail');

if (errors.length) {
  console.error('Founder Control Room protected intelligence contract failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(JSON.stringify({
  contract: contract.contract,
  project: contract.project,
  projectRole: contract.projectRole,
  status: 'passed',
  topology: 'neutral-shared-council-with-standalone-core-peers',
  subjects: REQUIRED_SUBJECTS,
  witnesses: REQUIRED_WITNESS_CLASSES,
  liveCompletion: REQUIRED_LIVE_PROOF,
  completionLayers: REQUIRED_COMPLETION_LAYERS,
}));
