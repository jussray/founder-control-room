import { createHash } from 'node:crypto';
import type { Capability } from './workbenchRegistry.js';

export const WATERTRUTH_SHADOW_CAPABILITY_ID = 'watertruth-evidence-gated-authority-shadow-v1';
export const WATERTRUTH_SHADOW_CONTRACT = 'fcr/watertruth-evidence-gated-authority-shadow@v1' as const;

export type WaterTruthEvidenceState = 'VERIFIED' | 'DEGRADED' | 'UNKNOWN' | 'CONTRADICTED';
export type WaterTruthEvidenceKind =
  | 'telemetry_integrity'
  | 'calibration'
  | 'model_domain'
  | 'operator_approval'
  | 'independent_verification'
  | 'qualified_reviewer';

export type WaterTruthActionClass =
  | 'OBSERVATION'
  | 'RECOMMENDATION'
  | 'REVERSIBLE_OPERATIONAL_ADJUSTMENT'
  | 'POTABILITY_CLAIM';

export type WaterTruthShadowAuthority = 'OBSERVE' | 'RECOMMEND' | 'SUPERVISED_ACTION';
export type WaterTruthEvidenceDisposition = 'VERIFIED' | 'DEGRADED' | 'UNKNOWN' | 'CONTRADICTED';
export type WaterTruthShadowDisposition =
  | 'OBSERVE'
  | 'RECOMMEND'
  | 'SUPERVISED_ACTION_ELIGIBLE'
  | 'HOLD_FOR_EVIDENCE'
  | 'HUMAN_VERIFICATION_REQUIRED';

export type WaterTruthFailureClassification =
  | 'MISSING_EVIDENCE'
  | 'DUPLICATE_EVIDENCE'
  | 'INVALID_EVIDENCE'
  | 'STALE_EVIDENCE'
  | 'DEGRADED_EVIDENCE'
  | 'UNKNOWN_EVIDENCE'
  | 'CONTRADICTED_EVIDENCE';

export interface WaterTruthEvidenceSignal {
  kind: WaterTruthEvidenceKind;
  state: WaterTruthEvidenceState;
  observedAt: string;
  evidenceRef: string;
  staleAfterSeconds: number;
}

export interface WaterTruthContinuityInput {
  priorEvidenceFingerprint?: string | null;
  priorProofCookie?: string | null;
}

export interface WaterTruthShadowInput extends WaterTruthContinuityInput {
  actionId: string;
  actionClass: WaterTruthActionClass;
  proposedAction: string;
  evaluatedAt: string;
  evidence: WaterTruthEvidenceSignal[];
}

export interface WaterTruthFailureReceipt {
  id: string;
  classification: WaterTruthFailureClassification;
  status: 'BLOCKED' | 'DEGRADED';
  evidenceKind: WaterTruthEvidenceKind;
  evidenceRef: string | null;
  reason: string;
}

export interface WaterTruthContinuityReceipt {
  predecessorFingerprint: string | null;
  predecessorProofCookie: string | null;
  evidenceFingerprint: string;
  proofCookie: string;
  transition: 'initial' | 'confirmed' | 'changed';
  authorityEffect: 'none';
}

export interface WaterTruthShadowReceipt {
  contract: typeof WATERTRUTH_SHADOW_CONTRACT;
  actionId: string;
  actionClass: WaterTruthActionClass;
  proposedAction: string;
  evaluatedAt: string;
  evidenceDisposition: WaterTruthEvidenceDisposition;
  shadowAuthority: WaterTruthShadowAuthority;
  shadowDisposition: WaterTruthShadowDisposition;
  claimReviewReady: boolean;
  shadowOnly: true;
  mutationAllowed: false;
  liveWaterControlAllowed: false;
  physicalActuationAttempted: false;
  potabilityClaimAllowed: false;
  failureReceipts: WaterTruthFailureReceipt[];
  continuity: WaterTruthContinuityReceipt;
  fingerprint: string;
}

export class WaterTruthShadowError extends Error {
  constructor(
    public readonly code: 'watertruth_invalid_request',
    message: string,
  ) {
    super(message);
    this.name = 'WaterTruthShadowError';
  }
}

const EVIDENCE_KINDS: readonly WaterTruthEvidenceKind[] = [
  'telemetry_integrity',
  'calibration',
  'model_domain',
  'operator_approval',
  'independent_verification',
  'qualified_reviewer',
];

const EVIDENCE_STATES: readonly WaterTruthEvidenceState[] = [
  'VERIFIED',
  'DEGRADED',
  'UNKNOWN',
  'CONTRADICTED',
];

const ACTION_CLASSES: readonly WaterTruthActionClass[] = [
  'OBSERVATION',
  'RECOMMENDATION',
  'REVERSIBLE_OPERATIONAL_ADJUSTMENT',
  'POTABILITY_CLAIM',
];

const REQUIREMENTS: Record<WaterTruthActionClass, readonly WaterTruthEvidenceKind[]> = {
  OBSERVATION: ['telemetry_integrity'],
  RECOMMENDATION: ['telemetry_integrity', 'calibration', 'model_domain'],
  REVERSIBLE_OPERATIONAL_ADJUSTMENT: [
    'telemetry_integrity',
    'calibration',
    'model_domain',
    'operator_approval',
  ],
  POTABILITY_CLAIM: [
    'telemetry_integrity',
    'calibration',
    'independent_verification',
    'qualified_reviewer',
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedMarker(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 256) : null;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function proofCookieFor(evidenceFingerprint: string): string {
  return `watertruth-shadow:v1:${evidenceFingerprint.replace(/^sha256:/, '').slice(0, 32)}`;
}

function parseEvidenceSignal(value: unknown, index: number): WaterTruthEvidenceSignal {
  const record = asRecord(value);
  if (!record) {
    throw new WaterTruthShadowError('watertruth_invalid_request', `evidence[${index}] must be an object`);
  }

  const kind = typeof record.kind === 'string' ? record.kind : '';
  const state = typeof record.state === 'string' ? record.state : '';
  const observedAt = typeof record.observedAt === 'string' ? record.observedAt.trim() : '';
  const evidenceRef = typeof record.evidenceRef === 'string' ? record.evidenceRef.trim() : '';
  const staleAfterSeconds = typeof record.staleAfterSeconds === 'number'
    ? record.staleAfterSeconds
    : Number.NaN;

  if (!EVIDENCE_KINDS.includes(kind as WaterTruthEvidenceKind)) {
    throw new WaterTruthShadowError('watertruth_invalid_request', `evidence[${index}].kind is unsupported`);
  }
  if (!EVIDENCE_STATES.includes(state as WaterTruthEvidenceState)) {
    throw new WaterTruthShadowError('watertruth_invalid_request', `evidence[${index}].state is unsupported`);
  }

  return {
    kind: kind as WaterTruthEvidenceKind,
    state: state as WaterTruthEvidenceState,
    observedAt,
    evidenceRef,
    staleAfterSeconds,
  };
}

export function parseWaterTruthShadowInput(value: unknown): WaterTruthShadowInput {
  const record = asRecord(value);
  if (!record) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'WaterTruth shadow input must be an object');
  }

  const actionId = typeof record.actionId === 'string' ? record.actionId.trim() : '';
  const actionClass = typeof record.actionClass === 'string' ? record.actionClass : '';
  const proposedAction = typeof record.proposedAction === 'string' ? record.proposedAction.trim() : '';
  const evaluatedAt = typeof record.evaluatedAt === 'string' ? record.evaluatedAt.trim() : '';

  if (!actionId) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'actionId is required');
  }
  if (!ACTION_CLASSES.includes(actionClass as WaterTruthActionClass)) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'actionClass is unsupported');
  }
  if (!proposedAction) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'proposedAction is required');
  }
  if (!Number.isFinite(Date.parse(evaluatedAt))) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'evaluatedAt must be an ISO-compatible timestamp');
  }
  if (!Array.isArray(record.evidence)) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'evidence must be an array');
  }
  if (record.evidence.length > 50) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'evidence may contain at most 50 signals');
  }

  return {
    actionId,
    actionClass: actionClass as WaterTruthActionClass,
    proposedAction,
    evaluatedAt,
    evidence: record.evidence.map(parseEvidenceSignal),
    priorEvidenceFingerprint: normalizedMarker(
      typeof record.priorEvidenceFingerprint === 'string' ? record.priorEvidenceFingerprint : null,
    ),
    priorProofCookie: normalizedMarker(
      typeof record.priorProofCookie === 'string' ? record.priorProofCookie : null,
    ),
  };
}

function evidenceIssue(
  signal: WaterTruthEvidenceSignal,
  evaluatedAtMs: number,
): WaterTruthFailureReceipt | null {
  if (!signal.evidenceRef) {
    return {
      id: `invalid-evidence-ref:${signal.kind}`,
      classification: 'INVALID_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: null,
      reason: `${signal.kind} evidenceRef is required`,
    };
  }

  const observedAtMs = Date.parse(signal.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    return {
      id: `invalid-observed-at:${signal.kind}`,
      classification: 'INVALID_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} observedAt must be an ISO-compatible timestamp`,
    };
  }

  if (!Number.isFinite(signal.staleAfterSeconds) || signal.staleAfterSeconds <= 0) {
    return {
      id: `invalid-stale-window:${signal.kind}`,
      classification: 'INVALID_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} staleAfterSeconds must be a finite positive number`,
    };
  }

  if (observedAtMs > evaluatedAtMs) {
    return {
      id: `future-evidence:${signal.kind}`,
      classification: 'INVALID_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} observedAt cannot be later than evaluatedAt`,
    };
  }

  if ((evaluatedAtMs - observedAtMs) / 1_000 > signal.staleAfterSeconds) {
    return {
      id: `stale-evidence:${signal.kind}`,
      classification: 'STALE_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} evidence exceeded its freshness window`,
    };
  }

  if (signal.state === 'DEGRADED') {
    return {
      id: `degraded-evidence:${signal.kind}`,
      classification: 'DEGRADED_EVIDENCE',
      status: 'DEGRADED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} evidence is degraded`,
    };
  }

  if (signal.state === 'UNKNOWN') {
    return {
      id: `unknown-evidence:${signal.kind}`,
      classification: 'UNKNOWN_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} evidence is unknown`,
    };
  }

  if (signal.state === 'CONTRADICTED') {
    return {
      id: `contradicted-evidence:${signal.kind}`,
      classification: 'CONTRADICTED_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: signal.kind,
      evidenceRef: signal.evidenceRef,
      reason: `${signal.kind} evidence is contradicted`,
    };
  }

  return null;
}

function dispositionFor(failures: WaterTruthFailureReceipt[]): WaterTruthEvidenceDisposition {
  if (failures.some((failure) => failure.classification === 'CONTRADICTED_EVIDENCE')) {
    return 'CONTRADICTED';
  }
  if (failures.some((failure) => failure.status === 'BLOCKED')) {
    return 'UNKNOWN';
  }
  if (failures.some((failure) => failure.classification === 'DEGRADED_EVIDENCE')) {
    return 'DEGRADED';
  }
  return 'VERIFIED';
}

function currentVerifiedKinds(
  byKind: ReadonlyMap<WaterTruthEvidenceKind, WaterTruthEvidenceSignal[]>,
  evaluatedAtMs: number,
): Set<WaterTruthEvidenceKind> {
  const verified = new Set<WaterTruthEvidenceKind>();
  for (const [kind, signals] of byKind.entries()) {
    if (signals.length !== 1) continue;
    const [signal] = signals;
    if (signal.state === 'VERIFIED' && evidenceIssue(signal, evaluatedAtMs) === null) {
      verified.add(kind);
    }
  }
  return verified;
}

function hasAll(
  available: ReadonlySet<WaterTruthEvidenceKind>,
  required: readonly WaterTruthEvidenceKind[],
): boolean {
  return required.every((kind) => available.has(kind));
}

export function evaluateWaterTruthShadow(input: WaterTruthShadowInput): WaterTruthShadowReceipt {
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  if (!Number.isFinite(evaluatedAtMs)) {
    throw new WaterTruthShadowError('watertruth_invalid_request', 'evaluatedAt must be an ISO-compatible timestamp');
  }

  const failureReceipts: WaterTruthFailureReceipt[] = [];
  const byKind = new Map<WaterTruthEvidenceKind, WaterTruthEvidenceSignal[]>();

  for (const signal of input.evidence) {
    const values = byKind.get(signal.kind) ?? [];
    values.push(signal);
    byKind.set(signal.kind, values);
    const issue = evidenceIssue(signal, evaluatedAtMs);
    if (issue) failureReceipts.push(issue);
  }

  for (const [kind, signals] of byKind.entries()) {
    if (signals.length <= 1) continue;
    failureReceipts.push({
      id: `duplicate-evidence:${kind}`,
      classification: 'DUPLICATE_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: kind,
      evidenceRef: signals.map((signal) => signal.evidenceRef).filter(Boolean).join(',') || null,
      reason: `${kind} has multiple competing evidence signals`,
    });
  }

  for (const kind of REQUIREMENTS[input.actionClass]) {
    if (byKind.has(kind)) continue;
    failureReceipts.push({
      id: `missing-evidence:${kind}`,
      classification: 'MISSING_EVIDENCE',
      status: 'BLOCKED',
      evidenceKind: kind,
      evidenceRef: null,
      reason: `${kind} evidence is required for ${input.actionClass}`,
    });
  }

  const verifiedKinds = currentVerifiedKinds(byKind, evaluatedAtMs);
  const canRecommend = hasAll(verifiedKinds, ['telemetry_integrity', 'calibration', 'model_domain']);
  const canSupervise = canRecommend && verifiedKinds.has('operator_approval');

  let shadowAuthority: WaterTruthShadowAuthority = 'OBSERVE';
  let shadowDisposition: WaterTruthShadowDisposition;
  if (input.actionClass === 'OBSERVATION') {
    shadowDisposition = verifiedKinds.has('telemetry_integrity') ? 'OBSERVE' : 'HOLD_FOR_EVIDENCE';
  } else if (input.actionClass === 'RECOMMENDATION') {
    shadowAuthority = canRecommend ? 'RECOMMEND' : 'OBSERVE';
    shadowDisposition = canRecommend ? 'RECOMMEND' : 'HOLD_FOR_EVIDENCE';
  } else if (input.actionClass === 'REVERSIBLE_OPERATIONAL_ADJUSTMENT') {
    shadowAuthority = canSupervise
      ? 'SUPERVISED_ACTION'
      : canRecommend
        ? 'RECOMMEND'
        : 'OBSERVE';
    shadowDisposition = canSupervise ? 'SUPERVISED_ACTION_ELIGIBLE' : 'HOLD_FOR_EVIDENCE';
  } else {
    shadowAuthority = 'OBSERVE';
    const claimReviewReady = hasAll(verifiedKinds, [
      'telemetry_integrity',
      'calibration',
      'independent_verification',
      'qualified_reviewer',
    ]);
    shadowDisposition = claimReviewReady
      ? 'HUMAN_VERIFICATION_REQUIRED'
      : 'HOLD_FOR_EVIDENCE';
  }

  const claimReviewReady = input.actionClass === 'POTABILITY_CLAIM'
    && hasAll(verifiedKinds, [
      'telemetry_integrity',
      'calibration',
      'independent_verification',
      'qualified_reviewer',
    ]);

  const normalizedEvidence = [...input.evidence]
    .map((signal) => ({ ...signal, evidenceRef: signal.evidenceRef.trim() }))
    .sort((left, right) => left.kind.localeCompare(right.kind));

  const evidenceFingerprint = sha256({
    contract: WATERTRUTH_SHADOW_CONTRACT,
    actionId: input.actionId,
    actionClass: input.actionClass,
    proposedAction: input.proposedAction,
    evaluatedAt: input.evaluatedAt,
    evidence: normalizedEvidence,
    failures: failureReceipts.map((failure) => ({
      id: failure.id,
      classification: failure.classification,
      status: failure.status,
      evidenceKind: failure.evidenceKind,
    })),
  });
  const predecessorFingerprint = normalizedMarker(input.priorEvidenceFingerprint);
  const predecessorProofCookie = normalizedMarker(input.priorProofCookie);
  const transition = predecessorFingerprint === null
    ? 'initial'
    : predecessorFingerprint === evidenceFingerprint
      ? 'confirmed'
      : 'changed';

  const continuity: WaterTruthContinuityReceipt = {
    predecessorFingerprint,
    predecessorProofCookie,
    evidenceFingerprint,
    proofCookie: proofCookieFor(evidenceFingerprint),
    transition,
    authorityEffect: 'none',
  };

  return {
    contract: WATERTRUTH_SHADOW_CONTRACT,
    actionId: input.actionId,
    actionClass: input.actionClass,
    proposedAction: input.proposedAction,
    evaluatedAt: input.evaluatedAt,
    evidenceDisposition: dispositionFor(failureReceipts),
    shadowAuthority,
    shadowDisposition,
    claimReviewReady,
    shadowOnly: true,
    mutationAllowed: false,
    liveWaterControlAllowed: false,
    physicalActuationAttempted: false,
    potabilityClaimAllowed: false,
    failureReceipts,
    continuity,
    fingerprint: sha256({
      evidenceFingerprint,
      shadowAuthority,
      shadowDisposition,
      claimReviewReady,
      failureReceipts,
    }),
  };
}

export const WATERTRUTH_SHADOW_CAPABILITY: Capability = {
  id: WATERTRUTH_SHADOW_CAPABILITY_ID,
  kind: 'Automation',
  category: 'integrations',
  score: 98,
  runtime: 'dynamic',
  summary: 'Evaluate water-system evidence in a software-only shadow lane before any recommendation, supervised action, or safety claim can advance.',
  purpose: 'Apply ULTRATHINK evidence-gated authority to simulated water operations: evidence freshness, calibration, model scope, independent verification, and human authority cap what the system may recommend while live water control and potability claims remain impossible in v1.',
  inputs: [
    ['actionId', 'string', 'Stable identity for the proposed shadow action'],
    ['actionClass', 'enum', 'OBSERVATION | RECOMMENDATION | REVERSIBLE_OPERATIONAL_ADJUSTMENT | POTABILITY_CLAIM'],
    ['proposedAction', 'text', 'Plain-language action evaluated in shadow only'],
    ['evaluatedAt', 'timestamp', 'Deterministic evaluation time used for evidence freshness'],
    ['evidence', 'WaterTruthEvidenceSignal[]', 'Typed evidence with state, provenance ref, observation time, and freshness window'],
    ['priorEvidenceFingerprint', 'fingerprint', 'Optional predecessor fingerprint used only for continuity classification'],
    ['priorProofCookie', 'non-secret marker', 'Optional predecessor proof cookie; never authority'],
  ],
  environment: [
    'FCR shared capability runtime remains the control plane',
    'Software-only shadow evaluation; no pump, valve, treatment controller, PLC, SCADA write, or other physical actuator connection',
    'No experimental-water consumption or potability claim is authorized by this capability',
  ],
  proof: [
    'Evidence freshness and state cap the maximum simulated authority',
    'Distinct missing, stale, degraded, unknown, contradicted, invalid, and duplicate evidence conditions retain separate failure receipts',
    'Continuity fingerprints and proof cookies classify initial, confirmed, or changed evidence without creating authority',
    'REVERSIBLE_OPERATIONAL_ADJUSTMENT can become only SUPERVISED_ACTION_ELIGIBLE in shadow; liveWaterControlAllowed remains false',
    'POTABILITY_CLAIM always requires qualified human verification and potabilityClaimAllowed remains false',
    'No provider write, physical actuation, or safety completion claim exists in the v1 runtime',
  ],
  risk: 'Shadow-only decision support. It cannot control water infrastructure, bypass qualified operators, certify water safety, authorize consumption, substitute for validated treatment or laboratory testing, or turn a proof cookie/fingerprint into authority. Any future physical integration requires a separate reviewed contract and real-world safety validation.',
  implementation: 'Runtime-backed: POST /capabilities/watertruth-evidence-gated-authority-shadow-v1/runs with a typed shadow action and evidence bundle. The synchronous receipt returns evidence disposition, maximum simulated authority, separate failure receipts, and continuity markers while mutationAllowed=false, liveWaterControlAllowed=false, and potabilityClaimAllowed=false.',
};