import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockChiefRecommendation, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockChiefRecommendation: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/chiefControlRoomRecommendation.js', () => ({
  requestChiefControlRoomRecommendation: mockChiefRecommendation,
}));

import express from 'express';
import request from 'supertest';
import { workspaceProjectsRouter } from '../workspaceProjects.js';

const FOUNDER_EMAIL = 'workspace-founder@example.com';
const BEARER = 'Bearer workspace-test-token';
const CHIEF_HASH = 'b'.repeat(64);

const project = {
  name: 'Launch Project',
  slug: 'launch-project',
  repoIdentifier: 'jussray/launch-project',
  stack: 'Cloudflare + Supabase',
};
const controlRoom = {
  projectType: 'product-app',
  mission: 'launch',
  currentState: 'building',
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/workspace', workspaceProjectsRouter);
  return instance;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            email: FOUNDER_EMAIL,
            account_role: 'workspace_owner',
            workspace_id: 'workspace-1',
          },
          error: null,
        }),
      }),
    }),
  };
}

function emptyProjectLookup() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  };
}

function chiefRecommendation(recommendationHash = CHIEF_HASH) {
  return {
    contract: 'chief-ai/control-room-recommendation@v1',
    selectedBy: 'chief-ai-machine',
    title: 'Chief recommends a Product / App Control Room focused on Launch.',
    focus: 'Clear only launch-critical blockers.',
    capabilityIntents: ['launch-readiness', 'proofmode'],
    evidencePriorities: ['exact release identity', 'runtime/provider evidence'],
    stateGuidance: 'Treat the founder-declared state as context until FCR verifies reality.',
    nextGate: 'Prove one real user path against the exact release.',
    recommendationHash,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'workspace-founder', email: FOUNDER_EMAIL } },
    error: null,
  });
  mockChiefRecommendation.mockResolvedValue(chiefRecommendation());
  supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    return {};
  });
});

describe('workspace Chief onboarding', () => {
  it('sources the workspace recommendation from Chief and binds approval to the workspace subject', async () => {
    const response = await request(app())
      .post('/workspace/projects/recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });

    expect(response.status).toBe(200);
    expect(mockChiefRecommendation).toHaveBeenCalledWith({
      projectName: 'Launch Project',
      projectType: 'product-app',
      mission: 'launch',
      currentState: 'building',
      repoIdentifier: 'jussray/launch-project',
      stack: 'Cloudflare + Supabase',
    });
    expect(response.body.recommendation).toMatchObject({
      version: 'chief-ai/control-room-recommendation@v1',
      selectedBy: 'chief-ai-machine',
      recommendationHash: CHIEF_HASH,
      title: 'Chief recommends a Product / App Control Room focused on Launch.',
      firstGate: 'Prove one real user path against the exact release.',
    });
    expect(response.body.recommendation.id)
      .toMatch(/^workspace-chief-acceptance-v1:[0-9a-f]{64}$/);
    expect(response.body.truth).toEqual({
      chiefCreatesControlRoom: false,
      chiefGrantsExecution: false,
      stateAuthority: 'founder-control-room',
      evidenceAuthority: 'founder-control-room',
    });
  });

  it('revalidates Chief, then atomically creates project plus privacy-safe onboarding evidence', async () => {
    const recommendationResponse = await request(app())
      .post('/workspace/projects/recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });
    const recommendationId = recommendationResponse.body.recommendation.id;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return emptyProjectLookup();
      return {};
    });
    supabaseMock.rpc.mockResolvedValue({
      data: {
        id: 'project-1',
        workspace_id: 'workspace-1',
        slug: 'launch-project',
        name: 'Launch Project',
        repo_provider: 'github',
        repo_identifier: 'jussray/launch-project',
        stack: 'Cloudflare + Supabase',
        status: 'active',
        risk_level: 'medium',
      },
      error: null,
    });

    const response = await request(app())
      .post('/workspace/projects')
      .set('Authorization', BEARER)
      .send({
        project,
        controlRoom,
        providers: [],
        chiefRecommendationId: recommendationId,
        chiefApproval: true,
      });

    expect(response.status).toBe(201);
    expect(mockChiefRecommendation).toHaveBeenCalledTimes(2);
    expect(response.body.chief.recommendation.recommendationHash).toBe(CHIEF_HASH);
    expect(response.body.truth).toEqual({
      credentialsStored: false,
      providersConnected: false,
      mergeApproved: false,
      deploymentApproved: false,
      executionApproved: false,
    });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    const [rpcName, rpcArgs] = supabaseMock.rpc.mock.calls[0];
    expect(rpcName).toBe('create_workspace_project_with_onboarding_event');
    expect(rpcArgs).toMatchObject({
      p_workspace_id: 'workspace-1',
      p_slug: 'launch-project',
      p_name: 'Launch Project',
      p_repo_provider: 'github',
      p_repo_identifier: 'jussray/launch-project',
      p_stack: 'Cloudflare + Supabase',
      p_event_metadata: {
        workspaceId: 'workspace-1',
        chiefRecommendationApproved: true,
        authorityGranted: false,
        credentialsStored: false,
      },
    });
    expect(rpcArgs.p_event_metadata).not.toHaveProperty('founder');
    expect(rpcArgs.p_event_metadata).not.toHaveProperty('email');
    expect(rpcArgs.p_event_metadata).not.toHaveProperty('founderEmail');
  });

  it('fails closed without reflecting database details when atomic bootstrap fails', async () => {
    const recommendationResponse = await request(app())
      .post('/workspace/projects/recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });
    const recommendationId = recommendationResponse.body.recommendation.id;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return emptyProjectLookup();
      return {};
    });
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'event insert rejected: internal schema detail' },
    });

    const response = await request(app())
      .post('/workspace/projects')
      .set('Authorization', BEARER)
      .send({
        project,
        controlRoom,
        providers: [],
        chiefRecommendationId: recommendationId,
        chiefApproval: true,
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Project and onboarding evidence could not be created atomically',
    });
    expect(JSON.stringify(response.body)).not.toContain('internal schema detail');
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });
});