import { createHash } from 'node:crypto';

export const OPERATOR_CONTINUITY_CONTRACT = 'juss-v10/operator-continuity@v1' as const;
export const OPERATOR_CONTINUITY_CONTRACT_V2 = 'juss-v10/operator-continuity@v2' as const;

export const OPERATOR_CONTINUITY_SOURCES = [
  'chatgpt',
  'base44',
  'manus',
] as const;

export const OPERATOR_CONTINUITY_SOURCES_V2 = [
  'chatgpt',
  'work',
  'codex',
  'chief',
  'base44',
  'manus',
] as const;

export type OperatorContinuitySource = (typeof OPERATOR_CONTINUITY_SOURCES)[number];
export type OperatorContinuitySourceV2 = (typeof OPERATOR_CONTINUITY_SOURCES_V2)[number];

export interface OperatorContinuityInput {
  source: OperatorContinuitySource;
  projectSlug: string;
  repositoryFullName: string;
  observedSha: string;
  evidenceRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  predecessorFingerprint?: string | null;
  runtimeVerified: boolean;
}

export interface OperatorContinuityReceipt {
  contract: typeof OPERATOR_CONTINUITY_CONTRACT;
  source: OperatorContinuitySource;
  projectSlug: string;
  repositoryFullName: string;
  observedSha: string;
  evidenceRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  predecessorFingerprint: string | null;
  runtimeVerified: boolean;
  fingerprint: string;
  browserCookie: false;
  authorizing: false;
  standingMergeAuthority: false;
  approvalCarryForward: false;
  founderDecisionRequired: true;
}

/**
 * V2 binds every load-bearing continuity membrane used by the founder operator loop.
 * A dimension may be null while genuinely unknown/not-applicable; null -> observed
 * still counts as movement and requires reacquisition before inherited proof is reused.
 *
 * The state fingerprint deliberately excludes observer identity, evidence references,
 * timestamps, expiry and predecessor metadata. Those remain on the receipt for
 * provenance/freshness. The same reality therefore has the same fingerprint when
 * handed from ChatGPT -> Work -> Chief/Codex, while proof/provider/runtime movement
 * still invalidates inherited continuity.
 */
export interface OperatorContinuityInputV2 {
  source: OperatorContinuitySourceV2;
  projectSlug: string;
  repositoryFullName: string;
  targetBranch: string;
  targetSha: string;
  prNumber: number | null;
  baseSha: string | null;
  headSha: string | null;
  scopeFingerprint: string | null;
  proofFingerprint: string | null;
  reviewFingerprint: string | null;
  providerFingerprint: string | null;
  runtimeFingerprint: string | null;
  authorityFingerprint: string | null;
  evidenceRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  predecessorFingerprint?: string | null;
}

export interface OperatorContinuityReceiptV2 {
  contract: typeof OPERATOR_CONTINUITY_CONTRACT_V2;
  source: OperatorContinuitySourceV2;
  projectSlug: string;
  repositoryFullName: string;
  targetBranch: string;
  targetSha: string;
  prNumber: number | null;
  baseSha: string | null;
  headSha: string | null;
  scopeFingerprint: string | null;
  proofFingerprint: string | null;
  reviewFingerprint: string | null;
  providerFingerprint: string | null;
  runtimeFingerprint: string | null;
  authorityFingerprint: string | null;
  evidenceRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  predecessorFingerprint: string | null;
  fingerprint: string;
  browserCookie: false;
  authorizing: false;
  standingMergeAuthority: false;
  approvalCarryForward: false;
  founderDecisionRequired: true;
}

export type OperatorContinuityInvalidationReasonV2 =
  | 'receipt_invalid'
  | 'current_input_invalid'
  | 'observation_time_invalid'
  | 'receipt_expired'
  | 'project_moved'
  | 'repository_moved'
  | 'target_branch_moved'
  | 'target_sha_moved'
  | 'pr_moved'
  | 'base_sha_moved'
  | 'head_sha_moved'
  | 'scope_moved'
  | 'proof_moved'
  | 'review_moved'
  | 'provider_moved'
  | 'runtime_moved'
  | 'authority_moved';

export interface OperatorContinuityEvaluationV2 {
  state: 'current' | 'stale' | 'invalid';
  reasons: OperatorContinuityInvalidationReasonV2[];
  reacquireRequired: boolean;
  continuityMayAuthorizeAction: false;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedEvidenceRefs(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function normalizedInput(input: OperatorContinuityInput): OperatorContinuityInput {
  return {
    source: input.source,
    projectSlug: text(input.projectSlug),
    repositoryFullName: text(input.repositoryFullName),
    observedSha: text(input.observedSha).toLowerCase(),
    evidenceRefs: normalizedEvidenceRefs(input.evidenceRefs),
    observedAt: text(input.observedAt),
    expiresAt: text(input.expiresAt),
    predecessorFingerprint: text(input.predecessorFingerprint).toLowerCase() || null,
    runtimeVerified: input.runtimeVerified === true,
  };
}

function normalizedOptionalSha(value: string | null): string | null {
  return value === null ? null : text(value).toLowerCase();
}

function normalizedOptionalFingerprint(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : text(value).toLowerCase();
}

function normalizedPrNumber(value: number | null): number | null {
  return value === null ? null : value;
}

function normalizedInputV2(input: OperatorContinuityInputV2): OperatorContinuityInputV2 {
  return {
    source: input.source,
    projectSlug: text(input.projectSlug),
    repositoryFullName: text(input.repositoryFullName).toLowerCase(),
    targetBranch: text(input.targetBranch),
    targetSha: text(input.targetSha).toLowerCase(),
    prNumber: normalizedPrNumber(input.prNumber),
    baseSha: normalizedOptionalSha(input.baseSha),
    headSha: normalizedOptionalSha(input.headSha),
    scopeFingerprint: normalizedOptionalFingerprint(input.scopeFingerprint),
    proofFingerprint: normalizedOptionalFingerprint(input.proofFingerprint),
    reviewFingerprint: normalizedOptionalFingerprint(input.reviewFingerprint),
    providerFingerprint: normalizedOptionalFingerprint(input.providerFingerprint),
    runtimeFingerprint: normalizedOptionalFingerprint(input.runtimeFingerprint),
    authorityFingerprint: normalizedOptionalFingerprint(input.authorityFingerprint),
    evidenceRefs: normalizedEvidenceRefs(input.evidenceRefs),
    observedAt: text(input.observedAt),
    expiresAt: text(input.expiresAt),
    predecessorFingerprint: normalizedOptionalFingerprint(input.predecessorFingerprint),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

/** Hash one proof/provider/review/runtime/authority observation without retaining raw data. */
export function operatorContinuityDimensionFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

export function operatorContinuityInputErrors(input: OperatorContinuityInput): string[] {
  const value = normalizedInput(input);
  const errors: string[] = [];

  if (!OPERATOR_CONTINUITY_SOURCES.includes(value.source)) errors.push('unsupported operator continuity source');
  if (!value.projectSlug) errors.push('projectSlug is required');
  if (!REPOSITORY.test(value.repositoryFullName)) errors.push('repositoryFullName must be owner/name');
  if (!FULL_SHA.test(value.observedSha)) errors.push('observedSha must be a full 40-character Git SHA');
  if (value.evidenceRefs.length === 0) errors.push('at least one evidenceRef is required');
  if (value.evidenceRefs.length > 20) errors.push('evidenceRefs must contain at most 20 entries');
  if (value.evidenceRefs.some((entry) => entry.length > 256)) errors.push('evidenceRef entries must be at most 256 characters');

  const observedMs = Date.parse(value.observedAt);
  const expiresMs = Date.parse(value.expiresAt);
  if (!Number.isFinite(observedMs)) errors.push('observedAt must be an ISO-compatible timestamp');
  if (!Number.isFinite(expiresMs)) errors.push('expiresAt must be an ISO-compatible timestamp');
  if (Number.isFinite(observedMs) && Number.isFinite(expiresMs) && expiresMs <= observedMs) {
    errors.push('expiresAt must be later than observedAt');
  }

  if (value.predecessorFingerprint && !SHA256.test(value.predecessorFingerprint)) {
    errors.push('predecessorFingerprint must be a 64-character SHA-256 hash when supplied');
  }

  return [...new Set(errors)];
}

export function operatorContinuityInputErrorsV2(input: OperatorContinuityInputV2): string[] {
  const value = normalizedInputV2(input);
  const errors: string[] = [];

  if (!OPERATOR_CONTINUITY_SOURCES_V2.includes(value.source)) errors.push('unsupported operator continuity source');
  if (!value.projectSlug) errors.push('projectSlug is required');
  if (!REPOSITORY.test(value.repositoryFullName)) errors.push('repositoryFullName must be owner/name');
  if (!value.targetBranch) errors.push('targetBranch is required');
  if (!FULL_SHA.test(value.targetSha)) errors.push('targetSha must be a full 40-character Git SHA');
  if (value.prNumber !== null && (!Number.isInteger(value.prNumber) || value.prNumber <= 0)) {
    errors.push('prNumber must be a positive integer or null');
  }
  for (const [field, sha] of [['baseSha', value.baseSha], ['headSha', value.headSha]] as const) {
    if (sha !== null && !FULL_SHA.test(sha)) errors.push(`${field} must be a full 40-character Git SHA or null`);
  }
  for (const [field, fingerprint] of [
    ['scopeFingerprint', value.scopeFingerprint],
    ['proofFingerprint', value.proofFingerprint],
    ['reviewFingerprint', value.reviewFingerprint],
    ['providerFingerprint', value.providerFingerprint],
    ['runtimeFingerprint', value.runtimeFingerprint],
    ['authorityFingerprint', value.authorityFingerprint],
    ['predecessorFingerprint', value.predecessorFingerprint ?? null],
  ] as const) {
    if (fingerprint !== null && !SHA256.test(fingerprint)) {
      errors.push(`${field} must be a 64-character SHA-256 hash or null`);
    }
  }
  if (value.evidenceRefs.length === 0) errors.push('at least one evidenceRef is required');
  if (value.evidenceRefs.length > 40) errors.push('evidenceRefs must contain at most 40 entries');
  if (value.evidenceRefs.some((entry) => entry.length > 256)) errors.push('evidenceRef entries must be at most 256 characters');

  const observedMs = Date.parse(value.observedAt);
  const expiresMs = Date.parse(value.expiresAt);
  if (!Number.isFinite(observedMs)) errors.push('observedAt must be an ISO-compatible timestamp');
  if (!Number.isFinite(expiresMs)) errors.push('expiresAt must be an ISO-compatible timestamp');
  if (Number.isFinite(observedMs) && Number.isFinite(expiresMs) && expiresMs <= observedMs) {
    errors.push('expiresAt must be later than observedAt');
  }

  return [...new Set(errors)];
}

export function operatorContinuityFingerprint(input: OperatorContinuityInput): string {
  const value = normalizedInput(input);
  return createHash('sha256').update(JSON.stringify([
    OPERATOR_CONTINUITY_CONTRACT,
    value.source,
    value.projectSlug,
    value.repositoryFullName,
    value.observedSha,
    value.evidenceRefs,
    value.observedAt,
    value.expiresAt,
    value.predecessorFingerprint,
    value.runtimeVerified,
    false,
    false,
    false,
    false,
    true,
  ])).digest('hex');
}

/**
 * State identity only. Receipt provenance (source/evidence refs/time/expiry/predecessor)
 * is intentionally excluded so identical reality hashes identically across operators.
 */
export function operatorContinuityFingerprintV2(input: OperatorContinuityInputV2): string {
  const value = normalizedInputV2(input);
  return createHash('sha256').update(JSON.stringify([
    OPERATOR_CONTINUITY_CONTRACT_V2,
    value.projectSlug,
    value.repositoryFullName,
    value.targetBranch,
    value.targetSha,
    value.prNumber,
    value.baseSha,
    value.headSha,
    value.scopeFingerprint,
    value.proofFingerprint,
    value.reviewFingerprint,
    value.providerFingerprint,
    value.runtimeFingerprint,
    value.authorityFingerprint,
  ])).digest('hex');
}

/**
 * Bind pre-decision operator evidence into a deterministic continuity receipt.
 *
 * This receipt is deliberately non-authorizing. ChatGPT may later relay a
 * separately explicit founder decision through FounderControlDecision; Base44
 * and Manus evidence cannot become approval merely because it was connected,
 * cached, fingerprinted, or observed by this contract.
 */
export function createOperatorContinuityReceipt(input: OperatorContinuityInput): OperatorContinuityReceipt {
  const value = normalizedInput(input);
  const errors = operatorContinuityInputErrors(value);
  if (errors.length > 0) throw new Error(errors.join('; '));

  return {
    contract: OPERATOR_CONTINUITY_CONTRACT,
    source: value.source,
    projectSlug: value.projectSlug,
    repositoryFullName: value.repositoryFullName,
    observedSha: value.observedSha,
    evidenceRefs: value.evidenceRefs,
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    predecessorFingerprint: value.predecessorFingerprint ?? null,
    runtimeVerified: value.runtimeVerified,
    fingerprint: operatorContinuityFingerprint(value),
    browserCookie: false,
    authorizing: false,
    standingMergeAuthority: false,
    approvalCarryForward: false,
    founderDecisionRequired: true,
  };
}

export function createOperatorContinuityReceiptV2(input: OperatorContinuityInputV2): OperatorContinuityReceiptV2 {
  const value = normalizedInputV2(input);
  const errors = operatorContinuityInputErrorsV2(value);
  if (errors.length > 0) throw new Error(errors.join('; '));

  return {
    contract: OPERATOR_CONTINUITY_CONTRACT_V2,
    source: value.source,
    projectSlug: value.projectSlug,
    repositoryFullName: value.repositoryFullName,
    targetBranch: value.targetBranch,
    targetSha: value.targetSha,
    prNumber: value.prNumber,
    baseSha: value.baseSha,
    headSha: value.headSha,
    scopeFingerprint: value.scopeFingerprint,
    proofFingerprint: value.proofFingerprint,
    reviewFingerprint: value.reviewFingerprint,
    providerFingerprint: value.providerFingerprint,
    runtimeFingerprint: value.runtimeFingerprint,
    authorityFingerprint: value.authorityFingerprint,
    evidenceRefs: value.evidenceRefs,
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    predecessorFingerprint: value.predecessorFingerprint ?? null,
    fingerprint: operatorContinuityFingerprintV2(value),
    browserCookie: false,
    authorizing: false,
    standingMergeAuthority: false,
    approvalCarryForward: false,
    founderDecisionRequired: true,
  };
}

export function validateOperatorContinuityReceipt(receipt: OperatorContinuityReceipt): string[] {
  const input: OperatorContinuityInput = {
    source: receipt.source,
    projectSlug: receipt.projectSlug,
    repositoryFullName: receipt.repositoryFullName,
    observedSha: receipt.observedSha,
    evidenceRefs: receipt.evidenceRefs,
    observedAt: receipt.observedAt,
    expiresAt: receipt.expiresAt,
    predecessorFingerprint: receipt.predecessorFingerprint,
    runtimeVerified: receipt.runtimeVerified,
  };
  const errors = operatorContinuityInputErrors(input);

  if (receipt.contract !== OPERATOR_CONTINUITY_CONTRACT) errors.push('operator continuity contract is unsupported');
  if (receipt.fingerprint !== operatorContinuityFingerprint(input)) errors.push('operator continuity fingerprint does not match bound evidence');
  if (receipt.browserCookie !== false) errors.push('operator continuity must never become a browser cookie');
  if (receipt.authorizing !== false) errors.push('operator continuity cannot authorize actions');
  if (receipt.standingMergeAuthority !== false) errors.push('operator continuity cannot carry standing merge authority');
  if (receipt.approvalCarryForward !== false) errors.push('operator continuity cannot carry approval forward');
  if (receipt.founderDecisionRequired !== true) errors.push('operator continuity requires a separate explicit founder decision');

  return [...new Set(errors)];
}

export function validateOperatorContinuityReceiptV2(receipt: OperatorContinuityReceiptV2): string[] {
  const input: OperatorContinuityInputV2 = {
    source: receipt.source,
    projectSlug: receipt.projectSlug,
    repositoryFullName: receipt.repositoryFullName,
    targetBranch: receipt.targetBranch,
    targetSha: receipt.targetSha,
    prNumber: receipt.prNumber,
    baseSha: receipt.baseSha,
    headSha: receipt.headSha,
    scopeFingerprint: receipt.scopeFingerprint,
    proofFingerprint: receipt.proofFingerprint,
    reviewFingerprint: receipt.reviewFingerprint,
    providerFingerprint: receipt.providerFingerprint,
    runtimeFingerprint: receipt.runtimeFingerprint,
    authorityFingerprint: receipt.authorityFingerprint,
    evidenceRefs: receipt.evidenceRefs,
    observedAt: receipt.observedAt,
    expiresAt: receipt.expiresAt,
    predecessorFingerprint: receipt.predecessorFingerprint,
  };
  const errors = operatorContinuityInputErrorsV2(input);

  if (receipt.contract !== OPERATOR_CONTINUITY_CONTRACT_V2) errors.push('operator continuity v2 contract is unsupported');
  if (receipt.fingerprint !== operatorContinuityFingerprintV2(input)) errors.push('operator continuity v2 fingerprint does not match bound evidence');
  if (receipt.browserCookie !== false) errors.push('operator continuity must never become a browser cookie');
  if (receipt.authorizing !== false) errors.push('operator continuity cannot authorize actions');
  if (receipt.standingMergeAuthority !== false) errors.push('operator continuity cannot carry standing merge authority');
  if (receipt.approvalCarryForward !== false) errors.push('operator continuity cannot carry approval forward');
  if (receipt.founderDecisionRequired !== true) errors.push('operator continuity requires a separate explicit founder decision');

  return [...new Set(errors)];
}

export function evaluateOperatorContinuityReceiptV2(
  receipt: OperatorContinuityReceiptV2,
  current: OperatorContinuityInputV2,
  now: string,
): OperatorContinuityEvaluationV2 {
  const reasons: OperatorContinuityInvalidationReasonV2[] = [];
  const add = (reason: OperatorContinuityInvalidationReasonV2) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (validateOperatorContinuityReceiptV2(receipt).length > 0) add('receipt_invalid');
  if (operatorContinuityInputErrorsV2(current).length > 0) add('current_input_invalid');

  const nowMs = Date.parse(now);
  const expiresMs = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) {
    add('observation_time_invalid');
  } else if (nowMs > expiresMs) {
    add('receipt_expired');
  }

  if (!reasons.includes('receipt_invalid') && !reasons.includes('current_input_invalid')) {
    const prior = normalizedInputV2({
      source: receipt.source,
      projectSlug: receipt.projectSlug,
      repositoryFullName: receipt.repositoryFullName,
      targetBranch: receipt.targetBranch,
      targetSha: receipt.targetSha,
      prNumber: receipt.prNumber,
      baseSha: receipt.baseSha,
      headSha: receipt.headSha,
      scopeFingerprint: receipt.scopeFingerprint,
      proofFingerprint: receipt.proofFingerprint,
      reviewFingerprint: receipt.reviewFingerprint,
      providerFingerprint: receipt.providerFingerprint,
      runtimeFingerprint: receipt.runtimeFingerprint,
      authorityFingerprint: receipt.authorityFingerprint,
      evidenceRefs: receipt.evidenceRefs,
      observedAt: receipt.observedAt,
      expiresAt: receipt.expiresAt,
      predecessorFingerprint: receipt.predecessorFingerprint,
    });
    const next = normalizedInputV2(current);

    if (prior.projectSlug !== next.projectSlug) add('project_moved');
    if (prior.repositoryFullName !== next.repositoryFullName) add('repository_moved');
    if (prior.targetBranch !== next.targetBranch) add('target_branch_moved');
    if (prior.targetSha !== next.targetSha) add('target_sha_moved');
    if (prior.prNumber !== next.prNumber) add('pr_moved');
    if (prior.baseSha !== next.baseSha) add('base_sha_moved');
    if (prior.headSha !== next.headSha) add('head_sha_moved');
    if (prior.scopeFingerprint !== next.scopeFingerprint) add('scope_moved');
    if (prior.proofFingerprint !== next.proofFingerprint) add('proof_moved');
    if (prior.reviewFingerprint !== next.reviewFingerprint) add('review_moved');
    if (prior.providerFingerprint !== next.providerFingerprint) add('provider_moved');
    if (prior.runtimeFingerprint !== next.runtimeFingerprint) add('runtime_moved');
    if (prior.authorityFingerprint !== next.authorityFingerprint) add('authority_moved');
  }

  const invalid = reasons.includes('receipt_invalid')
    || reasons.includes('current_input_invalid')
    || reasons.includes('observation_time_invalid');

  return {
    state: invalid ? 'invalid' : reasons.length > 0 ? 'stale' : 'current',
    reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
    reacquireRequired: invalid || reasons.length > 0,
    continuityMayAuthorizeAction: false,
  };
}


/**
 * Mode-neutral task pointers accompany the existing operator evidence receipt.
 * The packet never contains a transcript or private source content: callers
 * persist those in their existing access-controlled store and supply references.
 * A mode change is neither a capability downgrade nor an authorization event.
 */
export const OPERATOR_EXECUTION_CONTINUATION_CONTRACT =
  'juss-v10/operator-execution-continuation@v1' as const;

export type OperatorInteractionMode = 'chat' | 'work';

export interface OperatorExecutionContinuationInput {
  sourceMode: OperatorInteractionMode;
  taskId: string;
  intentRef: string;
  contextRefs: readonly string[];
  completedSteps: readonly { stepId: string; evidenceRefs: readonly string[] }[];
  remainingStepIds: readonly string[];
  nextActionRef: string | null;
  pendingDecisionRefs: readonly string[];
  observation: OperatorContinuityReceiptV2;
}

export interface OperatorExecutionContinuation extends OperatorExecutionContinuationInput {
  contract: typeof OPERATOR_EXECUTION_CONTINUATION_CONTRACT;
  fingerprint: string;
  authorizing: false;
  approvalCarryForward: false;
  browserCookie: false;
}

export interface OperatorExecutionResume {
  state: 'CURRENT' | 'REVALIDATE' | 'INVALID';
  targetMode: OperatorInteractionMode;
  conversationMayResume: boolean;
  toolAccessPolicy: 'current_surface_available_tools';
  executionAuthorityFromHandoff: false;
  evidenceReacquisitionRequired: boolean;
  reasons: readonly string[];
}

function continuationIdentifier(value: string, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(normalized)) {
    throw new Error(field + ' must be a bounded identifier');
  }
  return normalized;
}

function continuationRef(value: string, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length > 256 || !/^[a-z][a-z0-9+.-]*:\S+$/i.test(normalized)) {
    throw new Error(field + ' must be a bounded source reference, not raw conversation content');
  }
  return normalized;
}

function continuationRefs(values: readonly string[], field: string, requireOne = false): string[] {
  if (!Array.isArray(values) || values.length > 40) {
    throw new Error(field + ' must be an array of at most 40 references');
  }
  const result = [...new Set(values.map((value) => continuationRef(value, field)))].sort();
  if (requireOne && result.length === 0) throw new Error(field + ' requires a source reference');
  return result;
}

function normalizedContinuation(input: OperatorExecutionContinuationInput): OperatorExecutionContinuationInput {
  if (input.sourceMode !== 'chat' && input.sourceMode !== 'work') {
    throw new Error('sourceMode must be chat or work');
  }
  const observationErrors = validateOperatorContinuityReceiptV2(input.observation);
  if (observationErrors.length) throw new Error('observation invalid: ' + observationErrors.join('; '));
  if (!Array.isArray(input.completedSteps) || input.completedSteps.length > 40) {
    throw new Error('completedSteps must be an array of at most 40 steps');
  }
  const completedSteps = input.completedSteps.map((step) => ({
    stepId: continuationIdentifier(step.stepId, 'completed step'),
    evidenceRefs: continuationRefs(step.evidenceRefs, 'completed step evidence', true),
  }));
  const completedIds = completedSteps.map((step) => step.stepId);
  if (new Set(completedIds).size !== completedIds.length) {
    throw new Error('completedSteps must not repeat step identifiers');
  }
  if (!Array.isArray(input.remainingStepIds) || input.remainingStepIds.length > 40) {
    throw new Error('remainingStepIds must be an array of at most 40 steps');
  }
  const remainingStepIds = [...new Set(input.remainingStepIds.map((id) =>
    continuationIdentifier(id, 'remaining step')))];
  if (remainingStepIds.some((id) => completedIds.includes(id))) {
    throw new Error('a completed step cannot also be remaining');
  }
  return {
    sourceMode: input.sourceMode,
    taskId: continuationIdentifier(input.taskId, 'taskId'),
    intentRef: continuationRef(input.intentRef, 'intentRef'),
    contextRefs: continuationRefs(input.contextRefs, 'contextRefs', true),
    completedSteps,
    remainingStepIds,
    nextActionRef: input.nextActionRef === null ? null : continuationRef(input.nextActionRef, 'nextActionRef'),
    pendingDecisionRefs: continuationRefs(input.pendingDecisionRefs, 'pendingDecisionRefs'),
    observation: input.observation,
  };
}

export function operatorExecutionContinuationFingerprint(input: OperatorExecutionContinuationInput): string {
  const normalized = normalizedContinuation(input);
  // The presentation mode is deliberately excluded: Chat and Work share task identity.
  return createHash('sha256').update(JSON.stringify([
    OPERATOR_EXECUTION_CONTINUATION_CONTRACT,
    normalized.taskId,
    normalized.intentRef,
    normalized.contextRefs,
    normalized.completedSteps,
    normalized.remainingStepIds,
    normalized.nextActionRef,
    normalized.pendingDecisionRefs,
    normalized.observation.fingerprint,
  ])).digest('hex');
}

export function createOperatorExecutionContinuation(
  input: OperatorExecutionContinuationInput,
): OperatorExecutionContinuation {
  const normalized = normalizedContinuation(input);
  return {
    contract: OPERATOR_EXECUTION_CONTINUATION_CONTRACT,
    ...normalized,
    fingerprint: operatorExecutionContinuationFingerprint(normalized),
    authorizing: false,
    approvalCarryForward: false,
    browserCookie: false,
  };
}

export function validateOperatorExecutionContinuation(record: OperatorExecutionContinuation): string[] {
  const errors: string[] = [];
  if (record.contract !== OPERATOR_EXECUTION_CONTINUATION_CONTRACT) {
    errors.push('execution continuation contract is unsupported');
  }
  if (record.authorizing !== false || record.approvalCarryForward !== false || record.browserCookie !== false) {
    errors.push('execution continuation cannot become an authorization, approval, or browser cookie');
  }
  try {
    if (record.fingerprint !== operatorExecutionContinuationFingerprint(record)) {
      errors.push('execution continuation fingerprint does not match its state');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'execution continuation is malformed');
  }
  return [...new Set(errors)];
}

/**
 * Resume discussion on either surface without promoting yesterday's proof.
 * Callers must resolve contextRefs in their authenticated store and independently
 * check the current surface's tools and authority before executing actions.
 */
export function evaluateOperatorExecutionContinuation(
  record: OperatorExecutionContinuation,
  current: OperatorContinuityInputV2,
  now: string,
  targetMode: OperatorInteractionMode,
): OperatorExecutionResume {
  const errors = validateOperatorExecutionContinuation(record);
  if (targetMode !== 'chat' && targetMode !== 'work') errors.push('unsupported target mode');
  const continuity = errors.length === 0
    ? evaluateOperatorContinuityReceiptV2(record.observation, current, now)
    : null;
  const state = errors.length > 0 || continuity?.state === 'invalid'
    ? 'INVALID'
    : continuity?.state === 'stale'
      ? 'REVALIDATE'
      : 'CURRENT';
  return {
    state,
    targetMode,
    conversationMayResume: state !== 'INVALID',
    toolAccessPolicy: 'current_surface_available_tools',
    executionAuthorityFromHandoff: false,
    evidenceReacquisitionRequired: state !== 'CURRENT',
    reasons: [...errors, ...(continuity?.reasons ?? [])],
  };
}
