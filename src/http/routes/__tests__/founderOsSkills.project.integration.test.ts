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
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../../../founder-os-lab/projectAdapters.js';
import { founderOsSkillsRouter } from '../founderOsSkills.js';

const BEARER = 'Bearer test-token';
const ADAPTER = FOUNDER_OS_LAB_PROJECT_ADAPTERS[0];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/founder-os', founderOsSkillsRouter);
  return app;
}

function projectBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sekret-bip',
    sourceRepository: ADAPTER.repository,
    sourceCommitSha: ADAPTER.auditedSourceHead,
    contractUrls: ADAPTER.requiredContractPaths.map(
      (path) => `https://github.com/jussray/Sekret-Bip/blob/${ADAPTER.auditedSourceHead}/${path}`,
    ),
    audience: 'teen',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: 'founder@example.com' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error(`Unexpected persistence access: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { email: 'founder@example.com' },
            error: null,
          }),
        }),
      }),
    };
  });
});

describe('POST /founder-os/preview project adapter', () => {
  it('returns a source-bound, non-executing Se’kret Bip Figma preview', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Visualize the teen front door as editable traced layers.',
        action: 'plan',
        command: 'visualize',
        provider: 'figma',
        project: projectBody(),
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      status: 'simulated',
      plannerInvoked: true,
      violations: [],
      plan: {
        readiness: 'ready_for_review',
        authority: {
          level: 'L0',
          mode: 'simulation',
          executionAllowed: false,
        },
        route: {
          provider: {
            id: 'figma',
            mode: 'preview',
            executionAllowed: false,
          },
          project: {
            id: 'sekret-bip',
            repository: 'jussray/Sekret-Bip',
            sourceCommitSha: ADAPTER.auditedSourceHead,
            auditedSourceHead: ADAPTER.auditedSourceHead,
            audience: 'teen',
            executionAllowed: false,
            contractPathsRequired: ADAPTER.requiredContractPaths,
            contractPathsObserved: ADAPTER.requiredContractPaths,
            contractPathsMissing: [],
            canonicalDisplayNames: ['Night', 'Suhana', 'Sy', 'Cloud'],
            forbiddenDisplayNames: ['Suhanna'],
            legacyInternalIdsPreserved: true,
            editableOutputRequired: true,
            sourceTraceRequired: true,
            factualAiIdentityRequired: true,
          },
        },
      },
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
  });

  it('fails closed at the parser for unknown projects and malformed project URLs', async () => {
    const unknownProject = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Inspect an unknown project.',
        action: 'inspect',
        provider: 'github',
        project: projectBody({ id: 'unknown-project' }),
      });
    expect(unknownProject.status).toBe(400);
    expect(unknownProject.body.error).toContain('malformed or outside the checked-in registry');

    const malformedUrl = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Inspect project canon.',
        action: 'inspect',
        provider: 'github',
        project: projectBody({ contractUrls: ['http://example.com/not-allowed'] }),
      });
    expect(malformedUrl.status).toBe(400);
    expect(malformedUrl.body.error).toContain('malformed or outside the checked-in registry');
  });

  it('returns a blocked plan for unaudited source heads without touching project or provider state', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Inspect an unaudited Se’kret Bip head.',
        action: 'inspect',
        command: 'truthmode',
        provider: 'github',
        project: projectBody({
          sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    expect(response.body.plan.truth.blocked.join(' ')).toContain('has not been audited');
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(response.body.sandbox.capabilities).toMatchObject({
      network: false,
      providers: false,
      database: false,
      filesystem: false,
      environment: false,
      subprocess: false,
      secrets: false,
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('blocks V1 mutation requests even when founder approval is supplied', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Deploy the Se’kret Bip teen front door.',
        action: 'deploy-code',
        command: 'goalfix',
        provider: 'cloudflare',
        approval: {
          id: 'founder-approved:project-adapter-http-test',
          actions: ['deploy-code'],
        },
        project: projectBody(),
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    expect(response.body.plan.truth.blocked.join(' ')).toContain(
      'adapter supports only inspect and plan previews in V1',
    );
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
