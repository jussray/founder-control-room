import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, providerMock, providerForProjectMock, auditInsertMock } = vi.hoisted(() => ({
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

function validPayload() {
  return {
    projectSlug: 'sekret-bip',
    targetRef: 'main',
    desiredOutcome: 'Keep the public welcome available before login.',
    constraints: ['Do not weaken protected route guards.'],
    firstFilesOrLogs: ['app/_layout.tsx', 'Playwright artifact'],
    expectedVerificationNames: ['Typecheck', 'Playwright'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerForProjectMock.mockReturnValue(providerMock);
  providerMock.getRef.mockResolvedValue({ name: 'main', commitSha: SHA });
  providerMock.listVerificationSignals.mockResolvedValue([
    { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
    { id: 'check-2', name: 'Playwright', status: 'passed', commitSha: SHA, provider: 'github' },
  ]);
  auditInsertMock.mockResolvedValue({ error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectsRow();
    if (table === 'project_events') return { insert: auditInsertMock };
    return {};
  });
});

describe('POST /goalfix/inspect', () => {
  it('rejects requests without a founder session before repository access', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .send(validPayload());

    expect(response.status).toBe(401);
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('rejects malformed goal input without touching the provider', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), projectSlug: '../unsafe', desiredOutcome: '' });

    expect(response.status).toBe(400);
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('rejects an empty required proof set before repository access', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), expectedVerificationNames: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('at least one required check name');
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('returns an exact-head, read-only founder report after a sanitized audit persists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const audit = auditInsertMock.mock.calls[0]?.[0];
    expect(audit).toMatchObject({
      project_id: 'project-1',
      event_type: 'goalfix_inspection_completed',
      severity: 'info',
      screen: 'control-room-goalfix',
      metadata: {
        route: 'POST /goalfix/inspect',
        actor: 'founder',
        founder_user_id: 'founder-user-1',
        stage: 'completed',
        requested_ref: 'main',
        target_ref: 'main',
        target_sha: SHA,
        readiness: 'ready_for_founder_decision',
        exact_head_signal_count: 2,
        expected_signal_count: 2,
        error_class: null,
        skill: 'goalfix',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('Keep the public welcome available before login.');
    expect(JSON.stringify(audit)).not.toContain('Typecheck');
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
      goal: { expectedVerificationNames: ['Typecheck', 'Playwright'] },
    });
  });

  it('fails closed when the sanitized completion audit cannot persist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    auditInsertMock.mockResolvedValue({ error: { message: 'audit unavailable' } });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Goalfix access audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
  });

  it('audits a ref-resolution failure before returning the provider error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    providerMock.getRef.mockRejectedValue(new Error('provider unavailable'));

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'provider unavailable',
      code: 'GOALFIX_INSPECTION_FAILED',
    });
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const audit = auditInsertMock.mock.calls[0]?.[0];
    expect(audit).toMatchObject({
      event_type: 'goalfix_inspection_failed',
      severity: 'error',
      metadata: {
        stage: 'resolve_ref',
        requested_ref: 'main',
        target_ref: null,
        target_sha: null,
        expected_signal_count: 2,
        error_class: 'Error',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('provider unavailable');
  });

  it('audits a verification-signal failure with the already resolved exact head', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    providerMock.listVerificationSignals.mockRejectedValue(new Error('checks unavailable'));

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(502);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const audit = auditInsertMock.mock.calls[0]?.[0];
    expect(audit).toMatchObject({
      event_type: 'goalfix_inspection_failed',
      severity: 'error',
      metadata: {
        stage: 'list_verification_signals',
        requested_ref: 'main',
        target_ref: 'main',
        target_sha: SHA,
        expected_signal_count: 2,
        error_class: 'Error',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('checks unavailable');
  });

  it('fails closed when a provider-failure audit cannot persist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    providerMock.listVerificationSignals.mockRejectedValue(new Error('checks unavailable'));
    auditInsertMock.mockResolvedValue({ error: { message: 'audit unavailable' } });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Goalfix access audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
  });
});
