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
import { founderOsSkillsRouter } from '../founderOsSkills.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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

function validPreview() {
  return {
    goal: 'Inspect the current exact head and identify the smallest safe next gate.',
    action: 'inspect',
    command: 'truthmode',
    provider: 'github',
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [`https://github.com/jussray/founder-control-room/commit/${SHA}`],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
});

describe('POST /founder-os/preview', () => {
  it('rejects requests without a founder session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .send(validPreview());

    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('rejects unknown fields after founder authentication', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({ ...validPreview(), execute: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('only supported Founder OS preview fields');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
  });

  it('rejects malformed registry and evidence values', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        ...validPreview(),
        command: 'unknown-mode',
        evidence: {
          repository: 'jussray/founder-control-room',
          commitSha: 'main',
          proofUrls: ['http://example.com/not-allowed'],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('malformed or outside the checked-in registry');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('returns a deterministic L0 preview without provider or persistence authority', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({ ...validPreview(), command: 'confess' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      status: 'simulated',
      plannerInvoked: true,
      violations: [],
      sandbox: {
        deterministic: true,
        capabilities: {
          network: false,
          providers: false,
          database: false,
          filesystem: false,
          environment: false,
          subprocess: false,
          secrets: false,
          dynamicCode: false,
          wallClock: false,
          randomness: false,
          publicUrls: false,
        },
      },
      plan: {
        readiness: 'ready_for_review',
        authority: {
          level: 'L0',
          mode: 'simulation',
          executionAllowed: false,
        },
        route: {
          command: { id: 'confess', specialistSkill: 'repo-truth' },
          provider: {
            id: 'github',
            mode: 'preview',
            supported: true,
            executionAllowed: false,
          },
        },
      },
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
  });

  it('returns a blocked plan when the provider cannot preview the selected action', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Preview the exact-head merge gate in Figma.',
        action: 'merge-code',
        command: 'loop',
        provider: 'figma',
        approval: {
          id: 'founder-approved:preview-only',
          actions: ['merge-code'],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'simulated',
      plan: {
        readiness: 'blocked',
        authority: {
          approvalObserved: true,
          executionAllowed: false,
        },
        route: {
          provider: {
            id: 'figma',
            supported: false,
            executionAllowed: false,
          },
        },
      },
    });
    expect(response.body.plan.truth.blocked.join(' ')).toContain(
      'figma does not support a merge-code preview',
    );
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('recognizes scoped approval while keeping a supported provider inert', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Preview the exact-head merge gate.',
        action: 'merge-code',
        command: 'loop',
        provider: 'github',
        approval: {
          id: 'founder-approved:preview-only',
          actions: ['merge-code'],
        },
        evidence: {
          repository: 'jussray/founder-control-room',
          commitSha: SHA,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      readiness: 'ready_for_external_executor',
      authority: {
        approvalObserved: true,
        executionAllowed: false,
      },
      route: {
        provider: {
          id: 'github',
          supported: true,
          executionAllowed: false,
        },
      },
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
