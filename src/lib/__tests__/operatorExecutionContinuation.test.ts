import { describe, expect, it } from 'vitest';
import {
  createOperatorContinuityReceiptV2,
  createOperatorExecutionContinuation,
  evaluateOperatorExecutionContinuation,
  operatorExecutionContinuationFingerprint,
  validateOperatorExecutionContinuation,
  type OperatorContinuityInputV2,
  type OperatorExecutionContinuationInput,
} from '../operatorContinuity.js';

const NOW = '2026-11-13T19:10:00.000Z';
const observation: OperatorContinuityInputV2 = {
  source: 'chatgpt',
  projectSlug: 'founder-control-room',
  repositoryFullName: 'jussray/founder-control-room',
  targetBranch: 'main',
  targetSha: 'a'.repeat(40),
  prNumber: null,
  baseSha: null,
  headSha: null,
  scopeFingerprint: '1'.repeat(64),
  proofFingerprint: '2'.repeat(64),
  reviewFingerprint: '3'.repeat(64),
  providerFingerprint: '4'.repeat(64),
  runtimeFingerprint: '5'.repeat(64),
  authorityFingerprint: '6'.repeat(64),
  evidenceRefs: ['github:main-readback'],
  observedAt: '2026-11-13T19:00:00.000Z',
  expiresAt: '2026-11-13T19:30:00.000Z',
  predecessorFingerprint: null,
};
const input: OperatorExecutionContinuationInput = {
  sourceMode: 'chat',
  taskId: 'task-12',
  intentRef: 'fcr:intents/task-12',
  contextRefs: ['fcr:history/task-12', 'fcr:artifacts/task-12'],
  completedSteps: [{ stepId: 'inspect', evidenceRefs: ['github:main-readback'] }],
  remainingStepIds: ['patch', 'verify'],
  nextActionRef: 'fcr:actions/patch',
  pendingDecisionRefs: ['fcr:approvals/next-release'],
  observation: createOperatorContinuityReceiptV2(observation),
};

describe('cross-mode operator execution continuation', () => {
  it('preserves task, context, done steps, pending decisions, and next action', () => {
    const packet = createOperatorExecutionContinuation(input);
    const resumed = evaluateOperatorExecutionContinuation(packet, {
      ...observation,
      source: 'work',
      evidenceRefs: ['github:rechecked-current-head'],
      observedAt: '2026-11-13T19:09:00.000Z',
    }, NOW, 'work');

    expect(packet).toMatchObject({
      taskId: 'task-12',
      intentRef: 'fcr:intents/task-12',
      contextRefs: ['fcr:artifacts/task-12', 'fcr:history/task-12'],
      completedSteps: [{ stepId: 'inspect', evidenceRefs: ['github:main-readback'] }],
      remainingStepIds: ['patch', 'verify'],
      nextActionRef: 'fcr:actions/patch',
      pendingDecisionRefs: ['fcr:approvals/next-release'],
      authorizing: false,
      approvalCarryForward: false,
      browserCookie: false,
    });
    expect(resumed).toEqual({
      state: 'CURRENT',
      targetMode: 'work',
      conversationMayResume: true,
      toolAccessPolicy: 'current_surface_available_tools',
      executionAuthorityFromHandoff: false,
      evidenceReacquisitionRequired: false,
      reasons: [],
    });
  });

  it('retains the same task identity when switching back to Chat with current evidence', () => {
    const packet = createOperatorExecutionContinuation(input);
    const workPacket = createOperatorExecutionContinuation({
      ...input,
      sourceMode: 'work',
      observation: createOperatorContinuityReceiptV2({
        ...observation,
        source: 'work',
        evidenceRefs: ['github:work-readback'],
        observedAt: '2026-11-13T19:05:00.000Z',
      }),
    });
    expect(workPacket.fingerprint).toBe(packet.fingerprint);
    expect(operatorExecutionContinuationFingerprint(workPacket)).toBe(packet.fingerprint);
    expect(evaluateOperatorExecutionContinuation(workPacket, observation, NOW, 'chat')).toMatchObject({
      state: 'CURRENT',
      conversationMayResume: true,
      toolAccessPolicy: 'current_surface_available_tools',
      executionAuthorityFromHandoff: false,
    });
  });

  it('continues conversation but requires fresh evidence when the Git head changes', () => {
    const packet = createOperatorExecutionContinuation(input);
    expect(evaluateOperatorExecutionContinuation(packet, {
      ...observation,
      targetSha: 'b'.repeat(40),
      source: 'work',
    }, NOW, 'chat')).toEqual({
      state: 'REVALIDATE',
      targetMode: 'chat',
      conversationMayResume: true,
      toolAccessPolicy: 'current_surface_available_tools',
      executionAuthorityFromHandoff: false,
      evidenceReacquisitionRequired: true,
      reasons: ['target_sha_moved'],
    });
  });

  it('does not treat a stale lease or missing proof as current execution authority', () => {
    const packet = createOperatorExecutionContinuation(input);
    const expired = evaluateOperatorExecutionContinuation(
      packet, observation, '2026-11-13T19:31:00.000Z', 'chat',
    );
    expect(expired.state).toBe('REVALIDATE');
    expect(expired.reasons).toContain('receipt_expired');
    expect(expired.executionAuthorityFromHandoff).toBe(false);
  });

  it('rejects tampered task state or forged authority instead of silently resuming', () => {
    const packet = createOperatorExecutionContinuation(input);
    const changed = { ...packet, nextActionRef: 'fcr:actions/unreviewed-merge' };
    expect(validateOperatorExecutionContinuation(changed)).toContain(
      'execution continuation fingerprint does not match its state',
    );
    expect(evaluateOperatorExecutionContinuation(changed, observation, NOW, 'chat')).toMatchObject({
      state: 'INVALID',
      conversationMayResume: false,
      executionAuthorityFromHandoff: false,
    });
    expect(validateOperatorExecutionContinuation({ ...packet, authorizing: true } as unknown as typeof packet))
      .toContain('execution continuation cannot become an authorization, approval, or browser cookie');
  });

  it('requires pointers rather than raw transcripts, and real evidence for completed steps', () => {
    expect(() => createOperatorExecutionContinuation({ ...input, contextRefs: ['raw conversation text'] }))
      .toThrow(/source reference, not raw conversation content/);
    expect(() => createOperatorExecutionContinuation({
      ...input, completedSteps: [{ stepId: 'inspect', evidenceRefs: [] }],
    })).toThrow(/requires a source reference/);
    expect(() => createOperatorExecutionContinuation({
      ...input, remainingStepIds: ['inspect'],
    })).toThrow(/completed step cannot also be remaining/);
  });
});
