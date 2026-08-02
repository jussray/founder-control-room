import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
  providerMock,
  providerForProjectMock,
  auditInsertMock,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  providerMock: {
    getRef: vi.fn(),
    listVerificationSignals: vi.fn(),
  },
  providerForProjectMock: vi.fn(),
  auditInsertMock: vi.fn(),
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

function verificationAttempt() {
  return {
    approach: `Inspect Playwright at ${SHA}`,
    failureSignature: 'verification:playwright',
    filesTouched: [],
    verificationName: 'Playwright',
    commitSha: SHA,
    result: 'failed',
  };
}

function payload() {
  return {
    projectSlug: 'sekret-bip',
    targetRef: 'main',
    desiredOutcome: 'Keep the public welcome available before login.',
    resolvedIntent: 'Keep the public welcome available before login.',
    constraints: ['Do not weaken protected route guards.'],
    firstFilesOrLogs: ['app/_layout.tsx'],
    expectedVerificationNames: ['Typecheck', 'Playwright'],
    stopCondition: 'Stop after every named exact-head check has completed.',
    attempts: [verificationAttempt(), verificationAttempt()],
  };
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

function signal(name: string, status: 'passed' | 'failed' | 'running') {
  return {
    id: `${name}-${status}`,
    name,
    status,
    commitSha: SHA,
    provider: 'github',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
  providerForProjectMock.mockReturnValue(providerMock);
  providerMock.getRef.mockResolvedValue({ name: 'main', commitSha: SHA });
  auditInsertMock.mockResolvedValue({ error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectsRow();
    if (table === 'project_events') return { insert: auditInsertMock };
    return {};
  });
});

describe('Goalfix live exact-head refresh', () => {
  it('clears stale same-SHA failures when the required check now passes', async () => {
    providerMock.listVerificationSignals.mockResolvedValue([
      signal('Typecheck', 'passed'),
      signal('Playwright', 'passed'),
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(payload());

    expect(response.status).toBe(200);
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body.readiness).toBe('ready_for_founder_decision');
    expect(response.body.skillRuntime.stagnation.stagnant).toBe(false);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the inspection refreshable when the current check is still running', async () => {
    providerMock.listVerificationSignals.mockResolvedValue([
      signal('Typecheck', 'passed'),
      signal('Playwright', 'running'),
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(payload());

    expect(response.status).toBe(200);
    expect(response.body.readiness).toBe('waiting_for_evidence');
    expect(response.body.skillRuntime.stagnation.stagnant).toBe(false);
    expect(response.body.evidence.unknown).toContain(`Playwright: running at ${SHA}`);
  });

  it('still blocks after two completed inspections when the live check remains failed', async () => {
    providerMock.listVerificationSignals.mockResolvedValue([
      signal('Typecheck', 'passed'),
      signal('Playwright', 'failed'),
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(payload());

    expect(response.status).toBe(409);
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body).toMatchObject({
      code: 'GOALFIX_RUNTIME_BLOCKED',
      target: { name: 'main', commitSha: SHA },
      skillRuntime: {
        mayProceed: false,
        stagnation: {
          stagnant: true,
          repeatedFailureSignature: 'verification:playwright',
          matchingAttempts: 2,
        },
      },
    });
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    expect(auditInsertMock.mock.calls[0]?.[0]).toMatchObject({
      event_type: 'goalfix_inspection_failed',
      severity: 'error',
      metadata: {
        stage: 'completed',
        target_sha: SHA,
        readiness: 'blocked',
        exact_head_signal_count: 2,
      },
    });
  });
});
