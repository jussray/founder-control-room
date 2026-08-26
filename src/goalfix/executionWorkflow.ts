import {
  fingerprintNormalized,
  validateCookieLineage,
  validateProofBinding,
  type ProofBinding,
  type ProofCookieContract,
} from '../security/attack20V3.js';

export const GOALFIX_EXECUTION_CONTRACT = 'founder-control-room/goalfix-execution@v2' as const;

export const GOALFIX_EXECUTION_PHASES = [
  'observe',
  'orient',
  'decide',
  'builder',
  'verify',
  'redteam',
  'merge-gate',
  'merged',
  'post-merge-verify',
  'complete',
] as const;

export type GoalfixExecutionPhase = (typeof GOALFIX_EXECUTION_PHASES)[number];
export type GoalfixExecutionRole = 'founder' | 'builder' | 'verifier' | 'redteam' | 'system';
export type GoalfixCheckpointVerdict = 'PASS' | 'FAILED' | 'UNVERIFIED' | 'BLOCKED';

export type GoalfixExecutionState =
  | 'BLOCKED_PRECONDITION'
  | 'BUILDING'
  | 'WAITING_FOR_VERIFIER'
  | 'WAITING_FOR_REDTEAM'
  | 'BLOCKED'
  | 'UNVERIFIED'
  | 'REVERIFY_REQUIRED'
  | 'READY_FOR_FOUNDER_MERGE_DECISION'
  | 'READY_TO_MERGE'
  | 'MERGED_UNVERIFIED'
  | 'COMPLETE';

export const GOALFIX_STRATEGY_INVARIANTS = Object.freeze({
  artOfWar: {
    knowGroundBeforeMovement: true,
    winBeforeFighting: true,
    avoidUnnecessarySiege: true,
    useExistingVerifiedAsymmetry: true,
    preserveFutureOptions: true,
  },
  lindy: {
    smallestDurableFix: true,
    reversibleBeforeClever: true,
    noTemporaryGreenTheater: true,
  },
  l99: {
    authorityExplicit: true,
    stateExplicit: true,
    evidenceBound: true,
    rollbackRequired: true,
    compoundingValueRequired: true,
  },
  ooda: {
    observeBeforeOrient: true,
    orientBeforeDecide: true,
    decideBeforeAct: true,
    verifyBeforeLoopOrMerge: true,
  },
  roleSeparation: {
    builderCannotSelfCertify: true,
    verifierAndRedteamAreIndependent: true,
    founderOwnsConsequentialMergeDecision: true,
  },
});

export interface GoalfixStrategicPreflight {
  authoritativeRepositoryKnown: boolean;
  targetBranchKnown: boolean;
  exactBaseShaKnown: boolean;
  founderOutcomeKnown: boolean;
  suspectedFailureAreaKnown: boolean;
  firstEvidenceTargetsKnown: boolean;
  stopConditionDefined: boolean;
  smallestReversibleChangeChosen: boolean;
  rollbackDefined: boolean;
  proofPlanDefined: boolean;
  unrelatedWorkPreserved: boolean;
}

export interface GoalfixExecutionCheckpoint {
  phase: GoalfixExecutionPhase;
  role: GoalfixExecutionRole;
  actorId: string;
  verdict: GoalfixCheckpointVerdict;
  repository: string;
  baseSha: string;
  headSha: string;
  diffFingerprint: string | null;
  evidenceIds: readonly string[];
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixFounderDecision {
  decisionId: string;
  action: 'MERGE' | 'CONTINUE' | 'STOP';
  approvedBy: string;
  approvedHeadSha: string;
  approvedDiffFingerprint: string;
  approvedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixPostMergeTruth {
  mergedSha: string;
  currentMainSha: string;
  runtimeProofRequired: boolean;
  runtimeReceiptIds: readonly string[];
  runtimeVerdict: 'PASS' | 'FAILED' | 'UNVERIFIED' | 'NOT_REQUIRED';
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixExecutionInput {
  repository: string;
  branch: string;
  baseSha: string;
  candidateHeadSha: string;
  currentMainSha: string;
  diffFingerprint: string;
  goal: string;
  stopCondition: string;
  rollback: string;
  strategicPreflight: GoalfixStrategicPreflight;
  checkpoints: readonly GoalfixExecutionCheckpoint[];
  cookieIndex: ReadonlyMap<string, ProofCookieContract>;
  founderDecision?: GoalfixFounderDecision | null;
  postMergeTruth?: GoalfixPostMergeTruth | null;
  now?: Date;
}

export interface GoalfixExecutionDecision {
  contract: typeof GOALFIX_EXECUTION_CONTRACT;
  state: GoalfixExecutionState;
  currentPhase: GoalfixExecutionPhase;
  mayMerge: boolean;
  reasons: readonly string[];
  requiredNextEvidence: readonly string[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

function phaseIndex(phase: GoalfixExecutionPhase): number {
  return GOALFIX_EXECUTION_PHASES.indexOf(phase);
}

function exactSha(value: string): boolean {
  return FULL_SHA.test(value.trim());
}

export function goalfixSourceFingerprint(repository: string, headSha: string): string {
  return fingerprintNormalized({ repository, headSha: headSha.toLowerCase() });
}

export function goalfixDiffFingerprint(input: unknown): string {
  return fingerprintNormalized(input);
}

function allPreflightSatisfied(preflight: GoalfixStrategicPreflight): boolean {
  return Object.values(preflight).every(Boolean);
}

function latestCheckpoint(
  checkpoints: readonly GoalfixExecutionCheckpoint[],
  phase: GoalfixExecutionPhase,
): GoalfixExecutionCheckpoint | undefined {
  return checkpoints.filter((checkpoint) => checkpoint.phase === phase).at(-1);
}

function validateCheckpoint(
  checkpoint: GoalfixExecutionCheckpoint,
  input: GoalfixExecutionInput,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (checkpoint.repository !== input.repository) errors.push(`${checkpoint.phase}: repository binding mismatch`);
  if (checkpoint.baseSha.toLowerCase() !== input.baseSha.toLowerCase()) errors.push(`${checkpoint.phase}: base SHA binding mismatch`);
  if (checkpoint.headSha.toLowerCase() !== input.candidateHeadSha.toLowerCase()) errors.push(`${checkpoint.phase}: candidate head SHA binding mismatch`);
  if (checkpoint.diffFingerprint !== null && checkpoint.diffFingerprint !== input.diffFingerprint) errors.push(`${checkpoint.phase}: diff fingerprint mismatch`);
  if (!checkpoint.actorId.trim()) errors.push(`${checkpoint.phase}: actorId is required`);
  if (!Number.isFinite(Date.parse(checkpoint.observedAt))) errors.push(`${checkpoint.phase}: observedAt must be an ISO timestamp`);

  const expectedSourceFingerprint = goalfixSourceFingerprint(input.repository, input.candidateHeadSha);
  const bindingErrors = validateProofBinding(checkpoint.proofBinding, ['sourceSha'], now);
  errors.push(...bindingErrors.map((error) => `${checkpoint.phase}: ${error}`));
  if (checkpoint.proofBinding.fingerprints.sourceSha !== expectedSourceFingerprint) {
    errors.push(`${checkpoint.phase}: sourceSha proof fingerprint does not match candidate head`);
  }

  const lineageErrors = validateCookieLineage(checkpoint.proofBinding.cookieContract, input.cookieIndex, now);
  errors.push(...lineageErrors.map((error) => `${checkpoint.phase}: ${error}`));

  const expectedCookieContext = checkpoint.phase === 'builder'
    ? 'builder-run'
    : checkpoint.phase === 'verify' || checkpoint.phase === 'redteam'
      ? 'verification-run'
      : null;
  if (expectedCookieContext && checkpoint.proofBinding.cookieContract.contextType !== expectedCookieContext) {
    errors.push(`${checkpoint.phase}: proof cookie context must be ${expectedCookieContext}`);
  }

  return errors;
}

function orderedCheckpoints(checkpoints: readonly GoalfixExecutionCheckpoint[]): string[] {
  const errors: string[] = [];
  let highest = -1;
  for (const checkpoint of checkpoints) {
    const index = phaseIndex(checkpoint.phase);
    if (index < highest) errors.push(`checkpoint order regressed at ${checkpoint.phase}`);
    highest = Math.max(highest, index);
  }
  return errors;
}

function roleSeparationErrors(checkpoints: readonly GoalfixExecutionCheckpoint[]): string[] {
  const errors: string[] = [];
  const builder = latestCheckpoint(checkpoints, 'builder');
  const verifier = latestCheckpoint(checkpoints, 'verify');
  const redteam = latestCheckpoint(checkpoints, 'redteam');

  if (builder && builder.role !== 'builder') errors.push('builder checkpoint must be owned by Builder role');
  if (verifier && verifier.role !== 'verifier') errors.push('verify checkpoint must be owned by Verifier role');
  if (redteam && redteam.role !== 'redteam') errors.push('redteam checkpoint must be owned by Red Team role');

  if (builder && verifier && builder.actorId === verifier.actorId) errors.push('Builder cannot self-certify as Verifier');
  if (builder && redteam && builder.actorId === redteam.actorId) errors.push('Builder cannot self-certify as Red Team');
  if (verifier && redteam && verifier.actorId === redteam.actorId) errors.push('Verifier and Red Team must be independent actors');
  return errors;
}

function validateFounderDecision(
  decision: GoalfixFounderDecision,
  input: GoalfixExecutionInput,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!decision.decisionId.trim()) errors.push('founder decision ID is required');
  if (!decision.approvedBy.trim()) errors.push('founder decision owner is required');
  if (decision.approvedHeadSha.toLowerCase() !== input.candidateHeadSha.toLowerCase()) errors.push('founder decision head SHA is stale or mismatched');
  if (decision.approvedDiffFingerprint !== input.diffFingerprint) errors.push('founder decision diff fingerprint is stale or mismatched');
  if (!Number.isFinite(Date.parse(decision.approvedAt))) errors.push('founder decision approvedAt must be an ISO timestamp');
  errors.push(...validateProofBinding(decision.proofBinding, ['sourceSha'], now).map((error) => `founder decision: ${error}`));
  errors.push(...validateCookieLineage(decision.proofBinding.cookieContract, input.cookieIndex, now).map((error) => `founder decision: ${error}`));
  if (decision.proofBinding.cookieContract.contextType !== 'founder-session') errors.push('founder decision proof cookie context must be founder-session');
  if (decision.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, input.candidateHeadSha)) {
    errors.push('founder decision sourceSha proof fingerprint does not match candidate head');
  }
  return errors;
}

function validatePostMergeTruth(
  truth: GoalfixPostMergeTruth,
  input: GoalfixExecutionInput,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!exactSha(truth.mergedSha) || !exactSha(truth.currentMainSha)) errors.push('post-merge truth requires exact merged and current-main SHAs');
  if (truth.mergedSha.toLowerCase() !== truth.currentMainSha.toLowerCase()) errors.push('post-merge current main does not equal merged SHA');
  if (!Number.isFinite(Date.parse(truth.observedAt))) errors.push('post-merge observedAt must be an ISO timestamp');
  if (truth.runtimeProofRequired && truth.runtimeReceiptIds.length === 0) errors.push('post-merge runtime proof is required but no runtime receipt exists');
  if (truth.runtimeProofRequired && truth.runtimeVerdict !== 'PASS') errors.push('post-merge runtime truth is not PASS');
  if (!truth.runtimeProofRequired && !['PASS', 'NOT_REQUIRED'].includes(truth.runtimeVerdict)) errors.push('post-merge truth must be PASS or NOT_REQUIRED when runtime proof is not required');
  errors.push(...validateProofBinding(truth.proofBinding, ['sourceSha'], now).map((error) => `post-merge: ${error}`));
  errors.push(...validateCookieLineage(truth.proofBinding.cookieContract, input.cookieIndex, now).map((error) => `post-merge: ${error}`));
  if (truth.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, truth.mergedSha)) {
    errors.push('post-merge sourceSha proof fingerprint does not match merged/current-main SHA');
  }
  return errors;
}

export function evaluateGoalfixExecution(input: GoalfixExecutionInput): GoalfixExecutionDecision {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  if (!input.repository.includes('/') || !input.branch.trim() || !input.goal.trim()) reasons.push('authoritative repository, branch, and founder goal are required');
  if (!exactSha(input.baseSha) || !exactSha(input.candidateHeadSha) || !exactSha(input.currentMainSha)) reasons.push('base, candidate head, and current main must be exact 40-character SHAs');
  if (!input.diffFingerprint.trim()) reasons.push('diff fingerprint is required');
  if (!input.stopCondition.trim()) reasons.push('stop condition is required');
  if (!input.rollback.trim()) reasons.push('rollback is required');
  if (!allPreflightSatisfied(input.strategicPreflight)) reasons.push('strategic preflight is incomplete: win-before-fighting conditions are not all satisfied');

  if (reasons.length > 0) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'BLOCKED_PRECONDITION',
      currentPhase: 'observe',
      mayMerge: false,
      reasons,
      requiredNextEvidence: ['Complete authority, scope, rollback, and proof preflight before mutation.'],
    };
  }

  const checkpointErrors = [
    ...orderedCheckpoints(input.checkpoints),
    ...roleSeparationErrors(input.checkpoints),
    ...input.checkpoints.flatMap((checkpoint) => validateCheckpoint(checkpoint, input, now)),
  ];
  if (checkpointErrors.length > 0) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'UNVERIFIED',
      currentPhase: input.checkpoints.at(-1)?.phase ?? 'observe',
      mayMerge: false,
      reasons: [...new Set(checkpointErrors)],
      requiredNextEvidence: ['Repair the broken fingerprint/cookie/role binding and rerun only the affected proof lane.'],
    };
  }

  for (const phase of ['observe', 'orient', 'decide'] as const) {
    const checkpoint = latestCheckpoint(input.checkpoints, phase);
    if (!checkpoint || checkpoint.verdict !== 'PASS') {
      return {
        contract: GOALFIX_EXECUTION_CONTRACT,
        state: 'UNVERIFIED',
        currentPhase: phase,
        mayMerge: false,
        reasons: [`${phase} must have a current PASS checkpoint before Builder work can become merge-eligible.`],
        requiredNextEvidence: [`Produce fresh ${phase} evidence bound to the exact candidate head and diff.`],
      };
    }
  }

  const failed = input.checkpoints.find((checkpoint) => checkpoint.verdict === 'FAILED' || checkpoint.verdict === 'BLOCKED');
  if (failed) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'BLOCKED',
      currentPhase: failed.phase,
      mayMerge: false,
      reasons: [`${failed.phase} is ${failed.verdict}.`],
      requiredNextEvidence: [`Repair the verified cause at ${failed.phase}, then rerun that lane and every dependent later lane.`],
    };
  }

  const unverified = input.checkpoints.find((checkpoint) => checkpoint.verdict === 'UNVERIFIED');
  if (unverified) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'UNVERIFIED',
      currentPhase: unverified.phase,
      mayMerge: false,
      reasons: [`${unverified.phase} lacks current proof.`],
      requiredNextEvidence: [`Obtain fresh evidence for ${unverified.phase}.`],
    };
  }

  const builder = latestCheckpoint(input.checkpoints, 'builder');
  const verifier = latestCheckpoint(input.checkpoints, 'verify');
  const redteam = latestCheckpoint(input.checkpoints, 'redteam');

  if (!builder || builder.verdict !== 'PASS') {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'BUILDING',
      currentPhase: 'builder',
      mayMerge: false,
      reasons: ['Builder has not produced a current PASS checkpoint.'],
      requiredNextEvidence: ['Smallest focused implementation plus narrow Builder evidence.'],
    };
  }

  if (!verifier || verifier.verdict !== 'PASS') {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'WAITING_FOR_VERIFIER',
      currentPhase: 'verify',
      mayMerge: false,
      reasons: ['Independent Verifier PASS is required after Builder.'],
      requiredNextEvidence: ['Exact-head static/focused/real-path verification from a non-Builder actor.'],
    };
  }

  if (!redteam || redteam.verdict !== 'PASS') {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'WAITING_FOR_REDTEAM',
      currentPhase: 'redteam',
      mayMerge: false,
      reasons: ['Independent Red Team PASS is required after verification.'],
      requiredNextEvidence: ['Adversarial review against the exact verified candidate head and diff.'],
    };
  }

  if (input.currentMainSha.toLowerCase() !== input.baseSha.toLowerCase()) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'REVERIFY_REQUIRED',
      currentPhase: 'merge-gate',
      mayMerge: false,
      reasons: ['main moved after the candidate proof base; prior exact-head evidence is historical for merge-liveness purposes'],
      requiredNextEvidence: ['Reacquire the focused change on current main, recompute the diff fingerprint, then rerun Verifier and Red Team lanes.'],
    };
  }

  if (!input.founderDecision) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'READY_FOR_FOUNDER_MERGE_DECISION',
      currentPhase: 'merge-gate',
      mayMerge: false,
      reasons: ['Builder, Verifier, and Red Team are current; founder merge authority has not yet been supplied.'],
      requiredNextEvidence: ['Founder decision bound to the exact candidate head and diff fingerprint.'],
    };
  }

  const founderDecisionErrors = validateFounderDecision(input.founderDecision, input, now);
  if (founderDecisionErrors.length > 0 || input.founderDecision.action !== 'MERGE') {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: input.founderDecision.action === 'STOP' ? 'BLOCKED' : 'UNVERIFIED',
      currentPhase: 'merge-gate',
      mayMerge: false,
      reasons: founderDecisionErrors.length > 0 ? founderDecisionErrors : [`Founder decision is ${input.founderDecision.action}, not MERGE.`],
      requiredNextEvidence: ['A current founder MERGE decision bound to this exact head and diff is required.'],
    };
  }

  if (!input.postMergeTruth) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'READY_TO_MERGE',
      currentPhase: 'merge-gate',
      mayMerge: true,
      reasons: ['All pre-merge gates are current and founder merge authority is exact-head bound.'],
      requiredNextEvidence: ['Merge using expected-head protection, then reacquire main and verify post-merge/runtime truth.'],
    };
  }

  const postMergeErrors = validatePostMergeTruth(input.postMergeTruth, input, now);
  if (postMergeErrors.length > 0) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'MERGED_UNVERIFIED',
      currentPhase: 'post-merge-verify',
      mayMerge: false,
      reasons: postMergeErrors,
      requiredNextEvidence: ['Reacquire merged main and obtain the required runtime/provider/browser receipts before declaring completion.'],
    };
  }

  return {
    contract: GOALFIX_EXECUTION_CONTRACT,
    state: 'COMPLETE',
    currentPhase: 'complete',
    mayMerge: false,
    reasons: ['Focused change is merged and post-merge truth is current.'],
    requiredNextEvidence: [],
  };
}
