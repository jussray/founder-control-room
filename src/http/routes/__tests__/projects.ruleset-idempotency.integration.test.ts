import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
  mockProviderForProject,
  mockApplyBranchRuleset,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockProviderForProject: vi.fn(),
  mockApplyBranchRuleset: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: mockProviderForProject,
}));

import express from 'express';
import request from 'supertest';
import { projectsRouter } from '../projects.js';

const PROJECT_ID = 'project-uuid-001';
const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

const rulesetRequest = {
  idempotencyKey: 'shared-key',
  name: 'Protect main',
  enforcement: 'active',
  targetRefs: ['main'],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ['Quality Gate'],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [],
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
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
            id: PROJECT_ID,
            slug: 'test-project',
            repo_provider: 'github',
            repo_identifier: 'jussray/test-project',
          },
          error: null,
        }),
      }),
    }),
  };
}

function wireExistingExecution(execution: Record<string, unknown>) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-001', email: FOUNDER_EMAIL } },
    error: null,
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectsRow();
    if (table === 'approval_executions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: execution, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

describe('POST /projects/:slug/ruleset idempotency scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviderForProject.mockReturnValue({
      name: 'github',
      applyBranchRuleset: mockApplyBranchRuleset,
    });
  });

  it('rejects a successful key from a mission action without exposing its result', async () => {
    wireExistingExecution({
      id: 'execution-other',
      mission_id: 'mission-other',
      project_id: PROJECT_ID,
      action_type: 'merge',
      status: 'succeeded',
      result: { mergeCommitSha: 'other-action-result' },
    });

    const response = await request(buildApp())
      .post('/projects/test-project/ruleset')
      .set('Authorization', BEARER)
      .send(rulesetRequest);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_SCOPE_MISMATCH');
    expect(response.body.result).toBeUndefined();
    expect(mockProviderForProject).not.toHaveBeenCalled();
    expect(mockApplyBranchRuleset).not.toHaveBeenCalled();
  });

  it('returns same-project ruleset success as an idempotent retry', async () => {
    wireExistingExecution({
      id: 'execution-ruleset',
      mission_id: null,
      project_id: PROJECT_ID,
      action_type: 'apply_ruleset',
      status: 'succeeded',
      result: { rulesetId: 'ruleset-123' },
    });

    const response = await request(buildApp())
      .post('/projects/test-project/ruleset')
      .set('Authorization', BEARER)
      .send(rulesetRequest);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      idempotent: true,
      result: { rulesetId: 'ruleset-123' },
    });
    expect(mockProviderForProject).not.toHaveBeenCalled();
    expect(mockApplyBranchRuleset).not.toHaveBeenCalled();
  });
});
