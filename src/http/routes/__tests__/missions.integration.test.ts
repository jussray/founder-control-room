import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { missionsRouter } from '../missions.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const MISSION_ID = 'mission-1';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/missions', missionsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
}

function founderUsersRow() {
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
  };
}

function missionFoundRow(exists = true) {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: exists ? { id: MISSION_ID, project_id: 'project-1' } : null, error: null }) }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('missions router auth gate', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get(`/missions/${MISSION_ID}/council`);
    expect(res.status).toBe(401);
  });
});

describe('GET /missions/:missionId/council', () => {
  it('returns 404 for an unknown mission', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(false);
      return {};
    });
    const res = await request(buildApp()).get(`/missions/${MISSION_ID}/council`).set('Authorization', BEARER);
    expect(res.status).toBe(404);
  });

  it('lists council conversation rounds', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(true);
      if (table === 'council_conversations') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: 'c1', round: 1, participants: ['codex', 'claude'], outcome: 'approved' }], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get(`/missions/${MISSION_ID}/council`).set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(1);
  });
});

describe('GET /missions/:missionId/runs', () => {
  it('lists Bench runs', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(true);
      if (table === 'agent_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: 'r1', status: 'passed', checks: { typecheck: 'passed' } }], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get(`/missions/${MISSION_ID}/runs`).set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(1);
  });
});

describe('GET /missions/:missionId/costs', () => {
  it('lists costs and totals them', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(true);
      if (table === 'agent_costs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [
                  { id: 'c1', agent_name: 'claude-code', cost_usd: 1.5 },
                  { id: 'c2', agent_name: 'codex', cost_usd: 2.25 },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get(`/missions/${MISSION_ID}/costs`).set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.totalUsd).toBeCloseTo(3.75);
  });
});

describe('PATCH /missions/:missionId — multitool assignment', () => {
  it('rejects a body with no recognized fields', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const res = await request(buildApp()).patch(`/missions/${MISSION_ID}`).set('Authorization', BEARER).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown mission', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(false);
      return {};
    });
    const res = await request(buildApp())
      .patch(`/missions/${MISSION_ID}`)
      .set('Authorization', BEARER)
      .send({ builderAgent: 'claude-code' });
    expect(res.status).toBe(404);
  });

  it('assigns builder and reviewer agents', async () => {
    authSuccess();
    let updatedFields: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: MISSION_ID, project_id: 'project-1' }, error: null }) }),
          }),
          update: (fields: Record<string, unknown>) => {
            updatedFields = fields;
            return {
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({
                    data: { id: MISSION_ID, title: 'x', status: 'sandboxed', builder_agent: 'claude-code', reviewer_agent: 'codex' },
                    error: null,
                  }),
                }),
              }),
            };
          },
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .patch(`/missions/${MISSION_ID}`)
      .set('Authorization', BEARER)
      .send({ builderAgent: 'claude-code', reviewerAgent: 'codex' });

    expect(res.status).toBe(200);
    expect(res.body.mission.builder_agent).toBe('claude-code');
    expect(updatedFields).toMatchObject({ builder_agent: 'claude-code', reviewer_agent: 'codex' });
  });
});

describe('POST /missions/:missionId/council', () => {
  it('rejects an empty participants array', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const res = await request(buildApp())
      .post(`/missions/${MISSION_ID}/council`)
      .set('Authorization', BEARER)
      .send({ participants: [] });
    expect(res.status).toBe(400);
  });

  it('auto-increments the round when none is given', async () => {
    authSuccess();
    let insertedRow: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(true);
      if (table === 'council_conversations') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve({ data: { round: 2 }, error: null }) }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'c-new', ...row }, error: null }),
              }),
            };
          },
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post(`/missions/${MISSION_ID}/council`)
      .set('Authorization', BEARER)
      .send({ participants: ['claude-code', 'codex'], outcome: 'approved' });

    expect(res.status).toBe(201);
    expect(res.body.conversation.round).toBe(3);
    expect(insertedRow).toMatchObject({ round: 3, participants: ['claude-code', 'codex'], outcome: 'approved' });
  });
});

describe('POST /missions/:missionId/costs', () => {
  it('requires agentName', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const res = await request(buildApp()).post(`/missions/${MISSION_ID}/costs`).set('Authorization', BEARER).send({});
    expect(res.status).toBe(400);
  });

  it('attributes a cost entry to the mission\'s project', async () => {
    authSuccess();
    let insertedRow: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') return missionFoundRow(true);
      if (table === 'agent_costs') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'cost-new', ...row }, error: null }),
              }),
            };
          },
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post(`/missions/${MISSION_ID}/costs`)
      .set('Authorization', BEARER)
      .send({ agentName: 'perplexity', provider: 'perplexity', costUsd: 0.02 });

    expect(res.status).toBe(201);
    expect(insertedRow).toMatchObject({ project_id: 'project-1', mission_id: MISSION_ID, agent_name: 'perplexity', cost_usd: 0.02 });
  });
});
