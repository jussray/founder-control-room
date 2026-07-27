import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, providerMock, providerForProjectMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  providerMock: {
    getRef: vi.fn(),
    listVerificationSignals: vi.fn(),
  },
  providerForProjectMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: providerForProjectMock,
}));

import express from 'express';
import request from 'supertest';
import { goalfixRouter } from '../goalfix.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const SHA = 'abc123abc123abc123abc123abc123abc123abcd';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/goalfix', goalfixRouter);
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

function projectsRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            id: 'project-1',
            slug: 'sekret-bip',
            name: "Se'kret Bip",
            repo_provider: 'github',
            repo_identifier: 'jussray/Sekret-Bip',
          },
          error: null,
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerForProjectMock.mockReturnValue(providerMock);
  providerMock.getRef.mockResolvedValue({ name: 'main', commitSha: SHA });
  providerMock.listVerificationSignals.mockResolvedValue([
    { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
  ]);
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectsRow();
    return {};
  });
});

describe('POST /goalfix/inspect', () => {
  it('rejects requests without a founder session before repository access', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .send({ projectSlug: 'sekret-bip', desiredOutcome: 'Inspect the current blocker.' });

    expect(response.status).toBe(401);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('rejects malformed goal input without touching the provider', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ projectSlug: '../unsafe', desiredOutcome: '' });

    expect(response.status).toBe(400);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('returns an exact-head, read-only founder report', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        projectSlug: 'sekret-bip',
        targetRef: 'main',
        desiredOutcome: 'Keep the public welcome available before login.',
        constraints: ['Do not weaken protected route guards.'],
        firstFilesOrLogs: ['app/_layout.tsx', 'Playwright artifact'],
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body).toMatchObject({
      version: 'goalfix-v1',
      readiness: 'ready_for_founder_decision',
      routing: { skill: 'goalfix', connectorAction: 'repository.read' },
      authority: {
        level: 'L1',
        mode: 'read-only',
        mutationAllowed: false,
        requiresExplicitApprovalForMutation: true,
      },
      project: { repository: 'jussray/Sekret-Bip' },
      target: { name: 'main', commitSha: SHA },
    });
  });

  it('fails closed when provider inspection cannot complete', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    providerMock.getRef.mockRejectedValue(new Error('provider unavailable'));

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'sekret-bip', desiredOutcome: 'Inspect the current blocker.' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'provider unavailable',
      code: 'GOALFIX_INSPECTION_FAILED',
    });
  });
});
