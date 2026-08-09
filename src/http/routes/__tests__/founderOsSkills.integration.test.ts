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

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROJECT = 'founder-control-room';
const PROOF_URL = `https://github.com/jussray/founder-control-room/commit/${SHA}`;

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

function capabilityPlan(goal: string): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: PROJECT,
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam'],
    routingReason: 'Chief AI selected the smallest preview capability set.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head provider evidence'],
    outcomeSignals: ['preview-gate-classified'],
    rollback: 'Discard the preview and keep all provider execution disabled.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function boundApproval(action: 'merge-code', plan: V10CapabilityPlan) {
  return {
    id: 'founder-approved:preview-only',
    actions: [action],
    projectSlug: plan.projectSlug,
    expectedHeadSha: plan.expectedHeadSha,
    capabilityPlanHash: plan.planHash,
  };
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
      proofUrls: [PROOF_URL],
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

  it('rejects malformed capability-plan and plan-bound approval shapes', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        ...validPreview(),
        capabilityPlan: { contract: V10_CAPABILITY_PLAN_CONTRACT },
        approval: {
          id: 'founder-approved:preview-only',
          actions: ['merge-code'],
          expectedHeadSha: 'main',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('malformed or outside the checked-in registry');
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
          command: { id: 'confess' },
          capabilityPlan: {
            observed: false,
            valid: false,
            selectedBy: null,
          },
          provider: {
            id: 'github',
            mode: 'preview',
            supported: true,
            executionAllowed: false,
            preflightEvidenceRequired: [],
            preflightEvidenceObserved: [],
            preflightEvidenceMissing: [],
          },
        },
      },
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
  });

  it('returns a blocked plan when the provider cannot preview the selected action', async () => {
    founderSession();
    const goal = 'Preview the exact-head merge gate in Figma.';
    const selectedPlan = capabilityPlan(goal);

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'merge-code',
        command: 'loop',
        provider: 'figma',
        capabilityPlan: selectedPlan,
        approval: boundApproval('merge-code', selectedPlan),
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'simulated',
      plan: {
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
            planHash: selectedPlan.planHash,
          },
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

  it('blocks scoped approval when required provider evidence is absent', async () => {
    founderSession();
    const goal = 'Preview the exact-head merge gate.';
    const selectedPlan = capabilityPlan(goal);

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'merge-code',
        command: 'loop',
        provider: 'github',
        capabilityPlan: selectedPlan,
        approval: boundApproval('merge-code', selectedPlan),
      });

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      readiness: 'blocked',
      authority: {
        approvalObserved: true,
        capabilityPlanBound: true,
        executionAllowed: false,
      },
      route: {
        provider: {
          id: 'github',
          supported: true,
          executionAllowed: false,
          preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
          preflightEvidenceObserved: [],
          preflightEvidenceMissing: ['repository', 'commitSha', 'proofUrls'],
        },
      },
    });
    expect(response.body.plan.truth.blocked.join(' ')).toContain(
      'Missing required github preflight evidence: repository, commitSha, proofUrls',
    );
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('recognizes plan-bound approval and complete evidence but keeps executor readiness behind registry resolution', async () => {
    founderSession();
    const goal = 'Preview the exact-head merge gate.';
    const selectedPlan = capabilityPlan(goal);

    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'merge-code',
        command: 'loop',
        provider: 'github',
        capabilityPlan: selectedPlan,
        approval: boundApproval('merge-code', selectedPlan),
        evidence: {
          repository: 'jussray/founder-control-room',
          commitSha: SHA,
          proofUrls: [PROOF_URL],
        },
      });

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
          selectedBy: 'chief-ai-machine',
          planHash: selectedPlan.planHash,
        },
        provider: {
          id: 'github',
          supported: true,
          executionAllowed: false,
          preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
          preflightEvidenceObserved: ['repository', 'commitSha', 'proofUrls'],
          preflightEvidenceMissing: [],
        },
      },
    });
    expect(response.body.plan.truth.blocked.join(' ')).toContain('Founder-approved capability registry snapshot');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
