import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockChiefRecommendation, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockChiefRecommendation: vi.fn(),
  supabaseMock: { from: vi.fn() },
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

  it('revalidates the exact Chief recommendation after explicit founder approval before project creation', async () => {
    const recommendationResponse = await request(app())
      .post('/workspace/projects/recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });
    const recommendationId = recommendationResponse.body.recommendation.id;

    let eventRow: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'project-1', ...row },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return {
          insert: (row: Record<string, unknown>) => {
            eventRow = row;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
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
    expect(eventRow).toMatchObject({
      project_id: 'project-1',
      event_type: 'founder_onboarding_bootstrapped',
      metadata: {
        workspaceId: 'workspace-1',
        chiefRecommendationApproved: true,
        authorityGranted: false,
        credentialsStored: false,
      },
    });
  });
});
