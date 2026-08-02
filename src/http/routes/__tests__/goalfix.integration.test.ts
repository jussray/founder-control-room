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
const OLD_SHA = 'def456def456def456def456def456def456def4';

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
    resolvedIntent: 'Keep the public welcome available before login.',
    constraints: ['Do not weaken protected route guards.'],
    firstFilesOrLogs: ['app/_layout.tsx', 'Playwright artifact'],
    expectedVerificationNames: ['Typecheck', 'Playwright'],
    stopCondition: 'Stop after every named exact-head check has completed.',
  };
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function verificationAttempt(
  verificationName: string,
  commitSha: string,
  result: 'passed' | 'failed' | 'blocked' | 'incomplete',
) {
  return {
    approach: `Inspect ${verificationName} at ${commitSha}`,
    failureSignature: `verification:${verificationName.toLowerCase()}`,
    filesTouched: [],
    verificationName,
    commitSha,
    result,
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
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), projectSlug: '../unsafe', desiredOutcome: '' });

    expect(response.status).toBe(400);
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('rejects an empty required proof set before repository access', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), expectedVerificationNames: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('at least one required check name');
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('blocks nonempty raw-only intent before project or provider access', async () => {
    founderSession();
    const { resolvedIntent: _resolvedIntent, ...rawOnlyPayload } = validPayload();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...rawOnlyPayload, desiredOutcome: 'cont the skill thing' });

    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      code: 'GOALFIX_RUNTIME_BLOCKED',
      skillRuntime: {
        mayProceed: false,
        intent: {
          raw: 'cont the skill thing',
          resolved: 'cont the skill thing',
          confidence: 'low',
          confirmed: false,
        },
      },
    });
    expect(response.body.error).toContain('Resolve the founder intent');
    expect(supabaseMock.from).not.toHaveBeenCalledWith('projects');
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('blocks missing stop conditions before project or provider access', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), stopCondition: '' });

    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      code: 'GOALFIX_RUNTIME_BLOCKED',
      skillRuntime: {
        version: 'goalfix-skill-runtime-v1',
        mayProceed: false,
        scope: { stopCondition: '' },
      },
    });
    expect(response.body.error).toContain('Define a concrete stop condition');
    expect(supabaseMock.from).not.toHaveBeenCalledWith('projects');
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('blocks repeated failures only after refreshing the exact current head', async () => {
    founderSession();
    providerMock.listVerificationSignals.mockResolvedValue([
      { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
      { id: 'check-2', name: 'Playwright', status: 'failed', commitSha: SHA, provider: 'github' },
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        attempts: [
          verificationAttempt('Playwright', SHA, 'failed'),
          verificationAttempt('Playwright', SHA, 'failed'),
        ],
      });

    expect(response.status).toBe(409);
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
    expect(response.body.error).toContain('Stop retrying the same path');
    expect(providerForProjectMock).toHaveBeenCalledTimes(1);
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
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

  it('ignores failures from an older commit when a moving ref advances', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        attempts: [
          verificationAttempt('Playwright', OLD_SHA, 'failed'),
          verificationAttempt('Playwright', OLD_SHA, 'failed'),
        ],
      });

    expect(response.status).toBe(200);
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body.skillRuntime.stagnation.stagnant).toBe(false);
  });

  it('does not block while required exact-head checks remain incomplete', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        attempts: [
          verificationAttempt('Playwright', SHA, 'incomplete'),
          verificationAttempt('Playwright', SHA, 'incomplete'),
        ],
      });

    expect(response.status).toBe(200);
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body.skillRuntime.stagnation.stagnant).toBe(false);
  });

  it('ignores exact-head attempts for checks outside the named required proof set', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        attempts: [
          verificationAttempt('Unrelated Lint', SHA, 'failed'),
          verificationAttempt('Unrelated Lint', SHA, 'failed'),
        ],
      });

    expect(response.status).toBe(200);
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body.skillRuntime.stagnation.stagnant).toBe(false);
  });

  it('returns an exact-head, read-only founder report after a sanitized audit persists', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        maxInitialReads: 1,
        resolvedIntent: 'Preserve the public welcome while keeping protected routes guarded.',
        intentAssumptions: ['The public welcome is the current founder priority.'],
        artifactSha256: 'a'.repeat(64),
        artifactSourceName: 'lean-build-suite.zip',
      });

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
        skill_runtime: 'goalfix-skill-runtime-v1',
      },
    });
    expect(JSON.stringify(audit)).not.toContain('Keep the public welcome available before login.');
    expect(JSON.stringify(audit)).not.toContain('Typecheck');
    expect(JSON.stringify(audit)).not.toContain('lean-build-suite.zip');
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
      goal: {
        desiredOutcome: 'Preserve the public welcome while keeping protected routes guarded.',
        firstFilesOrLogs: ['app/_layout.tsx'],
        expectedVerificationNames: ['Typecheck', 'Playwright'],
      },
      skillRuntime: {
        version: 'goalfix-skill-runtime-v1',
        mayProceed: true,
        intent: {
          raw: 'Keep the public welcome available before login.',
          resolved: 'Preserve the public welcome while keeping protected routes guarded.',
          confidence: 'medium',
          assumptions: ['The public welcome is the current founder priority.'],
          confirmed: true,
        },
        scope: {
          firstFilesOrLogs: ['app/_layout.tsx'],
          maxInitialReads: 1,
          stopCondition: 'Stop after every named exact-head check has completed.',
        },
        provenance: {
          artifactSha256: 'a'.repeat(64),
          sourceName: 'lean-build-suite.zip',
        },
      },
    });
  });

  it('fails closed when the sanitized completion audit cannot persist', async () => {
    founderSession();
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
    founderSession();
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
    founderSession();
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
    founderSession();
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