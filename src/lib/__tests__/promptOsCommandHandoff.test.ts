import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  FCR_PUBLIC_COMMAND_INTAKE_CONTRACT,
  PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT,
  PROMPTOS_COMMAND_NEXT_CONTRACT,
  PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT,
  acceptPromptOSChiefCommandHandoff,
  requestPromptOSCommandIntakeFromChief,
  validatePromptOSChiefCommandHandoff,
} from '../promptOsCommandHandoff.js';

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(raw).sort().map((key) => [key, canonicalize(raw[key])]));
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sourceIntent() {
  return {
    schema: PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT,
    command: { id: 'contract', token: '/contract', category: 'Legal', label: 'Contract' },
    arguments: 'vendor NDA',
    project: 'truth-weaver',
    capabilityId: 'legal-navigation',
    route: {
      owner: 'promptos',
      reasoningPlane: 'chief-ai-machine',
      specialistProduct: 'truth-weaver',
      authorityPlane: 'founder-control-room',
    },
    authorityCeiling: 'advisory-only',
    execution: { status: 'not-executed', mutationAuthorized: false },
    evidence: { contract: 'current-authority', staleOnStateChange: true },
    catalogQuery: 'contract',
  };
}

function handoff() {
  const source = sourceIntent();
  const payload = {
    contract: PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT,
    sourceIntentContract: PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT,
    sourceIntentFingerprint: hash(source),
    sourceIntent: source,
    acceptedBy: 'chief-ai-machine',
    status: 'accepted-for-capability-planning',
    project: 'truth-weaver',
    projectSource: 'promptos-hint',
    capabilityId: 'legal-navigation',
    specialistProduct: 'truth-weaver',
    requestedOutcome: 'vendor NDA',
    authorityPlane: 'founder-control-room',
    authorityResolution: 'unresolved',
    actionAuthority: false,
    executionAuthorized: false,
    nextRequiredContract: PROMPTOS_COMMAND_NEXT_CONTRACT,
  };
  return { ...payload, handoffFingerprint: hash(payload) };
}

describe('PromptOS -> Chief -> FCR public command handoff', () => {
  it('accepts an exact Chief handoff only for capability planning', () => {
    const candidate = handoff();
    expect(validatePromptOSChiefCommandHandoff(candidate)).toEqual([]);

    const intake = acceptPromptOSChiefCommandHandoff(candidate);
    expect(intake).toEqual({
      contract: FCR_PUBLIC_COMMAND_INTAKE_CONTRACT,
      receivedFrom: 'chief-ai-machine',
      sourceIntentFingerprint: candidate.sourceIntentFingerprint,
      chiefHandoffFingerprint: candidate.handoffFingerprint,
      project: 'truth-weaver',
      commandId: 'contract',
      capabilityId: 'legal-navigation',
      specialistProduct: 'truth-weaver',
      requestedOutcome: 'vendor NDA',
      acceptedForCapabilityPlanning: true,
      acceptedForAuthorityResolution: false,
      authorityState: 'unresolved',
      actionAuthority: false,
      executionAuthorized: false,
      nextRequiredContract: PROMPTOS_COMMAND_NEXT_CONTRACT,
    });
  });

  it('rejects handoff tampering instead of trusting Chief labels', () => {
    const candidate = handoff();
    const tampered = { ...candidate, capabilityId: 'release' };
    const errors = validatePromptOSChiefCommandHandoff(tampered);
    expect(errors).toEqual(expect.arrayContaining([
      'handoff capability does not match source intent',
      'handoff fingerprint does not match handoff content',
    ]));
  });

  it('rejects an execution-authorizing handoff even with an otherwise valid source intent', () => {
    const candidate = handoff();
    const payload = { ...candidate, executionAuthorized: true };
    delete (payload as Partial<typeof candidate>).handoffFingerprint;
    const forged = { ...payload, handoffFingerprint: hash(payload) };
    expect(validatePromptOSChiefCommandHandoff(forged)).toContain('public command handoff cannot authorize execution');
  });

  it('uses the private Chief service binding and binds intake to an exact Chief release SHA', async () => {
    const candidate = handoff();
    const acceptPromptOSCommandIntent = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      service: 'chief-ai',
      rpcContract: 'juss-v10/chief-fcr-rpc@v1',
      promptOSCommandIntentContract: PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT,
      promptOSCommandHandoffContract: PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT,
      releaseSha: 'a'.repeat(40),
      result: candidate,
    });

    const intake = await requestPromptOSCommandIntakeFromChief(
      { version: vi.fn(), ingestBipEvidence: vi.fn(), acceptPromptOSCommandIntent },
      sourceIntent(),
    );

    expect(acceptPromptOSCommandIntent).toHaveBeenCalledOnce();
    expect(intake.chiefReleaseSha).toBe('a'.repeat(40));
    expect(intake.acceptedForAuthorityResolution).toBe(false);
    expect(intake.nextRequiredContract).toBe('juss-v10/capability-plan@v1');
  });

  it('fails closed when the Chief runtime cannot prove an exact release SHA', async () => {
    const candidate = handoff();
    await expect(requestPromptOSCommandIntakeFromChief(
      {
        version: vi.fn(),
        ingestBipEvidence: vi.fn(),
        acceptPromptOSCommandIntent: vi.fn().mockResolvedValue({
          ok: true,
          service: 'chief-ai',
          rpcContract: 'juss-v10/chief-fcr-rpc@v1',
          promptOSCommandIntentContract: PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT,
          promptOSCommandHandoffContract: PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT,
          releaseSha: 'unknown',
          result: candidate,
        }),
      },
      sourceIntent(),
    )).rejects.toThrow('not bound to an exact runtime release SHA');
  });
});
