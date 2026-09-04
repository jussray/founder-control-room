import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, readEffectiveDesiredState } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  readEffectiveDesiredState: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../switchboard/store.js', () => ({
  readEffectiveDesiredState,
  SwitchboardError: class SwitchboardError extends Error {},
}));

import express from 'express';
import request from 'supertest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../../founder-os-lab/capabilityKernel.js';
import {
  createFounderControlDecision,
  type FounderControlProposalBinding,
} from '../../../lib/founderControlDecision.js';
import { productBuildRouter } from '../productBuild.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer founder-token';
const STORY_HEAD = 'b'.repeat(40);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/product-build', productBuildRouter);
  return app;
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
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

function chiefPlan(): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Build the first bounded FCR to StoryEngine Product Control Room loop.',
    projectSlug: 'l99',
    expectedHeadSha: STORY_HEAD,
    registryHash: 'f'.repeat(64),
    requestedAuthority: 'reversible',
    strategicLenses: ['ultrathink', 'attackten', 'goalfix'],
    routingReason: 'Chief selected the existing StoryEngine federation capability for one reversible proof actuator.',
    capabilities: [{
      id: 'founder-control-room-federation',
      version: '1.0.0',
      origin: 'repo-native',
      owner: 'jussray/StoryEngine',
      sourceHash: 'e'.repeat(64),
      authorityCeiling: 'reversible',
    }],
    proofRequirements: ['node-test', 'playwright'],
    outcomeSignals: ['exact product-build receipt returns to FCR'],
    rollback: 'Revert the focused Product Control Room adapter and remove its single audit event.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function requestBody() {
  const capabilityPlan = chiefPlan();
  const proposal: FounderControlProposalBinding = {
    proposalId: 'chief-storyengine-build-001',
    proposalHash: 'a'.repeat(64),
    projectSlug: capabilityPlan.projectSlug,
    actionType: 'build-product-control-room-loop',
    expectedHeadSha: capabilityPlan.expectedHeadSha,
    capabilityPlanHash: capabilityPlan.planHash,
  };
  const founderDecision = createFounderControlDecision({
    proposal,
    surface: 'chatgpt',
    decision: 'approved',
  });
  return {
    directiveId: 'build-storyengine-001',
    capabilityPlan,
    proposal,
    founderDecision,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readEffectiveDesiredState.mockResolvedValue('on');
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
});

describe('POST /product-build/storyengine/directive', () => {
  it('requires a live founder identity before issuing build authority', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });

    const response = await request(buildApp())
      .post('/product-build/storyengine/directive')
      .set('Authorization', BEARER)
      .send(requestBody());

    expect(response.status).toBe(401);
    expect(readEffectiveDesiredState).not.toHaveBeenCalled();
  });

  it('fails closed when the founder execution master switch is off', async () => {
    founderSession();
    readEffectiveDesiredState.mockResolvedValue('off');

    const response = await request(buildApp())
      .post('/product-build/storyengine/directive')
      .set('Authorization', BEARER)
      .send(requestBody());

    expect(response.status).toBe(423);
    expect(response.body).toMatchObject({
      error: 'founder_switch_off',
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
    });
  });

  it('issues only the fixed StoryEngine event-log directive after validating Chief + founder bindings', async () => {
    founderSession();
    const body = requestBody();

    const response = await request(buildApp())
      .post('/product-build/storyengine/directive')
      .set('Authorization', BEARER)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      ok: true,
      contract: 'juss-v10/product-build-directive@v1',
      directive: {
        directiveId: 'build-storyengine-001',
        productControlRoomId: 'storyengine-control-room',
        repository: 'jussray/StoryEngine',
        allowedCapabilities: ['founder-control-room-federation'],
        allowedMutationScope: ['control-room:event-log'],
        authorityCeiling: 'reversible_product_change',
        chiefCapabilityPlanRequired: true,
        executionAuthorized: true,
        receiptRequired: true,
        mergeAuthorized: false,
        deployAuthorized: false,
        providerMutationAuthorized: false,
      },
      authority: {
        issuedBy: 'founder-control-room',
        chiefPlanValidated: true,
        founderDecisionValidated: true,
        crossProductDispatchPerformed: false,
        productControlRoomMustRevalidateExactHead: true,
        receiptRequired: true,
        mergeAuthorized: false,
        deployAuthorized: false,
        providerMutationAuthorized: false,
      },
    });
    expect(response.body.directive.proposal.capabilityPlanHash).toBe(body.capabilityPlan.planHash);
    expect(response.body.directive.proposal.expectedHeadSha).toBe(STORY_HEAD);
    expect(response.body.directive.directiveHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects proposal drift away from the exact Chief capability plan', async () => {
    founderSession();
    const body = requestBody();
    body.proposal = { ...body.proposal, capabilityPlanHash: '0'.repeat(64) };

    const response = await request(buildApp())
      .post('/product-build/storyengine/directive')
      .set('Authorization', BEARER)
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PRODUCT_BUILD_BINDING_MISMATCH');
    expect(response.body.reasons).toContain('proposal capabilityPlanHash must match the exact Chief plan hash');
  });

  it('rejects a Chief plan that omits the StoryEngine federation capability', async () => {
    founderSession();
    const body = requestBody();
    const withoutFederation = {
      ...body.capabilityPlan,
      capabilities: [{
        id: 'some-other-capability',
        version: '1.0.0',
        origin: 'repo-native' as const,
        owner: 'jussray/StoryEngine',
        sourceHash: '9'.repeat(64),
        authorityCeiling: 'reversible' as const,
      }],
    };
    body.capabilityPlan = {
      ...withoutFederation,
      planHash: v10CapabilityPlanHash(withoutFederation),
    };

    const response = await request(buildApp())
      .post('/product-build/storyengine/directive')
      .set('Authorization', BEARER)
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body.reasons).toContain('Chief capability plan must select founder-control-room-federation');
  });
});
