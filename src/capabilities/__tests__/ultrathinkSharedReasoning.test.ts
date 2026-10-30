import { describe, expect, it } from 'vitest';
import { SharedCapabilityRuntimeError } from '../sharedCapabilityRuntime.js';
import {
  resolveUltrathinkSharedReasoning,
  ULTRATHINK_SHARED_REASONING_CAPABILITY,
} from '../ultrathinkSharedReasoning.js';

const INTENT = '/ultrathink Decide the smallest safe architecture change.';

function resolve(
  surface: 'voice' | 'text',
  founder = { userId: 'founder-1', email: 'founder@example.com' },
  prior?: { fingerprint: string; proofCookie: string },
) {
  return resolveUltrathinkSharedReasoning({
    executionId: `ultrathink:${surface}`,
    surface,
    intent: INTENT,
    founder,
    priorEvidenceFingerprint: prior?.fingerprint,
    priorProofCookie: prior?.proofCookie,
  });
}

describe('ULTRATHINK shared reasoning resolution', () => {
  it('keeps the reviewed capability dynamic but strictly non-authorizing', () => {
    expect(ULTRATHINK_SHARED_REASONING_CAPABILITY).toMatchObject({
      id: 'ultrathink-shared-reasoning-v1',
      kind: 'Prompt',
      category: 'prompts',
      runtime: 'dynamic',
    });
    expect(ULTRATHINK_SHARED_REASONING_CAPABILITY.risk).toContain('does not invoke a model provider');
    expect(ULTRATHINK_SHARED_REASONING_CAPABILITY.risk).toContain('grant mutation authority');
  });

  it('confirms the same semantic reasoning state across text and voice without sharing request identity', () => {
    const text = resolve('text');
    const voice = resolve('voice', { userId: 'founder-1', email: 'founder@example.com' }, {
      fingerprint: text.receipt.continuity.evidenceFingerprint,
      proofCookie: text.receipt.continuity.proofCookie,
    });

    expect(text.receipt).toMatchObject({
      command: '/ultrathink',
      surface: 'text',
      state: 'RESOLVED',
      runtimeAuthority: {
        mode: 'read_only',
        consequence: 'READ',
        mutationAllowed: false,
        approvalRequired: false,
      },
      reasoning: {
        mode: 'reason_only',
        providerExecution: false,
        mutationAllowed: false,
        approvalRequired: false,
      },
      continuity: { transition: 'initial', authorityEffect: 'none' },
      completionClaim: { allowed: false, reason: 'reasoning_mode_resolved_not_executed' },
    });
    expect(voice.receipt.continuity.transition).toBe('confirmed');
    expect(voice.receipt.continuity.evidenceFingerprint).toBe(text.receipt.continuity.evidenceFingerprint);
    expect(voice.receipt.runtimeAuthority.authorityRevision).toBe(text.receipt.runtimeAuthority.authorityRevision);
    expect(voice.receipt.requestFingerprint).not.toBe(text.receipt.requestFingerprint);
    expect(voice.presentation.channel).toBe('speech_and_text');
    expect(text.presentation.channel).toBe('text');
  });

  it('invalidates continuity when the live founder authority subject changes', () => {
    const first = resolve('text');
    const changedFounder = resolve('voice', { userId: 'founder-2', email: 'other-founder@example.com' }, {
      fingerprint: first.receipt.continuity.evidenceFingerprint,
      proofCookie: first.receipt.continuity.proofCookie,
    });

    expect(changedFounder.receipt.runtimeAuthority.authorityRevision)
      .not.toBe(first.receipt.runtimeAuthority.authorityRevision);
    expect(changedFounder.receipt.continuity.evidenceFingerprint)
      .not.toBe(first.receipt.continuity.evidenceFingerprint);
    expect(changedFounder.receipt.continuity.transition).toBe('changed');
  });

  it('treats a mismatched predecessor proof cookie as changed continuity, never authority', () => {
    const first = resolve('text');
    const second = resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:cookie-mismatch',
      surface: 'voice',
      intent: INTENT,
      founder: { userId: 'founder-1', email: 'founder@example.com' },
      priorEvidenceFingerprint: first.receipt.continuity.evidenceFingerprint,
      priorProofCookie: 'ultrathink-reasoning:v1:not-the-current-cookie',
    });

    expect(second.receipt.continuity.transition).toBe('changed');
    expect(second.receipt.continuity.authorityEffect).toBe('none');
    expect(second.receipt.reasoning.mutationAllowed).toBe(false);
  });

  it('requires predecessor fingerprint and proof cookie together before continuity can be confirmed', () => {
    const first = resolve('text');
    const fingerprintOnly = resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:fingerprint-only',
      surface: 'voice',
      intent: INTENT,
      founder: { userId: 'founder-1', email: 'founder@example.com' },
      priorEvidenceFingerprint: first.receipt.continuity.evidenceFingerprint,
    });
    const cookieOnly = resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:cookie-only',
      surface: 'voice',
      intent: INTENT,
      founder: { userId: 'founder-1', email: 'founder@example.com' },
      priorProofCookie: first.receipt.continuity.proofCookie,
    });

    expect(fingerprintOnly.receipt.continuity.transition).toBe('changed');
    expect(cookieOnly.receipt.continuity.transition).toBe('changed');
    expect(fingerprintOnly.receipt.continuity.authorityEffect).toBe('none');
    expect(cookieOnly.receipt.continuity.authorityEffect).toBe('none');
  });

  it('rejects intents that do not actually invoke /ultrathink', () => {
    expect(() => resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:missing-command',
      surface: 'text',
      intent: 'Think deeply about this architecture.',
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    })).toThrow(SharedCapabilityRuntimeError);
  });

  it('rejects missing founder authority and unsupported surfaces through the common runtime', () => {
    expect(() => resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:no-founder',
      surface: 'text',
      intent: INTENT,
    })).toThrow(SharedCapabilityRuntimeError);

    expect(() => resolveUltrathinkSharedReasoning({
      executionId: 'ultrathink:bad-surface',
      surface: 'admin-root',
      intent: INTENT,
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    })).toThrow(SharedCapabilityRuntimeError);
  });
});
