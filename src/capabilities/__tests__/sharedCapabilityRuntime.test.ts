import { describe, expect, it } from 'vitest';
import {
  finalizeSharedReadOnlyCapabilityRun,
  prepareSharedReadOnlyCapabilityRun,
  SharedCapabilityRuntimeError,
  type SharedReadOnlyObservation,
} from '../sharedCapabilityRuntime.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function prepared(surface: 'voice' | 'text' = 'text') {
  return prepareSharedReadOnlyCapabilityRun({
    executionId: 'tinyfish-observation:test',
    capabilityId: 'tinyfish-web-observation-v1',
    surface,
    intent: 'Observe public evidence without mutation.',
    founder: { userId: 'founder-1', email: 'founder@example.com' },
  });
}

function observation(): SharedReadOnlyObservation {
  return {
    provider: 'tinyfish',
    providerAccepted: true,
    truthState: 'provider_observed_unverified',
    requestFingerprint: HASH_A,
    resultCount: 2,
    continuity: {
      evidenceFingerprint: HASH_B,
      proofCookie: 'tinyfish-readonly:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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
      capabilityId: 'tinyfish-web-observation-v1',
      surface: 'root-admin',
      intent: 'Observe evidence.',
      founder: { userId: 'founder-1', email: 'founder@example.com' },
    })).toThrow(SharedCapabilityRuntimeError);

    expect(() => prepareSharedReadOnlyCapabilityRun({
      executionId: 'run:2',
      capabilityId: 'tinyfish-web-observation-v1',
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
      provider: { name: 'tinyfish', accepted: true },
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
