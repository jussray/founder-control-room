import { createHash } from 'node:crypto';

export const OPERATOR_CONTINUITY_CONTRACT = 'juss-v10/operator-continuity@v1' as const;

export const OPERATOR_CONTINUITY_SOURCES = [
  'chatgpt',
  'base44',
  'manus',
] as const;

export type OperatorContinuitySource = (typeof OPERATOR_CONTINUITY_SOURCES)[number];

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
