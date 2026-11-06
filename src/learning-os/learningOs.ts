import { createHash } from 'node:crypto';
import {
  validateV10OutcomeObservation,
  type V10OutcomeObservation,
} from '../founder-os-lab/outcomeObservation.js';

/**
 * Independent Learning OS kernel: studies outcome receipts, never grants
 * FCR approval, execution, provider, merge, deployment, or spending authority.
 */
export const LEARNING_OS_CONTRACT = 'juss/learning-os/study@v1' as const;
export type LearningPhase =
  | 'observed' | 'interpreted' | 'learned' | 'retained'
  | 'applied' | 'improved' | 'challenged' | 'revised';

export interface LearningSource {
  project: string;
  headSha: string;
  executionReceiptId: string;
  capabilityPlanHash: string;
  result: 'succeeded' | 'failed';
  observedAt: string;
  evidenceRefs: string[];
  verifierId: string;
}

export interface LearningApplication {
  project: string;
  headSha: string;
  outcomeReceiptId: string;
}

export interface LearningMetric {
  name: string;
  before: number;
  after: number;
  unit: string;
  betterWhen: 'higher' | 'lower';
}

export interface LearningStep {
  phase: LearningPhase;
  recordedAt: string;
  statement: string;
  evidenceRefs: string[];
  falsifier?: string;
  retentionRef?: string;
  application?: LearningApplication;
  improvement?: LearningMetric;
}

export interface LearningEvent extends LearningStep {
  sequence: number;
  studyId: string;
  previousHash: string | null;
  eventHash: string;
}

export interface LearningStudy {
  contract: typeof LEARNING_OS_CONTRACT;
  id: string;
  source: LearningSource;
  events: LearningEvent[];
}

export type LearningRead = {
  phase: LearningPhase;
  learningDemonstrated: boolean;
  improvementObserved: boolean;
  authorityGranted: false;
  next: readonly LearningPhase[];
};

const SHA = /^[a-f0-9]{40}$/;
const RECEIPT = /^fcr-conveyor-receipt-v3:[a-f0-9]{64}$/;
const NEXT: Record<LearningPhase, readonly LearningPhase[]> = Object.freeze({
  observed: ['interpreted'],
  interpreted: ['learned', 'challenged'],
  learned: ['retained', 'challenged'],
  retained: ['applied', 'challenged'],
  applied: ['improved', 'revised', 'challenged'],
  improved: ['revised', 'challenged'],
  challenged: ['revised'],
  revised: ['retained', 'challenged'],
});
type StepVerifier = (context: Readonly<{
  source: LearningSource;
  previousPhase: LearningPhase | null;
  step: Readonly<LearningStep>;
}>) => boolean;

function required(value: unknown, field: string, limit = 500): string {
  if (typeof value !== 'string' || value.trim() !== value || !value || value.length > limit) {
    throw new Error('LEARNING_INVALID: ' + field);
  }
  return value;
}

function instant(value: unknown): string {
  const raw = required(value, 'recordedAt', 48);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || !/(Z|[+-]\d\d:\d\d)$/.test(raw)) {
    throw new Error('LEARNING_INVALID: timestamp must include timezone');
  }
  return new Date(parsed).toISOString();
}

function refs(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length || input.length > 20) {
    throw new Error('LEARNING_INVALID: evidenceRefs required');
  }
  const result = input.map((item) => required(item, 'evidenceRef', 500));
  if (new Set(result).size !== result.length) throw new Error('LEARNING_INVALID: duplicate evidenceRef');
  return result;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalStep(step: LearningStep): LearningStep {
  if (!Object.hasOwn(NEXT, step.phase)) throw new Error('LEARNING_INVALID: unknown phase');
  const phase = step.phase;
  const normalized: LearningStep = {
    phase,
    recordedAt: instant(step.recordedAt),
    statement: required(step.statement, 'statement', 1000),
    evidenceRefs: refs(step.evidenceRefs),
  };
  if (phase === 'interpreted' || phase === 'revised') {
    normalized.falsifier = required(step.falsifier, 'falsifier', 600);
  }
  if (phase === 'retained') {
    normalized.retentionRef = required(step.retentionRef, 'retentionRef', 500);
  }
  if (phase === 'applied') {
    if (!step.application || !SHA.test(step.application.headSha)) {
      throw new Error('LEARNING_INVALID: application head SHA required');
    }
    normalized.application = {
      project: required(step.application.project, 'application.project', 120),
      headSha: step.application.headSha,
      outcomeReceiptId: required(step.application.outcomeReceiptId, 'application.outcomeReceiptId', 128),
    };
    if (!RECEIPT.test(normalized.application.outcomeReceiptId)) {
      throw new Error('LEARNING_INVALID: application outcome receipt required');
    }
  }
  if (phase === 'improved') {
    const metric = step.improvement;
    if (!metric || !Number.isFinite(metric.before) || !Number.isFinite(metric.after)
      || !['higher', 'lower'].includes(metric.betterWhen)
      || !(metric.betterWhen === 'higher' ? metric.after > metric.before : metric.after < metric.before)) {
      throw new Error('LEARNING_INVALID: independent directional improvement metric required');
    }
    normalized.improvement = {
      name: required(metric.name, 'metric.name', 120),
      before: metric.before,
      after: metric.after,
      unit: required(metric.unit, 'metric.unit', 60),
      betterWhen: metric.betterWhen,
    };
  }
  const allowedKeys = new Set(Object.keys(normalized));
  for (const key of Object.keys(step)) {
    if (!allowedKeys.has(key)) throw new Error('LEARNING_INVALID: unrelated phase field ' + key);
  }
  return normalized;
}

/** Stable hash identity independent of JSON object key insertion order. */
function identity(event: Omit<LearningEvent, 'eventHash'>): object {
  return [
    event.studyId, event.sequence, event.previousHash,
    event.phase, event.recordedAt, event.statement, event.evidenceRefs,
    event.falsifier ?? null, event.retentionRef ?? null,
    event.application ? [event.application.project, event.application.headSha, event.application.outcomeReceiptId] : null,
    event.improvement ? [event.improvement.name, event.improvement.before, event.improvement.after, event.improvement.unit, event.improvement.betterWhen] : null,
  ];
}

function sourceDigest(source: LearningSource): string {
  return digest([
    source.project, source.headSha, source.executionReceiptId, source.capabilityPlanHash,
    source.result, source.observedAt, source.evidenceRefs, source.verifierId,
  ]);
}

function eventHash(event: Omit<LearningEvent, 'eventHash'>): string {
  return digest(identity(event));
}

export function readLearningStudy(study: LearningStudy): LearningRead {
  if (study?.contract !== LEARNING_OS_CONTRACT || !Array.isArray(study.events) || !study.events.length) {
    throw new Error('LEARNING_INVALID: missing study history');
  }
  if (!SHA.test(study.source.headSha) || !RECEIPT.test(study.source.executionReceiptId)
    || !/^[a-f0-9]{64}$/.test(study.source.capabilityPlanHash)
    || !['succeeded', 'failed'].includes(study.source.result)) {
    throw new Error('LEARNING_INVALID: source identity');
  }
  required(study.source.project, 'source.project', 120);
  required(study.source.verifierId, 'source.verifierId', 120);
  const sourceKeys = [
    'project', 'headSha', 'executionReceiptId', 'capabilityPlanHash',
    'result', 'observedAt', 'evidenceRefs', 'verifierId',
  ];
  if (Object.keys(study.source).length !== sourceKeys.length
    || sourceKeys.some((key) => !Object.hasOwn(study.source, key))) {
    throw new Error('LEARNING_INVALID: unexpected source fields');
  }
  if (instant(study.source.observedAt) !== study.source.observedAt) {
    throw new Error('LEARNING_INVALID: noncanonical source observation time');
  }
  refs(study.source.evidenceRefs);
  const expectedStudyId = sourceDigest(study.source);
  if (study.id !== expectedStudyId) throw new Error('LEARNING_INVALID: source evidence tampering');
  let previous: LearningEvent | null = null;
  let applied = false;
  let improved = false;
  for (const [index, event] of study.events.entries()) {
    const { sequence: _sequence, studyId: _studyId, previousHash: _previousHash, eventHash: _eventHash, ...rawStep } = event;
    const step = normalStep(rawStep);
    for (const key of Object.keys(step)) {
      if (JSON.stringify(step[key as keyof LearningStep]) !== JSON.stringify(event[key as keyof LearningEvent])) {
        throw new Error('LEARNING_INVALID: noncanonical step');
      }
    }
    if (Object.keys(event).length !== Object.keys(step).length + 4) {
      throw new Error('LEARNING_INVALID: unexpected event fields');
    }
    if (event.sequence !== index + 1 || event.studyId !== study.id
      || event.previousHash !== (previous?.eventHash ?? null)
      || event.eventHash !== eventHash(event)) {
      throw new Error('LEARNING_INVALID: broken history or tampering');
    }
    if (!previous && event.phase !== 'observed') throw new Error('LEARNING_INVALID: study must start observed');
    if (previous && (!NEXT[previous.phase].includes(event.phase)
      || Date.parse(event.recordedAt) <= Date.parse(previous.recordedAt))) {
      throw new Error('LEARNING_INVALID: illegal or out-of-order transition');
    }
    if (event.phase === 'challenged' || event.phase === 'revised') {
      // Prior reuses cannot prove a new version of a revised or disputed lesson.
      applied = false;
      improved = false;
    }
    if (event.phase === 'applied') {
      improved = false;
      if (event.application?.outcomeReceiptId === study.source.executionReceiptId) {
        throw new Error('LEARNING_INVALID: reuse needs an independent outcome receipt');
      }
      applied = true;
    }
    if (event.phase === 'improved') improved = true;
    previous = event;
  }
  const phase = previous!.phase;
  return {
    phase,
    learningDemonstrated: applied && phase !== 'challenged' && phase !== 'revised',
    improvementObserved: improved && phase !== 'challenged' && phase !== 'revised',
    authorityGranted: false,
    next: NEXT[phase],
  };
}

export function beginLearningStudy({
  project, headSha, outcome, statement, verifiedBy, verifyOutcome,
}: {
  project: string;
  headSha: string;
  outcome: V10OutcomeObservation;
  statement: string;
  verifiedBy: string;
  verifyOutcome: (outcome: V10OutcomeObservation, project: string, headSha: string) => boolean;
}): LearningStudy {
  required(project, 'project', 120);
  required(verifiedBy, 'verifiedBy', 120);
  if (!SHA.test(headSha)) throw new Error('LEARNING_INVALID: head SHA');
  const problems = validateV10OutcomeObservation(outcome);
  if (outcome?.contract !== 'juss-v10/outcome-observation@v1'
    || problems.length || outcome.verified !== true || typeof outcome.goalSucceeded !== 'boolean') {
    throw new Error('LEARNING_DENIED: verified success or failure outcome required');
  }
  if (typeof verifyOutcome !== 'function' || verifyOutcome(outcome, project, headSha) !== true) {
    throw new Error('LEARNING_DENIED: independent earned-outcome verification required');
  }
  const source: LearningSource = {
    project, headSha,
    executionReceiptId: outcome.executionReceiptId,
    capabilityPlanHash: outcome.capabilityPlanHash,
    result: outcome.goalSucceeded ? 'succeeded' : 'failed',
    observedAt: instant(outcome.observedAt),
    evidenceRefs: refs(outcome.evidenceUrls),
    verifierId: verifiedBy,
  };
  const id = sourceDigest(source);
  const step = normalStep({
    phase: 'observed', recordedAt: source.observedAt,
    statement, evidenceRefs: source.evidenceRefs,
  });
  const body = { ...step, sequence: 1, studyId: id, previousHash: null };
  return {
    contract: LEARNING_OS_CONTRACT, id, source,
    events: [{ ...body, eventHash: eventHash(body) }],
  };
}

export function advanceLearningStudy(
  study: LearningStudy,
  step: LearningStep,
  verifyStep: StepVerifier,
): LearningStudy {
  const current = readLearningStudy(study);
  if (!current.next.includes(step.phase)) throw new Error('LEARNING_DENIED: illegal transition');
  const previous = study.events.at(-1)!;
  const normalized = normalStep(step);
  if (Date.parse(normalized.recordedAt) <= Date.parse(previous.recordedAt)) {
    throw new Error('LEARNING_DENIED: stale step');
  }
  if (normalized.phase === 'applied'
    && normalized.application?.outcomeReceiptId === study.source.executionReceiptId) {
    throw new Error('LEARNING_DENIED: same execution is not reuse');
  }
  // Only server-side project-scoped verifiers may promote interpretation,
  // retention, application or improvement. Model text cannot serve as proof.
  if (typeof verifyStep !== 'function'
    || verifyStep(Object.freeze({ source: study.source, previousPhase: current.phase, step: normalized })) !== true) {
    throw new Error('LEARNING_DENIED: independent phase verification required');
  }
  const body = {
    ...normalized,
    sequence: study.events.length + 1,
    studyId: study.id,
    previousHash: previous.eventHash,
  };
  const successor: LearningStudy = {
    ...study,
    events: [...study.events, { ...body, eventHash: eventHash(body) }],
  };
  readLearningStudy(successor);
  return successor;
}
