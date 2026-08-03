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

const BEARER = 'Bearer test-token';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPOSITORY = 'jussray/founder-control-room';
const GITHUB_PROOF = `https://github.com/${REPOSITORY}/commit/${SHA}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/founder-os', founderOsSkillsRouter);
  return app;
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

function previewBody(proofAccountId: string) {
  return {
    goal: 'Preview a Cloudflare deployment handoff.',
    action: 'deploy-code',
    command: 'loop',
    provider: 'cloudflare',
    approval: {
      id: 'founder-approved:cloudflare-preview',
      actions: ['deploy-code'],
    },
    evidence: {
      repository: REPOSITORY,
      commitSha: SHA,
      proofUrls: [
        GITHUB_PROOF,
        `https://dash.cloudflare.com/${proofAccountId}/pages/view/shared-name`,
      ],
      projectId: 'shared-name',
      providerAccountId: 'account-a',
    },
  };
}

describe('POST /founder-os/preview Cloudflare account evidence', () => {
  it('accepts the canonical account and project tuple without provider execution', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send(previewBody('account-a'));

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      readiness: 'ready_for_external_executor',
      authority: { executionAllowed: false },
      route: {
        provider: {
          id: 'cloudflare',
          preflightEvidenceRequired: [
            'repository',
            'commitSha',
            'proofUrls',
            'projectId',
            'providerAccountId',
          ],
          preflightEvidenceObserved: [
            'repository',
            'commitSha',
            'proofUrls',
            'projectId',
            'providerAccountId',
          ],
          preflightEvidenceMissing: [],
          executionAllowed: false,
        },
      },
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('blocks proof from another Cloudflare account with the same project name', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send(previewBody('attacker-account'));

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    expect(response.body.plan.truth.blocked.join(' ')).toContain(
      'account account-a and project shared-name',
    );
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
