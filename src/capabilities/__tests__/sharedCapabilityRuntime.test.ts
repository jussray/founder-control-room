import { describe, expect, it } from 'vitest';
import {
  executeSharedReadOnlyToolCall,
  finalizeSharedReadOnlyCapabilityRun,
  sharedReadOnlyToolFailure,
  prepareSharedReadOnlyCapabilityRun,
  SharedCapabilityRuntimeError,
  type SharedReadOnlyObservation,
} from '../sharedCapabilityRuntime.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function prepared(surface: 'voice' | 'text' = 'text') {
  return prepareSharedReadOnlyCapabilityRun({
    executionId: 'public-web-observation:test',
    capabilityId: 'public-web-observation-v1',
    surface,
    intent: 'Observe public evidence without mutation.',
    founder: { userId: 'founder-1', email: 'founder@example.com' },
  });
}

function observation(): SharedReadOnlyObservation {
  return {
    provider: 'fcr-research-hub',
    providerAccepted: true,
    truthState: 'provider_observed_unverified',
    requestFingerprint: HASH_A,
    resultCount: 2,
    continuity: {
      evidenceFingerprint: HASH_B,
      proofCookie: 'fcr-public-web:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      transition: 'initial',
      authorityEffect: 'none',
    },
  };
}

describe('shared read-only capability runtime', () => {
  it('derives read-only authority from the server-authenticated founder without exposing identity', () => {
    const run = prepared('voice');

    expect(run.surface).toBe('voice');
    expect(run.authority).toMatchObject({
      mode: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      approvalRequired: false,
    });
    expect(run.authority.founderSubjectFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(run.authority.authorityRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(run.intentFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(run)).not.toContain('founder@example.com');
    expect(JSON.stringify(run)).not.toContain('founder-1');
  });

  it('rejects unknown surfaces and missing live founder authority before execution', () => {
    expect(() => prepareSharedReadOnlyCapabilityRun({
      executionId: 'run:1',
      capabilityId: 'public-web-observation-v1',
      surface: 'root-admin',
      intent: 'Observe evidence.',
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    })).toThrow(SharedCapabilityRuntimeError);

    expect(() => prepareSharedReadOnlyCapabilityRun({
      executionId: 'run:2',
      capabilityId: 'public-web-observation-v1',
      surface: 'text',
      intent: 'Observe evidence.',
    })).toThrow(SharedCapabilityRuntimeError);
  });

  it('keeps voice and text on the same authority revision for the same founder and capability', () => {
    const voice = prepared('voice');
    const text = prepared('text');

    expect(voice.authority.authorityRevision).toBe(text.authority.authorityRevision);
    expect(voice.intentFingerprint).toBe(text.intentFingerprint);
    expect(voice.authority.mode).toBe('read_only');
    expect(text.authority.mode).toBe('read_only');
  });

  it('emits modality-specific presentation only after a bounded provider observation', () => {
    const voice = finalizeSharedReadOnlyCapabilityRun(prepared('voice'), observation());
    const text = finalizeSharedReadOnlyCapabilityRun(prepared('text'), observation());

    expect(voice.receipt).toMatchObject({
      contract: 'fcr/shared-capability-runtime-receipt@v1',
      state: 'PROVIDER_ACCEPTED',
      surface: 'voice',
      provider: { name: 'fcr-research-hub', accepted: true },
      evidence: {
        truthState: 'provider_observed_unverified',
        evidenceFingerprint: HASH_B,
        authorityEffect: 'none',
      },
      completionClaim: {
        allowed: false,
        reason: 'provider_observation_unverified',
      },
    });
    expect(voice.presentation.channel).toBe('speech_and_text');
    expect(text.presentation.channel).toBe('text');
    expect(voice.presentation.dataRef).toBe('run.observation.data');
  });

  it('fails closed on malformed provider fingerprints instead of minting a shared receipt', () => {
    const malformed = observation();
    malformed.requestFingerprint = 'not-a-fingerprint';

    expect(() => finalizeSharedReadOnlyCapabilityRun(prepared(), malformed))
      .toThrow('Provider observation is missing required bounded read-only receipt evidence.');
  });

  it('rejects any provider evidence that attempts to change authority', () => {
    const escalated = observation() as unknown as {
      continuity: {
        evidenceFingerprint: string;
        proofCookie: string;
        transition: string;
        authorityEffect: string;
      };
    };
    escalated.continuity.authorityEffect = 'grant_write';

    expect(() => finalizeSharedReadOnlyCapabilityRun(
      prepared(),
      escalated as unknown as SharedReadOnlyObservation,
    )).toThrow('Read-only provider evidence cannot change shared runtime authority.');
  });
});


describe('voice tool handoff evidence', () => {
  it('actually invokes the provider once after live founder identity validation', async () => {
    let invoked = 0;
    const result = await executeSharedReadOnlyToolCall({
      executionId: 'voice:read:1',
      capabilityId: 'public-web-observation-v1',
      surface: 'voice',
      intent: 'Look for the requested updates.',
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    }, async () => {
      invoked += 1;
      return observation();
    });

    expect(invoked).toBe(1);
    expect(result.execution).toMatchObject({
      contract: 'fcr/shared-tool-call-attempt@v1',
      executionId: 'voice:read:1',
      surface: 'voice',
      providerCallReturned: true,
      state: 'PROVIDER_ACCEPTED',
      verifiedOutcome: false,
      evidenceFingerprint: HASH_B,
    });
    expect(result.receipt.completionClaim.allowed).toBe(false);
    expect(result.presentation.channel).toBe('speech_and_text');
    expect(result.observation.provider).toBe('fcr-research-hub');
  });

  it('never starts a provider action without current authenticated founder identity', async () => {
    let invoked = 0;
    await expect(executeSharedReadOnlyToolCall({
      executionId: 'voice:no-authority',
      capabilityId: 'public-web-observation-v1',
      surface: 'voice',
      intent: 'Check the inbox.',
    }, async () => {
      invoked += 1;
      return observation();
    })).rejects.toThrow('server-authenticated founder identity');
    expect(invoked).toBe(0);
  });

  it('does not manufacture a success receipt when the provider fails', async () => {
    let invoked = 0;
    await expect(executeSharedReadOnlyToolCall({
      executionId: 'voice:fail',
      capabilityId: 'public-web-observation-v1',
      surface: 'voice',
      intent: 'Check public evidence.',
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    }, async () => {
      invoked += 1;
      throw new Error('provider unavailable');
    })).rejects.toThrow('provider unavailable');
    expect(invoked).toBe(1);
  });

  it('speaks explicit failure states without retry authorization or false completion', () => {
    const unavailable = sharedReadOnlyToolFailure('voice', 'unavailable');
    expect(unavailable.execution).toMatchObject({
      state: 'NOT_STARTED',
      providerCallReturned: false,
      verifiedOutcome: false,
      retryAuthorized: false,
    });
    expect(unavailable.presentation.channel).toBe('speech_and_text');
    expect(unavailable.presentation.summary).toContain('not callable');

    const ambiguous = sharedReadOnlyToolFailure('voice', 'upstream_failure');
    expect(ambiguous.execution.state).toBe('UNCONFIRMED');
    expect(ambiguous.execution.retryAuthorized).toBe(false);
    expect(ambiguous.presentation.summary).toContain('could not be confirmed');
    expect(sharedReadOnlyToolFailure('text', 'invalid_request').presentation.channel).toBe('text');
  });
});
