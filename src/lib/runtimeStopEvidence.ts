import { createHash } from 'node:crypto';

export const RUNTIME_BOUNDARIES = [
  'CLIENT',
  'EDGE',
  'APPLICATION',
  'PROVIDER_API',
  'MODEL',
  'TOOL',
  'POST_PROCESSING',
] as const;

export type RuntimeBoundary = (typeof RUNTIME_BOUNDARIES)[number];
export type RuntimeEvidenceState = 'VERIFIED' | 'UNKNOWN';
export type RuntimeForwardState = 'VERIFIED' | 'FAILED' | 'UNKNOWN';
export type RuntimeStopSignal =
  | 'SERVICE_ERROR'
  | 'MODEL_COMPLETION_REFUSAL'
  | 'MONITOR_STOP'
  | 'TOOL_ERROR'
  | 'OTHER';
export type RuntimeResponseSource = 'SERVICE' | 'MODEL' | 'MONITOR' | 'TOOL' | 'UNKNOWN';
export type RuntimeModelExecution = 'VERIFIED' | 'NOT_REACHED' | 'UNKNOWN';
export type RuntimeStopClassification =
  | 'POSSIBLE_SYSTEM_REFUSAL'
  | 'MODEL_REFUSAL'
  | 'MONITORED_STOP_AFTER_ACTION'
  | 'MONITORED_STOP_BEFORE_ACTION'
  | 'TOOL_STOP'
  | 'OTHER_STOP'
  | 'UNKNOWN';
export type RuntimeAuthorizationState = 'AUTHORIZED' | 'UNAUTHORIZED' | 'UNKNOWN' | 'NOT_EVALUATED';

export interface RuntimeBoundaryEvidence {
  boundary: RuntimeBoundary;
  received: RuntimeEvidenceState;
  forwarded: RuntimeForwardState;
  evidenceRefs: string[];
}

export interface RuntimeToolRecord {
  tool: string;
  ran: boolean;
  changed: boolean;
  changeRefs: string[];
  rollbackRefs?: string[];
  status: 'SUCCEEDED' | 'FAILED' | 'STOPPED' | 'UNKNOWN';
}

export interface RuntimeStopObservationV1 {
  schema: 'juss/runtime-stop-evidence@v1';
  exactRequest: string;
  selectedModel: string | null;
  productSurface: string;
  organizationRef: string | null;
  userRef: string | null;
  intendedDefensiveOutcome: string;
  exactResponse: string;
  httpStatus: number | null;
  requestIds: string[];
  startedAt: string;
  observedAt: string;
  signal: RuntimeStopSignal;
  responseSource: RuntimeResponseSource;
  modelExecution: RuntimeModelExecution;
  boundaries: RuntimeBoundaryEvidence[];
  tools: RuntimeToolRecord[];
  completedWork: string[];
  incompleteWork: string[];
  authorization: {
    state: RuntimeAuthorizationState;
    evidenceRefs: string[];
  };
}

export interface RuntimeStopDiagnosis {
  schema: 'juss/runtime-stop-diagnosis@v1';
  classification: RuntimeStopClassification;
  lastVerifiedBoundary: RuntimeBoundary | null;
  nextBoundary: RuntimeBoundary | null;
  stoppedAt: RuntimeBoundary | 'UNKNOWN';
  firstUnprovenTransition: string | null;
  requestDigest: string;
  responseDigest: string;
  requestIds: string[];
  toolEffects: {
    toolsRan: string[];
    changed: boolean;
    changeRefs: string[];
    rollbackProven: boolean;
  };
  work: {
    completed: string[];
    incomplete: string[];
    complete: boolean;
  };
  responsePolicy: {
    autoResubmitAllowed: false;
    requiresOperatorReview: boolean;
    preserveRawEvidence: true;
  };
  authorization: RuntimeStopObservationV1['authorization'];
  invariants: {
    refusalDoesNotDefineAuthorization: true;
    stopDoesNotUndoSideEffects: true;
    observedSignalDoesNotProveProducerWithoutBoundaryEvidence: true;
  };
}

export interface RuntimeStopRedactedReviewRecord {
  schema: 'juss/runtime-stop-review@v1';
  classification: RuntimeStopClassification;
  productSurface: string;
  selectedModel: string | null;
  organizationFingerprint: string | null;
  userFingerprint: string | null;
  intendedOutcomeFingerprint: string;
  safeOutcomeSummary?: string;
  requestDigest: string;
  responseDigest: string;
  httpStatus: number | null;
  requestIds: string[];
  startedAt: string;
  observedAt: string;
  lastVerifiedBoundary: RuntimeBoundary | null;
  nextBoundary: RuntimeBoundary | null;
  stoppedAt: RuntimeBoundary | 'UNKNOWN';
  toolEffects: RuntimeStopDiagnosis['toolEffects'];
  work: RuntimeStopDiagnosis['work'];
  authorization: RuntimeStopObservationV1['authorization'];
  rawRequestIncluded: false;
  rawResponseIncluded: false;
  credentialsIncluded: false;
}

const ABSOLUTE_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/i;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fingerprint(value: string | null): string | null {
  return value ? sha256(value) : null;
}

function cleanRefs(refs: string[]): string[] {
  return [...new Set(refs.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))].sort();
}

function validateObservation(observation: RuntimeStopObservationV1): void {
  if (observation.schema !== 'juss/runtime-stop-evidence@v1') {
    throw new Error('runtime stop evidence schema mismatch');
  }
  if (!observation.exactRequest || !observation.exactResponse) {
    throw new Error('exact request and exact observed response are required');
  }
  if (!observation.productSurface.trim() || !observation.intendedDefensiveOutcome.trim()) {
    throw new Error('product surface and intended defensive outcome are required');
  }
  for (const value of [observation.startedAt, observation.observedAt]) {
    if (!ABSOLUTE_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
      throw new Error('runtime stop timestamps must be absolute timestamps');
    }
  }
  if (Date.parse(observation.observedAt) < Date.parse(observation.startedAt)) {
    throw new Error('observedAt precedes startedAt');
  }
  const seen = new Set<RuntimeBoundary>();
  let previousIndex = -1;
  for (const item of observation.boundaries) {
    const index = RUNTIME_BOUNDARIES.indexOf(item.boundary);
    if (index < 0 || seen.has(item.boundary) || index <= previousIndex) {
      throw new Error('runtime boundaries must be unique and ordered');
    }
    seen.add(item.boundary);
    previousIndex = index;
  }
}

function diagnoseBoundary(boundaries: RuntimeBoundaryEvidence[]): Pick<RuntimeStopDiagnosis, 'lastVerifiedBoundary' | 'nextBoundary' | 'stoppedAt' | 'firstUnprovenTransition'> {
  let lastVerifiedBoundary: RuntimeBoundary | null = null;
  let nextBoundary: RuntimeBoundary | null = null;
  let stoppedAt: RuntimeBoundary | 'UNKNOWN' = 'UNKNOWN';
  let firstUnprovenTransition: string | null = null;

  for (let index = 0; index < boundaries.length; index += 1) {
    const current = boundaries[index]!;
    const following = boundaries[index + 1]?.boundary ?? null;
    if (current.received !== 'VERIFIED') {
      nextBoundary = current.boundary;
      firstUnprovenTransition = lastVerifiedBoundary
        ? `${lastVerifiedBoundary}->${current.boundary}`
        : `UNKNOWN->${current.boundary}`;
      break;
    }

    lastVerifiedBoundary = current.boundary;
    if (current.forwarded === 'FAILED') {
      stoppedAt = current.boundary;
      nextBoundary = following;
      firstUnprovenTransition = following ? `${current.boundary}->${following}` : null;
      break;
    }
    if (current.forwarded === 'UNKNOWN') {
      nextBoundary = following;
      firstUnprovenTransition = following ? `${current.boundary}->${following}` : null;
      break;
    }
  }

  return { lastVerifiedBoundary, nextBoundary, stoppedAt, firstUnprovenTransition };
}

function classify(observation: RuntimeStopObservationV1): RuntimeStopClassification {
  const changed = observation.tools.some((tool) => tool.ran && tool.changed);
  if (observation.signal === 'MONITOR_STOP') {
    return changed ? 'MONITORED_STOP_AFTER_ACTION' : 'MONITORED_STOP_BEFORE_ACTION';
  }
  if (
    observation.signal === 'MODEL_COMPLETION_REFUSAL'
    && observation.responseSource === 'MODEL'
    && observation.modelExecution === 'VERIFIED'
  ) {
    return 'MODEL_REFUSAL';
  }
  if (observation.signal === 'SERVICE_ERROR' && observation.modelExecution !== 'VERIFIED') {
    return 'POSSIBLE_SYSTEM_REFUSAL';
  }
  if (observation.signal === 'TOOL_ERROR' || observation.responseSource === 'TOOL') {
    return 'TOOL_STOP';
  }
  if (observation.signal === 'OTHER') return 'OTHER_STOP';
  return 'UNKNOWN';
}

export function diagnoseRuntimeStop(observation: RuntimeStopObservationV1): RuntimeStopDiagnosis {
  validateObservation(observation);
  const boundary = diagnoseBoundary(observation.boundaries);
  const ranTools = observation.tools.filter((tool) => tool.ran);
  const changedTools = ranTools.filter((tool) => tool.changed);
  const changeRefs = cleanRefs(changedTools.flatMap((tool) => tool.changeRefs));
  const rollbackRefs = cleanRefs(changedTools.flatMap((tool) => tool.rollbackRefs ?? []));
  const rollbackProven = changedTools.length === 0 || changedTools.every((tool) => (tool.rollbackRefs?.length ?? 0) > 0);

  return {
    schema: 'juss/runtime-stop-diagnosis@v1',
    classification: classify(observation),
    ...boundary,
    requestDigest: sha256(observation.exactRequest),
    responseDigest: sha256(observation.exactResponse),
    requestIds: cleanRefs(observation.requestIds),
    toolEffects: {
      toolsRan: ranTools.map((tool) => tool.tool),
      changed: changedTools.length > 0,
      changeRefs,
      rollbackProven,
    },
    work: {
      completed: [...observation.completedWork],
      incomplete: [...observation.incompleteWork],
      complete: observation.incompleteWork.length === 0,
    },
    responsePolicy: {
      autoResubmitAllowed: false,
      requiresOperatorReview: changedTools.length > 0 || observation.signal === 'MONITOR_STOP',
      preserveRawEvidence: true,
    },
    authorization: {
      state: observation.authorization.state,
      evidenceRefs: cleanRefs(observation.authorization.evidenceRefs),
    },
    invariants: {
      refusalDoesNotDefineAuthorization: true,
      stopDoesNotUndoSideEffects: true,
      observedSignalDoesNotProveProducerWithoutBoundaryEvidence: true,
    },
  };
}

export function redactRuntimeStopForReview(
  observation: RuntimeStopObservationV1,
  safeOutcomeSummary?: string,
): RuntimeStopRedactedReviewRecord {
  const diagnosis = diagnoseRuntimeStop(observation);
  return {
    schema: 'juss/runtime-stop-review@v1',
    classification: diagnosis.classification,
    productSurface: observation.productSurface,
    selectedModel: observation.selectedModel,
    organizationFingerprint: fingerprint(observation.organizationRef),
    userFingerprint: fingerprint(observation.userRef),
    intendedOutcomeFingerprint: sha256(observation.intendedDefensiveOutcome),
    ...(safeOutcomeSummary?.trim() ? { safeOutcomeSummary: safeOutcomeSummary.trim() } : {}),
    requestDigest: diagnosis.requestDigest,
    responseDigest: diagnosis.responseDigest,
    httpStatus: observation.httpStatus,
    requestIds: diagnosis.requestIds,
    startedAt: observation.startedAt,
    observedAt: observation.observedAt,
    lastVerifiedBoundary: diagnosis.lastVerifiedBoundary,
    nextBoundary: diagnosis.nextBoundary,
    stoppedAt: diagnosis.stoppedAt,
    toolEffects: diagnosis.toolEffects,
    work: diagnosis.work,
    authorization: diagnosis.authorization,
    rawRequestIncluded: false,
    rawResponseIncluded: false,
    credentialsIncluded: false,
  };
}
