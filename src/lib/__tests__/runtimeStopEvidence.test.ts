import { describe, expect, it } from 'vitest';
import {
  diagnoseRuntimeStop,
  redactRuntimeStopForReview,
  type RuntimeStopObservationV1,
} from '../runtimeStopEvidence.js';

function base(overrides: Partial<RuntimeStopObservationV1> = {}): RuntimeStopObservationV1 {
  return {
    schema: 'juss/runtime-stop-evidence@v1',
    exactRequest: '{"task":"validate owned staging system"}',
    selectedModel: 'astra-api',
    productSurface: 'supported-api-app',
    organizationRef: 'org-123',
    userRef: 'user-456',
    intendedDefensiveOutcome: 'Validate and remediate an owned staging system.',
    exactResponse: '{"error":"request stopped"}',
    httpStatus: 400,
    requestIds: ['req_123'],
    startedAt: '2026-10-03T18:40:00.000Z',
    observedAt: '2026-10-03T18:40:01.000Z',
    signal: 'SERVICE_ERROR',
    responseSource: 'SERVICE',
    modelExecution: 'UNKNOWN',
    boundaries: [
      { boundary: 'CLIENT', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['client:req'] },
      { boundary: 'EDGE', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['edge:trace'] },
      { boundary: 'APPLICATION', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['app:req'] },
      { boundary: 'PROVIDER_API', received: 'VERIFIED', forwarded: 'UNKNOWN', evidenceRefs: ['provider:req_123'] },
      { boundary: 'MODEL', received: 'UNKNOWN', forwarded: 'UNKNOWN', evidenceRefs: [] },
    ],
    tools: [],
    completedWork: [],
    incompleteWork: ['security review'],
    authorization: { state: 'UNKNOWN', evidenceRefs: [] },
    ...overrides,
  };
}

describe('runtime stop evidence', () => {
  it('Example A: treats an upstream service error as a possible system-refusal path without inventing model attribution or authority', () => {
    const diagnosis = diagnoseRuntimeStop(base());
    expect(diagnosis.classification).toBe('POSSIBLE_SYSTEM_REFUSAL');
    expect(diagnosis.lastVerifiedBoundary).toBe('PROVIDER_API');
    expect(diagnosis.nextBoundary).toBe('MODEL');
    expect(diagnosis.stoppedAt).toBe('UNKNOWN');
    expect(diagnosis.authorization.state).toBe('UNKNOWN');
    expect(diagnosis.invariants.refusalDoesNotDefineAuthorization).toBe(true);
  });

  it('Example B: calls a refusal a model refusal only when model execution and model response source are both proven', () => {
    const diagnosis = diagnoseRuntimeStop(base({
      exactResponse: '{"completion":"I cannot execute that exploit; use defensive validation instead."}',
      httpStatus: 200,
      signal: 'MODEL_COMPLETION_REFUSAL',
      responseSource: 'MODEL',
      modelExecution: 'VERIFIED',
      boundaries: [
        { boundary: 'CLIENT', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['client:req'] },
        { boundary: 'PROVIDER_API', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['provider:req_123'] },
        { boundary: 'MODEL', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['model:completion'] },
        { boundary: 'POST_PROCESSING', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['response:delivered'] },
      ],
      authorization: { state: 'AUTHORIZED', evidenceRefs: ['authority:separate-approval'] },
    }));

    expect(diagnosis.classification).toBe('MODEL_REFUSAL');
    expect(diagnosis.lastVerifiedBoundary).toBe('POST_PROCESSING');
    expect(diagnosis.stoppedAt).toBe('MODEL');
    expect(diagnosis.authorization.state).toBe('AUTHORIZED');
  });

  it('does not promote refusal-looking text to model refusal without model evidence', () => {
    const diagnosis = diagnoseRuntimeStop(base({
      exactResponse: 'I cannot assist with that request.',
      signal: 'MODEL_COMPLETION_REFUSAL',
      responseSource: 'UNKNOWN',
      modelExecution: 'UNKNOWN',
    }));
    expect(diagnosis.classification).toBe('UNKNOWN');
  });

  it('Example C: preserves a monitored stop after a tool write, keeps work incomplete, and forbids automatic resubmission', () => {
    const diagnosis = diagnoseRuntimeStop(base({
      signal: 'MONITOR_STOP',
      responseSource: 'MONITOR',
      modelExecution: 'VERIFIED',
      exactResponse: '{"error":"misalignment_monitor_stop"}',
      tools: [{
        tool: 'write_file',
        ran: true,
        changed: true,
        changeRefs: ['file:src/review.txt@after'],
        status: 'STOPPED',
      }],
      completedWork: ['initial scan', 'file write'],
      incompleteWork: ['review remaining changes', 'operator reconciliation'],
      boundaries: [
        { boundary: 'CLIENT', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['client:req'] },
        { boundary: 'MODEL', received: 'VERIFIED', forwarded: 'VERIFIED', evidenceRefs: ['model:tool-call'] },
        { boundary: 'TOOL', received: 'VERIFIED', forwarded: 'FAILED', evidenceRefs: ['tool:write-file'] },
      ],
      authorization: { state: 'AUTHORIZED', evidenceRefs: ['authority:review-scope'] },
    }));

    expect(diagnosis.classification).toBe('MONITORED_STOP_AFTER_ACTION');
    expect(diagnosis.stoppedAt).toBe('TOOL');
    expect(diagnosis.toolEffects.changed).toBe(true);
    expect(diagnosis.toolEffects.rollbackProven).toBe(false);
    expect(diagnosis.work.complete).toBe(false);
    expect(diagnosis.responsePolicy.autoResubmitAllowed).toBe(false);
    expect(diagnosis.responsePolicy.requiresOperatorReview).toBe(true);
  });

  it('keeps authorization independent from identical refusal behavior', () => {
    const unknown = diagnoseRuntimeStop(base({ authorization: { state: 'UNKNOWN', evidenceRefs: [] } }));
    const denied = diagnoseRuntimeStop(base({ authorization: { state: 'UNAUTHORIZED', evidenceRefs: ['auth:deny'] } }));
    expect(unknown.classification).toBe(denied.classification);
    expect(unknown.authorization.state).toBe('UNKNOWN');
    expect(denied.authorization.state).toBe('UNAUTHORIZED');
  });

  it('creates a redacted review record without raw request, raw response, organization, or user identifiers', () => {
    const review = redactRuntimeStopForReview(base(), 'Owned staging defensive validation stopped upstream.');
    const serialized = JSON.stringify(review);
    expect(review.rawRequestIncluded).toBe(false);
    expect(review.rawResponseIncluded).toBe(false);
    expect(review.credentialsIncluded).toBe(false);
    expect(review.organizationFingerprint).toMatch(/^sha256:/);
    expect(review.userFingerprint).toMatch(/^sha256:/);
    expect(serialized).not.toContain('org-123');
    expect(serialized).not.toContain('user-456');
    expect(serialized).not.toContain('validate owned staging system');
  });
});
