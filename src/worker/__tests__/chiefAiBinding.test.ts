import { describe, expect, it, vi } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  CHIEF_AI_RPC_CONTRACT,
  readChiefAiServiceVersion,
  requestChiefAiCapabilityPlan,
  type ChiefAiServiceBinding,
} from '../chiefAiBinding.js';

const RELEASE_SHA = '73c36e61dae96bf1bb94990d3b5e5a6a0bb70b24';

function validPlan(): V10CapabilityPlan {
  const base = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Prepare one bounded Cloudflare-bound capability plan',
    projectSlug: 'founder-control-room',
    expectedHeadSha: 'a'.repeat(40),
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft' as const,
    strategicLenses: ['ooda'],
    routingReason: 'Chief proposes; FCR retains authority.',
    capabilities: [{
      id: 'goalfix-v1',
      version: '1.0.0',
      origin: 'repo-native' as const,
      owner: 'jussray/chief-ai-machine',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'draft' as const,
    }],
    proofRequirements: ['exact-head tests are green'],
    outcomeSignals: ['proposal is bounded'],
    rollback: 'remove the service binding',
  };

  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function metadata() {
  return {
    service: 'chief-ai',
    rpcContract: CHIEF_AI_RPC_CONTRACT,
    capabilityPlanContract: V10_CAPABILITY_PLAN_CONTRACT,
    releaseSha: RELEASE_SHA,
  };
}

describe('Chief AI Cloudflare service binding', () => {
  it('accepts a healthy version receipt bound to service, contracts, and release SHA', async () => {
    const binding: ChiefAiServiceBinding = {
      version: vi.fn().mockResolvedValue({ ok: true, ...metadata() }),
      createCapabilityPlan: vi.fn(),
    };

    await expect(readChiefAiServiceVersion(binding)).resolves.toEqual({
      ok: true,
      ...metadata(),
    });
  });

  it('fails closed on identity, RPC-contract, or release-SHA drift', async () => {
    const cases = [
      { ...metadata(), service: 'not-chief' },
      { ...metadata(), rpcContract: 'juss-v10/chief-fcr-rpc@v0' },
      { ...metadata(), releaseSha: 'unknown' },
    ];

    for (const value of cases) {
      const binding: ChiefAiServiceBinding = {
        version: vi.fn().mockResolvedValue({ ok: true, ...value }),
        createCapabilityPlan: vi.fn(),
      };
      await expect(readChiefAiServiceVersion(binding)).rejects.toThrow();
    }
  });

  it('revalidates a successful Chief plan inside FCR', async () => {
    const plan = validPlan();
    const binding: ChiefAiServiceBinding = {
      version: vi.fn(),
      createCapabilityPlan: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        ...metadata(),
        result: { data: { capabilityPlan: plan }, meta: {}, error: null },
      }),
    };

    const response = await requestChiefAiCapabilityPlan({ goal: 'fixture' }, binding);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.capabilityPlan?.planHash).toBe(plan.planHash);
    expect(response.releaseSha).toBe(RELEASE_SHA);
  });

  it('preserves an honest Chief rejection without mistaking it for binding failure', async () => {
    const binding: ChiefAiServiceBinding = {
      version: vi.fn(),
      createCapabilityPlan: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        ...metadata(),
        result: { data: null, error: { code: 'invalid_capability_plan_request' } },
      }),
    };

    const response = await requestChiefAiCapabilityPlan({ malformed: true }, binding);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
    expect(response.capabilityPlan).toBeNull();
  });

  it('rejects contradictory operation status instead of inventing green', async () => {
    const binding: ChiefAiServiceBinding = {
      version: vi.fn(),
      createCapabilityPlan: vi.fn().mockResolvedValue({
        ok: true,
        status: 400,
        ...metadata(),
        result: { data: null },
      }),
    };

    await expect(requestChiefAiCapabilityPlan({}, binding)).rejects.toThrow(
      'Chief AI capability-plan outcome does not match its HTTP-equivalent status',
    );
  });
});
