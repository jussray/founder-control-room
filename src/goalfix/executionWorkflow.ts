import {
  fingerprintNormalized,
  validateCookieLineage,
  validateProofBinding,
  type ProofBinding,
  type ProofCookieContract,
} from '../security/attack20V3.js';

export const GOALFIX_EXECUTION_CONTRACT = 'founder-control-room/goalfix-execution@v2' as const;
export const GOALFIX_MERGE_PROOF_TTL_MS = 15 * 60 * 1_000;

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
  diffFingerprint: string;
  evidenceIds: readonly string[];
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixFounderDecision {
  decisionId: string;
  action: 'MERGE' | 'CONTINUE' | 'STOP';
  approvedBy: string;
  pullRequestNumber: number;
  sourceBranch: string;
  targetBranch: string;
  approvedBaseSha: string;
  approvedHeadSha: string;
  approvedDiffFingerprint: string;
  approvedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixMergeAncestryReceipt {
  receiptId: string;
  repository: string;
  pullRequestNumber: number;
  sourceBranch: string;
  targetBranch: string;
  candidateHeadSha: string;
  candidateDiffFingerprint: string;
  mergedSha: string;
  currentMainSha: string;
  containsCandidate: boolean;
  mergedAt: string;
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixRuntimeReceipt {
  receiptId: string;
  mergedSha: string;
  verdict: 'PASS' | 'FAILED' | 'UNVERIFIED';
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixPostMergeTruth {
  mergedSha: string;
  currentMainSha: string;
  runtimeProofRequired: true;
  runtimeReceiptIds: readonly string[];
  runtimeReceipts: readonly GoalfixRuntimeReceipt[];
  mergeAncestryReceipt: GoalfixMergeAncestryReceipt;
  observedAt: string;
  proofBinding: ProofBinding;
}

export interface GoalfixExecutionInput {
  repository: string;
  pullRequestNumber: number;
  branch: string;
  targetBranch: string;
  trustedFounderPrincipalId: string;
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

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return normalized.length === values.length && new Set(normalized).size === values.length;
}

export function goalfixSourceFingerprint(repository: string, headSha: string): string {
  return fingerprintNormalized({ repository, headSha: headSha.toLowerCase() });
}

export function goalfixDiffFingerprint(input: unknown): string {
  return fingerprintNormalized(input);
}

export function goalfixCheckpointEvidenceFingerprint(input: Pick<
  GoalfixExecutionCheckpoint,
  'phase' | 'repository' | 'baseSha' | 'headSha' | 'diffFingerprint' | 'evidenceIds'
>): string {
  return fingerprintNormalized({
    phase: input.phase,
    repository: input.repository,
    baseSha: input.baseSha.toLowerCase(),
    headSha: input.headSha.toLowerCase(),
    diffFingerprint: input.diffFingerprint,
    evidenceIds: [...input.evidenceIds].map((value) => value.trim()).sort(),
  });
}

export function goalfixFounderDecisionFingerprint(
  decision: Omit<GoalfixFounderDecision, 'proofBinding'>,
  repository: string,
): string {
  return fingerprintNormalized({
    repository,
    decisionId: decision.decisionId,
    action: decision.action,
    approvedBy: decision.approvedBy,
    pullRequestNumber: decision.pullRequestNumber,
    sourceBranch: decision.sourceBranch,
    targetBranch: decision.targetBranch,
    approvedBaseSha: decision.approvedBaseSha.toLowerCase(),
    approvedHeadSha: decision.approvedHeadSha.toLowerCase(),
    approvedDiffFingerprint: decision.approvedDiffFingerprint,
    approvedAt: decision.approvedAt,
  });
}

export function goalfixMergeAncestryFingerprint(receipt: Omit<GoalfixMergeAncestryReceipt, 'proofBinding'>): string {
  return fingerprintNormalized({
    ...receipt,
    candidateHeadSha: receipt.candidateHeadSha.toLowerCase(),
    mergedSha: receipt.mergedSha.toLowerCase(),
    currentMainSha: receipt.currentMainSha.toLowerCase(),
  });
}

export function goalfixRuntimeReceiptFingerprint(receipt: Omit<GoalfixRuntimeReceipt, 'proofBinding'>): string {
  return fingerprintNormalized({
    ...receipt,
    mergedSha: receipt.mergedSha.toLowerCase(),
  });
}

function allPreflightSatisfied(preflight: GoalfixStrategicPreflight): boolean {
  return Object.values(preflight).every(Boolean);
}

function checkpointTruthFingerprint(checkpoint: GoalfixExecutionCheckpoint): string {
  return fingerprintNormalized({
    phase: checkpoint.phase,
    role: checkpoint.role,
    actorId: checkpoint.actorId,
    verdict: checkpoint.verdict,
    repository: checkpoint.repository,
    baseSha: checkpoint.baseSha.toLowerCase(),
    headSha: checkpoint.headSha.toLowerCase(),
    diffFingerprint: checkpoint.diffFingerprint,
    evidenceIds: [...checkpoint.evidenceIds].map((value) => value.trim()).sort(),
    observedAt: checkpoint.observedAt,
    proofBinding: checkpoint.proofBinding,
  });
}

function latestCheckpoint(
  checkpoints: readonly GoalfixExecutionCheckpoint[],
  phase: GoalfixExecutionPhase,
): GoalfixExecutionCheckpoint | undefined {
  return checkpoints
    .filter((checkpoint) => checkpoint.phase === phase)
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt))
    .at(-1);
}

function currentCheckpoints(checkpoints: readonly GoalfixExecutionCheckpoint[]): GoalfixExecutionCheckpoint[] {
  return GOALFIX_EXECUTION_PHASES
    .map((phase) => latestCheckpoint(checkpoints, phase))
    .filter((checkpoint): checkpoint is GoalfixExecutionCheckpoint => Boolean(checkpoint));
}

function checkpointTimestampErrors(
  checkpoints: readonly GoalfixExecutionCheckpoint[],
  now: Date,
): string[] {
  const errors: string[] = [];
  for (const checkpoint of checkpoints) {
    if (!isIsoTimestamp(checkpoint.observedAt)) {
      errors.push(`${checkpoint.phase}: observedAt must be an ISO timestamp`);
      continue;
    }
    if (Date.parse(checkpoint.observedAt) > now.getTime()) {
      errors.push(`${checkpoint.phase}: observedAt cannot be in the future`);
    }
  }

  for (const phase of GOALFIX_EXECUTION_PHASES) {
    const valid = checkpoints.filter((checkpoint) => checkpoint.phase === phase && isIsoTimestamp(checkpoint.observedAt));
    if (valid.length < 2) continue;
    const latestObservedAt = Math.max(...valid.map((checkpoint) => Date.parse(checkpoint.observedAt)));
    const tiedLatest = valid.filter((checkpoint) => Date.parse(checkpoint.observedAt) === latestObservedAt);
    if (new Set(tiedLatest.map(checkpointTruthFingerprint)).size > 1) {
      errors.push(`${phase}: conflicting checkpoints share the latest observedAt timestamp`);
    }
  }
  return errors;
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
  if (!checkpoint.diffFingerprint || checkpoint.diffFingerprint !== input.diffFingerprint) errors.push(`${checkpoint.phase}: diff fingerprint mismatch`);
  if (!checkpoint.actorId.trim()) errors.push(`${checkpoint.phase}: actorId is required`);
  if (!isIsoTimestamp(checkpoint.observedAt)) errors.push(`${checkpoint.phase}: observedAt must be an ISO timestamp`);
  if (!uniqueNonEmpty(checkpoint.evidenceIds) || checkpoint.evidenceIds.length === 0) errors.push(`${checkpoint.phase}: at least one unique evidence ID is required`);

  const expectedSourceFingerprint = goalfixSourceFingerprint(input.repository, input.candidateHeadSha);
  const expectedEvidenceFingerprint = goalfixCheckpointEvidenceFingerprint(checkpoint);
  const bindingErrors = validateProofBinding(checkpoint.proofBinding, ['sourceSha', 'evidenceBundle'], now);
  errors.push(...bindingErrors.map((error) => `${checkpoint.phase}: ${error}`));
  if (checkpoint.proofBinding.fingerprints.sourceSha !== expectedSourceFingerprint) {
    errors.push(`${checkpoint.phase}: sourceSha proof fingerprint does not match candidate head`);
  }
  if (checkpoint.proofBinding.fingerprints.evidenceBundle !== expectedEvidenceFingerprint) {
    errors.push(`${checkpoint.phase}: evidenceBundle proof fingerprint does not match checkpoint evidence IDs`);
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
  if (expectedCookieContext && checkpoint.proofBinding.cookieContract.owner !== checkpoint.actorId) {
    errors.push(`${checkpoint.phase}: actorId must match the authenticated proof-cookie owner`);
  }

  return errors;
}

function checkpointSequenceErrors(checkpoints: readonly GoalfixExecutionCheckpoint[]): string[] {
  const errors: string[] = [];
  const current = currentCheckpoints(checkpoints);
  for (let index = 1; index < current.length; index += 1) {
    const previous = current[index - 1];
    const checkpoint = current[index];
    if (!previous || !checkpoint) continue;
    if (phaseIndex(checkpoint.phase) <= phaseIndex(previous.phase)) continue;
    if (isIsoTimestamp(previous.observedAt)
      && isIsoTimestamp(checkpoint.observedAt)
      && Date.parse(checkpoint.observedAt) < Date.parse(previous.observedAt)) {
      errors.push(`${checkpoint.phase}: current checkpoint predates current ${previous.phase} checkpoint`);
    }
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

  const builderPrincipal = builder?.proofBinding.cookieContract.owner;
  const verifierPrincipal = verifier?.proofBinding.cookieContract.owner;
  const redteamPrincipal = redteam?.proofBinding.cookieContract.owner;
  if (builderPrincipal && verifierPrincipal && builderPrincipal === verifierPrincipal) errors.push('Builder cannot self-certify as Verifier');
  if (builderPrincipal && redteamPrincipal && builderPrincipal === redteamPrincipal) errors.push('Builder cannot self-certify as Red Team');
  if (verifierPrincipal && redteamPrincipal && verifierPrincipal === redteamPrincipal) errors.push('Verifier and Red Team must be independent actors');
  return errors;
}

function validateFounderDecision(
  decision: GoalfixFounderDecision,
  input: GoalfixExecutionInput,
  now: Date,
  enforceFreshness: boolean,
): string[] {
  const errors: string[] = [];
  if (!decision.decisionId.trim()) errors.push('founder decision ID is required');
  if (decision.approvedBy !== input.trustedFounderPrincipalId) errors.push('founder decision identity is not the trusted authenticated founder principal');
  if (!Number.isInteger(decision.pullRequestNumber) || decision.pullRequestNumber !== input.pullRequestNumber) errors.push('founder decision PR number is stale or mismatched');
  if (decision.sourceBranch !== input.branch) errors.push('founder decision source branch is stale or mismatched');
  if (decision.targetBranch !== input.targetBranch) errors.push('founder decision target branch is stale or mismatched');
  if (decision.approvedBaseSha.toLowerCase() !== input.baseSha.toLowerCase()) errors.push('founder decision base SHA is stale or mismatched');
  if (decision.approvedHeadSha.toLowerCase() !== input.candidateHeadSha.toLowerCase()) errors.push('founder decision head SHA is stale or mismatched');
  if (decision.approvedDiffFingerprint !== input.diffFingerprint) errors.push('founder decision diff fingerprint is stale or mismatched');

  let approvedAtMs: number | null = null;
  if (!isIsoTimestamp(decision.approvedAt)) {
    errors.push('founder decision approvedAt must be an ISO timestamp');
  } else {
    approvedAtMs = Date.parse(decision.approvedAt);
    if (approvedAtMs > now.getTime()) errors.push('founder decision approval cannot be in the future');
    if (enforceFreshness && approvedAtMs < now.getTime() - GOALFIX_MERGE_PROOF_TTL_MS) {
      errors.push('founder decision approval is outside the merge proof freshness window');
    }

    const latestPreMergeObservation = currentCheckpoints(input.checkpoints)
      .filter((checkpoint) => phaseIndex(checkpoint.phase) <= phaseIndex('redteam') && isIsoTimestamp(checkpoint.observedAt))
      .map((checkpoint) => Date.parse(checkpoint.observedAt))
      .reduce<number | null>((latest, observedAt) => latest === null || observedAt > latest ? observedAt : latest, null);
    if (latestPreMergeObservation !== null && approvedAtMs < latestPreMergeObservation) {
      errors.push('founder decision must follow the latest load-bearing pre-merge checkpoint');
    }
  }

  const bindingValidationTime = !enforceFreshness && approvedAtMs !== null
    ? new Date(approvedAtMs)
    : now;
  errors.push(...validateProofBinding(decision.proofBinding, ['sourceSha', 'evidenceBundle'], bindingValidationTime).map((error) => `founder decision: ${error}`));
  errors.push(...validateCookieLineage(decision.proofBinding.cookieContract, input.cookieIndex, bindingValidationTime).map((error) => `founder decision: ${error}`));
  if (decision.proofBinding.cookieContract.contextType !== 'founder-session') errors.push('founder decision proof cookie context must be founder-session');
  if (decision.proofBinding.cookieContract.owner !== input.trustedFounderPrincipalId) errors.push('founder decision proof cookie owner is not the trusted authenticated founder principal');
  if (decision.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, input.candidateHeadSha)) {
    errors.push('founder decision sourceSha proof fingerprint does not match candidate head');
  }
  if (decision.proofBinding.fingerprints.evidenceBundle !== goalfixFounderDecisionFingerprint({ ...decision, proofBinding: undefined } as never, input.repository)) {
    errors.push('founder decision evidenceBundle does not bind exact PR/base/head/branches/diff/approval');
  }
  return errors;
}

function validateMergeAncestryReceipt(
  receipt: GoalfixMergeAncestryReceipt,
  input: GoalfixExecutionInput,
  founderDecision: GoalfixFounderDecision,
  mergedSha: string,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!receipt.receiptId.trim()) errors.push('merge ancestry receipt ID is required');
  if (receipt.repository !== input.repository) errors.push('merge ancestry repository is mismatched');
  if (receipt.pullRequestNumber !== input.pullRequestNumber) errors.push('merge ancestry PR number is mismatched');
  if (receipt.sourceBranch !== input.branch || receipt.targetBranch !== input.targetBranch) errors.push('merge ancestry branch binding is mismatched');
  if (receipt.candidateHeadSha.toLowerCase() !== input.candidateHeadSha.toLowerCase()) errors.push('merge ancestry candidate head is mismatched');
  if (receipt.candidateDiffFingerprint !== input.diffFingerprint) errors.push('merge ancestry candidate diff is mismatched');
  if (receipt.mergedSha.toLowerCase() !== mergedSha.toLowerCase() || receipt.currentMainSha.toLowerCase() !== mergedSha.toLowerCase()) errors.push('merge ancestry merged/current-main SHA is mismatched');
  if (receipt.containsCandidate !== true) errors.push('merge ancestry does not prove merged main contains the approved candidate');

  const mergedAtMs = isIsoTimestamp(receipt.mergedAt) ? Date.parse(receipt.mergedAt) : null;
  const observedAtMs = isIsoTimestamp(receipt.observedAt) ? Date.parse(receipt.observedAt) : null;
  if (mergedAtMs === null) errors.push('merge ancestry mergedAt must be an ISO timestamp');
  if (observedAtMs === null || observedAtMs > now.getTime()) errors.push('merge ancestry observedAt is invalid');
  if (mergedAtMs !== null && observedAtMs !== null && mergedAtMs > observedAtMs) errors.push('merge ancestry cannot be observed before the provider merge time');
  if (mergedAtMs !== null && isIsoTimestamp(founderDecision.approvedAt) && mergedAtMs < Date.parse(founderDecision.approvedAt)) {
    errors.push('merge ancestry provider merge time predates Founder Final authorization');
  }

  errors.push(...validateProofBinding(receipt.proofBinding, ['sourceSha', 'evidenceBundle'], now).map((error) => `merge ancestry: ${error}`));
  errors.push(...validateCookieLineage(receipt.proofBinding.cookieContract, input.cookieIndex, now).map((error) => `merge ancestry: ${error}`));
  if (receipt.proofBinding.cookieContract.contextType !== 'provider-run') errors.push('merge ancestry proof cookie context must be provider-run');
  if (receipt.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, mergedSha)) errors.push('merge ancestry sourceSha proof fingerprint does not match merged main');
  if (receipt.proofBinding.fingerprints.evidenceBundle !== goalfixMergeAncestryFingerprint({ ...receipt, proofBinding: undefined } as never)) errors.push('merge ancestry evidenceBundle does not bind candidate-to-merged proof');
  return errors;
}

function validateRuntimeReceipt(
  receipt: GoalfixRuntimeReceipt,
  input: GoalfixExecutionInput,
  mergedSha: string,
  mergedAt: string,
  expectedRuntimeFingerprint: string,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!receipt.receiptId.trim()) errors.push('runtime receipt ID is required');
  if (receipt.mergedSha.toLowerCase() !== mergedSha.toLowerCase()) errors.push(`${receipt.receiptId}: runtime receipt merged SHA is mismatched`);
  const observedAtMs = isIsoTimestamp(receipt.observedAt) ? Date.parse(receipt.observedAt) : null;
  if (observedAtMs === null || observedAtMs > now.getTime()) errors.push(`${receipt.receiptId}: runtime receipt observedAt is invalid`);
  if (observedAtMs !== null && isIsoTimestamp(mergedAt) && observedAtMs < Date.parse(mergedAt)) {
    errors.push(`${receipt.receiptId}: runtime receipt predates provider merge`);
  }
  errors.push(...validateProofBinding(receipt.proofBinding, ['sourceSha', 'runtime', 'evidenceBundle'], now).map((error) => `${receipt.receiptId}: ${error}`));
  errors.push(...validateCookieLineage(receipt.proofBinding.cookieContract, input.cookieIndex, now).map((error) => `${receipt.receiptId}: ${error}`));
  if (receipt.proofBinding.cookieContract.contextType !== 'provider-run') errors.push(`${receipt.receiptId}: runtime receipt proof cookie context must be provider-run`);
  if (receipt.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, mergedSha)) errors.push(`${receipt.receiptId}: runtime receipt sourceSha does not match merged main`);
  if (receipt.proofBinding.fingerprints.runtime !== expectedRuntimeFingerprint) errors.push(`${receipt.receiptId}: runtime receipt fingerprint does not match canonical provider witness`);
  if (receipt.proofBinding.fingerprints.evidenceBundle !== goalfixRuntimeReceiptFingerprint({ ...receipt, proofBinding: undefined } as never)) errors.push(`${receipt.receiptId}: runtime receipt evidenceBundle does not bind the receipt`);
  return errors;
}

function validatePostMergeTruth(
  truth: GoalfixPostMergeTruth,
  input: GoalfixExecutionInput,
  founderDecision: GoalfixFounderDecision,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!exactSha(truth.mergedSha) || !exactSha(truth.currentMainSha)) errors.push('post-merge truth requires exact merged and current-main SHAs');
  if (truth.mergedSha.toLowerCase() !== truth.currentMainSha.toLowerCase()) errors.push('post-merge current main does not equal merged SHA');
  if (!isIsoTimestamp(truth.observedAt) || Date.parse(truth.observedAt) > now.getTime()) errors.push('post-merge observedAt must be a current ISO timestamp');
  errors.push(...validateProofBinding(truth.proofBinding, ['sourceSha', 'runtime'], now).map((error) => `post-merge: ${error}`));
  errors.push(...validateCookieLineage(truth.proofBinding.cookieContract, input.cookieIndex, now).map((error) => `post-merge: ${error}`));
  if (truth.proofBinding.cookieContract.contextType !== 'provider-run') errors.push('post-merge proof cookie context must be provider-run');
  if (truth.proofBinding.fingerprints.sourceSha !== goalfixSourceFingerprint(input.repository, truth.mergedSha)) {
    errors.push('post-merge sourceSha proof fingerprint does not match merged/current-main SHA');
  }

  errors.push(...validateMergeAncestryReceipt(truth.mergeAncestryReceipt, input, founderDecision, truth.mergedSha, now));

  const runtimeIds = truth.runtimeReceiptIds.map((value) => value.trim());
  if (!uniqueNonEmpty(runtimeIds)) errors.push('runtime receipt IDs must be unique non-empty IDs');
  const loadedIds = truth.runtimeReceipts.map((receipt) => receipt.receiptId);
  if (runtimeIds.length !== loadedIds.length || runtimeIds.some((id) => !loadedIds.includes(id)) || loadedIds.some((id) => !runtimeIds.includes(id))) {
    errors.push('runtime receipt IDs must resolve to the loaded runtime receipt set');
  }
  const expectedRuntimeFingerprint = truth.proofBinding.fingerprints.runtime ?? '';
  for (const receipt of truth.runtimeReceipts) {
    errors.push(...validateRuntimeReceipt(
      receipt,
      input,
      truth.mergedSha,
      truth.mergeAncestryReceipt.mergedAt,
      expectedRuntimeFingerprint,
      now,
    ));
  }
  if (truth.runtimeProofRequired !== true) errors.push('post-merge runtime proof cannot be caller-disabled');
  if (truth.runtimeReceipts.length === 0) errors.push('post-merge runtime proof is required but no runtime receipt exists');
  if (truth.runtimeReceipts.some((receipt) => receipt.verdict !== 'PASS')) errors.push('post-merge runtime truth is not PASS');
  return [...new Set(errors)];
}

function hasProviderBoundMergeExecution(input: GoalfixExecutionInput, now: Date): boolean {
  if (!input.founderDecision || input.founderDecision.action !== 'MERGE' || !input.postMergeTruth) return false;
  const truth = input.postMergeTruth;
  if (!exactSha(truth.mergedSha)) return false;
  if (validateFounderDecision(input.founderDecision, input, now, false).length > 0) return false;
  return validateMergeAncestryReceipt(
    truth.mergeAncestryReceipt,
    input,
    input.founderDecision,
    truth.mergedSha,
    now,
  ).length === 0;
}

export function evaluateGoalfixExecution(input: GoalfixExecutionInput): GoalfixExecutionDecision {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  if (!input.repository.includes('/') || !input.branch.trim() || !input.targetBranch.trim() || !input.goal.trim()) reasons.push('authoritative repository, source/target branches, and founder goal are required');
  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) reasons.push('positive pull request number is required');
  if (!input.trustedFounderPrincipalId.trim()) reasons.push('trusted authenticated founder principal is required');
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

  const current = currentCheckpoints(input.checkpoints);
  const historicalMergeExecutionProven = hasProviderBoundMergeExecution(input, now);
  const checkpointErrors = [
    ...checkpointTimestampErrors(input.checkpoints, now),
    ...checkpointSequenceErrors(input.checkpoints),
    ...roleSeparationErrors(input.checkpoints),
    ...current.flatMap((checkpoint) => validateCheckpoint(
      checkpoint,
      input,
      historicalMergeExecutionProven
        ? new Date(input.postMergeTruth!.mergeAncestryReceipt.mergedAt)
        : now,
    )),
  ];
  if (checkpointErrors.length > 0) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'UNVERIFIED',
      currentPhase: current.at(-1)?.phase ?? 'observe',
      mayMerge: false,
      reasons: [...new Set(checkpointErrors)],
      requiredNextEvidence: ['Repair the broken fingerprint/cookie/evidence/role binding and rerun only the affected proof lane.'],
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

  const currentFailed = current.find((checkpoint) => checkpoint.verdict === 'FAILED' || checkpoint.verdict === 'BLOCKED');
  if (currentFailed) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'BLOCKED',
      currentPhase: currentFailed.phase,
      mayMerge: false,
      reasons: [`${currentFailed.phase} is ${currentFailed.verdict}.`],
      requiredNextEvidence: [`Repair the verified cause at ${currentFailed.phase}, then rerun that lane and every dependent later lane.`],
    };
  }

  const currentUnverified = current.find((checkpoint) => checkpoint.verdict === 'UNVERIFIED');
  if (currentUnverified) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'UNVERIFIED',
      currentPhase: currentUnverified.phase,
      mayMerge: false,
      reasons: [`${currentUnverified.phase} lacks current proof.`],
      requiredNextEvidence: [`Obtain fresh evidence for ${currentUnverified.phase}.`],
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

  if (!redteam || redteam.verdict !== 'PASS' || Date.parse(redteam.observedAt) < Date.parse(verifier.observedAt)) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'WAITING_FOR_REDTEAM',
      currentPhase: 'redteam',
      mayMerge: false,
      reasons: ['Independent Red Team PASS is required after the latest verification checkpoint.'],
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
      reasons: ['Builder, Verifier, and Red Team are current; authenticated founder merge authority has not yet been supplied.'],
      requiredNextEvidence: ['Fresh authenticated founder-final decision bound to exact PR/base/head/branches/diff.'],
    };
  }

  const founderDecisionErrors = validateFounderDecision(input.founderDecision, input, now, !input.postMergeTruth);
  if (founderDecisionErrors.length > 0 || input.founderDecision.action !== 'MERGE') {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: input.founderDecision.action === 'STOP' ? 'BLOCKED' : 'UNVERIFIED',
      currentPhase: 'merge-gate',
      mayMerge: false,
      reasons: founderDecisionErrors.length > 0 ? founderDecisionErrors : [`Founder decision is ${input.founderDecision.action}, not MERGE.`],
      requiredNextEvidence: ['A fresh authenticated founder MERGE decision bound to this exact PR/base/head/branches/diff is required.'],
    };
  }

  if (!input.postMergeTruth) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'READY_TO_MERGE',
      currentPhase: 'merge-gate',
      mayMerge: true,
      reasons: ['All pre-merge gates are current and founder merge authority is exact-candidate bound.'],
      requiredNextEvidence: ['Merge using expected-head protection, then reacquire main and verify ancestry plus post-merge/runtime truth.'],
    };
  }

  const postMergeErrors = validatePostMergeTruth(input.postMergeTruth, input, input.founderDecision, now);
  if (postMergeErrors.length > 0) {
    return {
      contract: GOALFIX_EXECUTION_CONTRACT,
      state: 'MERGED_UNVERIFIED',
      currentPhase: 'post-merge-verify',
      mayMerge: false,
      reasons: postMergeErrors,
      requiredNextEvidence: ['Reacquire merged main and obtain candidate ancestry plus correlated runtime/provider/browser receipts before declaring completion.'],
    };
  }

  return {
    contract: GOALFIX_EXECUTION_CONTRACT,
    state: 'COMPLETE',
    currentPhase: 'complete',
    mayMerge: false,
    reasons: ['Focused change is merged, candidate ancestry is proven, and post-merge truth is current.'],
    requiredNextEvidence: [],
  };
}
