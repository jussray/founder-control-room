import { describe, expect, it, vi } from 'vitest';
import {
  CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT,
  requestChiefControlRoomRecommendation,
} from '../chiefControlRoomRecommendation.js';

const HASH = 'a'.repeat(64);

function input(overrides = {}) {
  return {
    projectName: "Se'kret Bip",
    projectType: 'ai-agent',
    mission: 'launch',
    currentState: 'live',
    repoIdentifier: 'jussray/Sekret-Bip',
    stack: 'Cloudflare + Supabase',
    ...overrides,
  };
}

function chiefPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      recommendation: {
        contract: CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT,
        selectedBy: 'chief-ai-machine',
        project: {
          name: "Se'kret Bip",
          projectType: 'ai-agent',
          mission: 'launch',
          currentState: 'live',
          repoIdentifier: 'jussray/Sekret-Bip',
          stack: 'Cloudflare + Supabase',
        },
        title: 'Chief recommends an AI / Agent System Control Room focused on Launch.',
        focus: 'Clear only launch-critical blockers.',
        capabilityIntents: ['launch-readiness', 'proofmode'],
        evidencePriorities: ['exact release identity', 'runtime/provider evidence'],
        stateGuidance: 'Require current runtime/provider identity.',
        nextGate: 'Prove the exact release candidate.',
        recommendationHash: HASH,
        founderDecision: {
          required: true,
          explicitDecisionOnly: true,
          accepted: false,
          createControlRoomAuthorized: false,
        },
        fcrHandoff: {
          stateAuthority: 'founder-control-room',
          evidenceAuthority: 'founder-control-room',
          executionAuthority: 'unresolved-by-chief-ai',
          preserveFounderDeclaredState: true,
          verifyRealityIndependently: true,
        },
        ...overrides,
      },
      governanceBoundary: {
        proposalOnly: true,
        founderApprovalRequired: true,
        executionAuthorized: false,
        createControlRoomAuthorized: false,
        projectStateMutationAuthorized: false,
        providerMutationAuthorized: false,
        mergeAuthorized: false,
        deploymentAuthorized: false,
        credentialAuthority: 'none',
        stateAuthority: 'founder-control-room',
        evidenceAuthority: 'founder-control-room',
        recommendationMutationInvalidatesAcceptance: true,
      },
    },
    error: null,
  };
}

function fetchResponse(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;
}

describe('requestChiefControlRoomRecommendation', () => {
  it('calls the server-held Chief HTTPS boundary and returns only a proposal-only recommendation', async () => {
    const fetchImpl = fetchResponse(chiefPayload());
    const result = await requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'https://chief.example' },
      fetchImpl,
    });

    expect(result.recommendationHash).toBe(HASH);
    expect(result.governanceBoundary).toMatchObject({
      proposalOnly: true,
      executionAuthorized: false,
      createControlRoomAuthorized: false,
      providerMutationAuthorized: false,
      mergeAuthorized: false,
      deploymentAuthorized: false,
      credentialAuthority: 'none',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toBe('https://chief.example/api/chief/control-room-recommendation');
    expect(init?.redirect).toBe('error');
    expect(init?.body).toBe(JSON.stringify({
      projectName: "Se'kret Bip",
      projectType: 'ai-agent',
      mission: 'launch',
      currentState: 'live',
      repoIdentifier: 'jussray/Sekret-Bip',
      stack: 'Cloudflare + Supabase',
    }));
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization|token|secret|password/i);
  });

  it('rejects a non-HTTPS or credential-bearing Chief base URL before network access', async () => {
    const fetchImpl = fetchResponse(chiefPayload());

    await expect(requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'http://chief.example' },
      fetchImpl,
    })).rejects.toThrow('must use https');

    await expect(requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'https://user:pass@chief.example' },
      fetchImpl,
    })).rejects.toThrow('must not contain credentials');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed if Chief claims execution or creation authority', async () => {
    const payload = chiefPayload();
    payload.data.governanceBoundary.executionAuthorized = true;

    await expect(requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'https://chief.example' },
      fetchImpl: fetchResponse(payload),
    })).rejects.toThrow('executionAuthorized violated the onboarding authority contract');
  });

  it('fails closed if the returned recommendation is bound to a different project subject', async () => {
    const payload = chiefPayload({
      project: {
        name: 'Other project',
        projectType: 'ai-agent',
        mission: 'launch',
        currentState: 'live',
        repoIdentifier: 'jussray/Sekret-Bip',
        stack: 'Cloudflare + Supabase',
      },
    });

    await expect(requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'https://chief.example' },
      fetchImpl: fetchResponse(payload),
    })).rejects.toThrow('project.name violated the onboarding authority contract');
  });

  it('surfaces bounded Chief errors without promoting them into FCR authority', async () => {
    await expect(requestChiefControlRoomRecommendation(input(), {
      env: { CHIEF_AI_BASE_URL: 'https://chief.example' },
      fetchImpl: fetchResponse({
        data: null,
        error: { code: 'invalid_request', message: 'Unsupported Control Room mission' },
      }, 400),
    })).rejects.toThrow('Unsupported Control Room mission');
  });
});
