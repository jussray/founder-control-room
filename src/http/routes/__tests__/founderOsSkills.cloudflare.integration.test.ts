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
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../../founder-os-lab/capabilityKernel.js';
import { founderOsSkillsRouter } from '../founderOsSkills.js';

const BEARER = 'Bearer test-token';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPOSITORY = 'jussray/founder-control-room';
const PROJECT = 'founder-control-room';
const GITHUB_PROOF = `https://github.com/${REPOSITORY}/commit/${SHA}`;
const GOAL = 'Preview a Cloudflare deployment handoff.';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/founder-os', founderOsSkillsRouter);
  return app;
}

function capabilityPlan(): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: GOAL,
    projectSlug: PROJECT,
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam'],
    routingReason: 'Chief AI selected the smallest deployment-preview capability set.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head repository proof', 'Cloudflare account-project identity'],
    outcomeSignals: ['deployment-handoff-evidence-complete'],
    rollback: 'Discard the preview and keep deployment execution disabled.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
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
  const selectedPlan = capabilityPlan();
  return {
    goal: GOAL,
    action: 'deploy-code',
    command: 'loop',
    provider: 'cloudflare',
    capabilityPlan: selectedPlan,
    approval: {
      id: 'founder-approved:cloudflare-preview',
      actions: ['deploy-code'],
      projectSlug: selectedPlan.projectSlug,
      expectedHeadSha: selectedPlan.expectedHeadSha,
      capabilityPlanHash: selectedPlan.planHash,
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
  it('accepts the canonical account and project tuple while keeping executor readiness behind registry resolution', async () => {
    const body = previewBody('account-a');
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      readiness: 'blocked',
      authority: {
        approvalObserved: true,
        capabilityPlanBound: true,
        executionAllowed: false,
      },
      route: {
        capabilityPlan: {
          observed: true,
          valid: true,
          planHash: body.capabilityPlan.planHash,
        },
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
    expect(response.body.plan.truth.blocked.join(' ')).toContain('Founder-approved capability registry snapshot');
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
