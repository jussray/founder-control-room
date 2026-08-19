import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../../founder-os-lab/capabilityKernel.js';
import {
  CHIEF_AI_EXPECTED_RELEASE_SHA,
  installChiefAiServiceBinding,
} from '../../../worker/chiefAiBinding.js';
import { founderOsSkillsRouter } from '../founderOsSkills.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const RELEASE_SHA = CHIEF_AI_EXPECTED_RELEASE_SHA;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/founder-os', founderOsSkillsRouter);
  return app;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function metadata() {
  return {
    service: 'chief-ai',
    rpcContract: 'juss-v10/chief-fcr-rpc@v1',
    capabilityPlanContract: V10_CAPABILITY_PLAN_CONTRACT,
    releaseSha: RELEASE_SHA,
  };
}

function validPlan(): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Prepare one founder-controlled capability proposal',
    projectSlug: 'founder-control-room',
    expectedHeadSha: 'a'.repeat(40),
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['truthmode', 'ooda'],
    routingReason: 'Chief proposes through the private Cloudflare binding.',
    capabilities: [{
      id: 'goalfix-v1',
      version: '1.0.0',
      origin: 'repo-native',
      owner: 'jussray/chief-ai-machine',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'draft',
    }],
    proofRequirements: ['exact-head tests are green'],
    outcomeSignals: ['proposal-only response returned'],
    rollback: 'remove the CHIEF_AI binding',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
});

describe('Founder OS Chief AI Cloudflare binding routes', () => {
  it('keeps Chief binding receipts behind founder authentication', async () => {
    installChiefAiServiceBinding({
      version: vi.fn().mockResolvedValue({ ok: true, ...metadata() }),
      createCapabilityPlan: vi.fn(),
    });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });

    const response = await request(buildApp()).get('/founder-os/chief/version');
    expect(response.status).toBe(401);
  });

  it('returns a no-store binding receipt with exact Chief release identity', async () => {
    founderSession();
    installChiefAiServiceBinding({
      version: vi.fn().mockResolvedValue({ ok: true, ...metadata() }),
      createCapabilityPlan: vi.fn(),
    });

    const response = await request(buildApp())
      .get('/founder-os/chief/version')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      ok: true,
      binding: {
        name: 'CHIEF_AI',
        service: 'chief-ai',
        entrypoint: 'FounderControlRoomEntrypoint',
        rpcContract: 'juss-v10/chief-fcr-rpc@v1',
        capabilityPlanContract: 'juss-v10/capability-plan@v1',
        releaseSha: RELEASE_SHA,
      },
    });
  });

  it('carries a Chief proposal through the founder route while preserving proposal-only authority', async () => {
    founderSession();
    const plan = validPlan();
    installChiefAiServiceBinding({
      version: vi.fn(),
      createCapabilityPlan: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        ...metadata(),
        result: {
          data: {
            capabilityPlan: plan,
            governanceBoundary: {
              proposalOnly: true,
              executionAuthorized: false,
              founderApprovalRequired: true,
            },
          },
          error: null,
        },
      }),
    });

    const response = await request(buildApp())
      .post('/founder-os/chief/capability-plan')
      .set('Authorization', BEARER)
      .send({ goal: 'fixture' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.binding.releaseSha).toBe(RELEASE_SHA);
    expect(response.body.result.data.capabilityPlan.planHash).toBe(plan.planHash);
    expect(response.body.result.data.governanceBoundary).toMatchObject({
      proposalOnly: true,
      executionAuthorized: false,
      founderApprovalRequired: true,
    });
  });

  it('fails closed when the bound service identity drifts', async () => {
    founderSession();
    installChiefAiServiceBinding({
      version: vi.fn().mockResolvedValue({
        ok: true,
        ...metadata(),
        service: 'wrong-worker',
      }),
      createCapabilityPlan: vi.fn(),
    });

    const response = await request(buildApp())
      .get('/founder-os/chief/version')
      .set('Authorization', BEARER);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'chief_ai_binding_invalid' },
    });
  });

  it('fails closed when Chief reports a valid but unapproved release SHA', async () => {
    founderSession();
    installChiefAiServiceBinding({
      version: vi.fn().mockResolvedValue({
        ok: true,
        ...metadata(),
        releaseSha: 'd'.repeat(40),
      }),
      createCapabilityPlan: vi.fn(),
    });

    const response = await request(buildApp())
      .get('/founder-os/chief/version')
      .set('Authorization', BEARER);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'chief_ai_binding_invalid' },
    });
  });
});
