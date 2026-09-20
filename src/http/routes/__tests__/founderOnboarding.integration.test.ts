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
  CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT: 'chief-ai/control-room-recommendation@v1',
  requestChiefControlRoomRecommendation: mockChiefRecommendation,
}));

import express from 'express';
import request from 'supertest';
import { founderOnboardingRouter } from '../founderOnboarding.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const CHIEF_HASH = 'a'.repeat(64);

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/onboarding', founderOnboardingRouter);
  return instance;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { email: FOUNDER_EMAIL },
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
    title: 'Chief recommends an AI / Agent System Control Room focused on Fix.',
    focus: 'Locate the real failing path and repair one cause.',
    capabilityIntents: ['repo-audit-first', 'goalfix', 'verification'],
    evidencePriorities: ['exact failure evidence', 'authoritative source state'],
    stateGuidance: 'Require current runtime/provider identity before treating source as live truth.',
    nextGate: 'Capture the failing path and its exact evidence before mutation.',
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

const project = {
  slug: 'founder-control-room',
  name: 'Founder Control Room',
  repoProvider: 'github',
  repoIdentifier: 'jussray/founder-control-room',
  stack: 'Cloudflare + Supabase',
  riskLevel: 'high',
};
const controlRoom = {
  projectType: 'ai-agent',
  mission: 'fix',
  currentState: 'live',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
  mockChiefRecommendation.mockResolvedValue(chiefRecommendation());
});

describe('GET /onboarding/state', () => {
  it('returns project, composer profile, connection state, and the founder authority boundary', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [{
                id: 'project-1',
                slug: 'founder-control-room',
                name: 'Founder Control Room',
                repo_provider: 'github',
                repo_identifier: 'jussray/founder-control-room',
                status: 'active',
                risk_level: 'high',
              }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'project_connections') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: [{
                  id: 'connection-1',
                  project_id: 'project-1',
                  connection_type: 'github',
                  label: 'primary',
                  status: 'disconnected',
                  authority_level: 'L5',
                  capabilities: ['inspect_repos'],
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: [{
                  project_id: 'project-1',
                  event_type: 'founder_onboarding_bootstrapped',
                  created_at: '2026-09-14T22:00:00.000Z',
                  metadata: {
                    controlRoomProfile: {
                      projectType: 'ai-agent',
                      mission: 'fix',
                      currentState: 'live',
                    },
                  },
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await request(app())
      .get('/onboarding/state')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.body.complete).toBe(true);
    expect(response.body.projects[0].controlRoomProfile).toEqual({
      projectType: 'ai-agent',
      mission: 'fix',
      currentState: 'live',
    });
    expect(response.body.projects[0].connections[0]).toMatchObject({
      type: 'github',
      status: 'disconnected',
      authorityLevel: 'L5',
    });
    expect(response.body.composerOptions).toEqual(expect.objectContaining({
      projectTypes: expect.arrayContaining(['product-app', 'ai-agent', 'store-commerce']),
      missions: expect.arrayContaining(['build', 'fix', 'prove']),
      currentStates: expect.arrayContaining(['idea', 'live', 'broken']),
    }));
    expect(response.body.recommendedProviders.map((provider: { type: string }) => provider.type))
      .toContain('hubspot');
    expect(response.body.authorityBoundary).toEqual(expect.objectContaining({
      loginGrantsExecution: false,
      mergeRequiresSeparateApproval: true,
      deployRequiresSeparateApproval: true,
      connectionSlotsStoreCredentials: false,
    }));
  });
});

describe('POST /onboarding/chief-recommendation', () => {
  it('returns a server-mediated Chief proposal and an exact founder-acceptance fingerprint', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const response = await request(app())
      .post('/onboarding/chief-recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });

    expect(response.status).toBe(200);
    expect(mockChiefRecommendation).toHaveBeenCalledWith({
      projectName: 'Founder Control Room',
      projectType: 'ai-agent',
      mission: 'fix',
      currentState: 'live',
      repoIdentifier: 'jussray/founder-control-room',
      stack: 'Cloudflare + Supabase',
    });
    expect(response.body.recommendation.recommendationHash).toBe(CHIEF_HASH);
    expect(response.body.acceptance).toEqual({
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      requiresExplicitFounderDecision: true,
      accepted: false,
    });
    expect(response.body.truth).toEqual({
      chiefCreatesControlRoom: false,
      chiefGrantsExecution: false,
      stateAuthority: 'founder-control-room',
      evidenceAuthority: 'founder-control-room',
    });
  });
});

describe('POST /onboarding/bootstrap', () => {
  it('revalidates the exact accepted Chief recommendation before creating project state', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const recommendationResponse = await request(app())
      .post('/onboarding/chief-recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });
    const acceptanceFingerprint = recommendationResponse.body.acceptance.fingerprint;

    const insertedConnections: Record<string, unknown>[] = [];
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
      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: (rows: Record<string, unknown>[]) => {
            insertedConnections.push(...rows);
            return {
              select: () => Promise.resolve({
                data: rows.map((row, index) => ({ id: `connection-${index + 1}`, ...row })),
                error: null,
              }),
            };
          },
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
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project,
        controlRoom,
        chiefRecommendation: {
          recommendationHash: CHIEF_HASH,
          acceptanceFingerprint,
          accepted: true,
        },
        providers: ['github', 'openai', 'hubspot', 'playwright'],
      });

    expect(response.status).toBe(201);
    expect(mockChiefRecommendation).toHaveBeenCalledTimes(2);
    expect(response.body.controlRoomProfile).toEqual(controlRoom);
    expect(response.body.chiefRecommendation).toEqual({
      contract: 'chief-ai/control-room-recommendation@v1',
      selectedBy: 'chief-ai-machine',
      recommendationHash: CHIEF_HASH,
      acceptanceFingerprint,
      accepted: true,
      authorityGranted: false,
    });
    expect(insertedConnections.map((row) => row.connection_type)).toEqual([
      'github',
      'openai',
      'hubspot',
      'playwright',
    ]);
    expect(insertedConnections.every((row) => row.status === 'disconnected')).toBe(true);
    expect(insertedConnections.every((row) => row.secret_ref === null)).toBe(true);
    expect(JSON.stringify(insertedConnections)).not.toMatch(/api[_-]?key|access[_-]?token|bearer/i);
    expect(response.body.truth).toEqual({
      credentialsStored: false,
      providersConnected: false,
      chiefExecutionAuthorized: false,
      mergeApproved: false,
      deploymentApproved: false,
    });
    expect(eventRow).toMatchObject({
      event_type: 'founder_onboarding_bootstrapped',
      metadata: expect.objectContaining({
        controlRoomProfile: controlRoom,
        chiefRecommendation: {
          contract: 'chief-ai/control-room-recommendation@v1',
          selectedBy: 'chief-ai-machine',
          recommendationHash: CHIEF_HASH,
          acceptanceFingerprint,
          accepted: true,
          authorityGranted: false,
        },
        authorityGranted: false,
        credentialsStored: false,
      }),
    });
  });

  it('rejects a stale Chief recommendation before any project mutation', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const first = await request(app())
      .post('/onboarding/chief-recommendation')
      .set('Authorization', BEARER)
      .send({ project, controlRoom });

    mockChiefRecommendation.mockResolvedValue(chiefRecommendation('b'.repeat(64)));
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      throw new Error(`Unexpected mutation lookup: ${table}`);
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project,
        controlRoom,
        chiefRecommendation: {
          recommendationHash: CHIEF_HASH,
          acceptanceFingerprint: first.body.acceptance.fingerprint,
          accepted: true,
        },
        providers: [],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/recommendation changed/i);
  });

  it('requires explicit founder acceptance when a Composer profile is supplied', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      throw new Error(`Unexpected mutation lookup: ${table}`);
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({ project, controlRoom, providers: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/explicit founder acceptance/i);
    expect(mockChiefRecommendation).not.toHaveBeenCalled();
  });

  it('rejects an invalid composer profile before attempting a workspace mutation', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project: { slug: 'test-project', name: 'Test Project' },
        controlRoom: {
          projectType: 'product-app',
          mission: 'delete-everything',
          currentState: 'building',
        },
        providers: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/supported projectType, mission, and currentState/);
  });

  it('rejects undeclared providers before attempting a workspace mutation', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project: { slug: 'test-project', name: 'Test Project' },
        providers: ['unknown-provider'],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/providers must be drawn from/);
  });
});
