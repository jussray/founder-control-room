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
const PROJECT = 'founder-control-room';

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
        maybeSingle: () => Promise.resolve({ data: { email: 'founder@example.com' }, error: null }),
      }),
    }),
  };
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
    routingReason: 'Chief AI selected the smallest provider-evidence review plan.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['provider-bound evidence'],
    outcomeSignals: ['provider-evidence-classified'],
    rollback: 'Discard the preview and keep provider execution disabled.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function mutationEnvelope(goal: string, action: 'merge-code' | 'send-email') {
  const selectedPlan = capabilityPlan(goal);
  return {
    capabilityPlan: selectedPlan,
    approval: {
      id: action === 'merge-code'
        ? 'founder-approved:preview-only'
        : 'founder-approved:outreach-preview-v1',
      actions: [action],
      projectSlug: selectedPlan.projectSlug,
      expectedHeadSha: selectedPlan.expectedHeadSha,
      capabilityPlanHash: selectedPlan.planHash,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: 'founder@example.com' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
});

describe('POST /founder-os/preview provider evidence semantics', () => {
  it('blocks GitHub evidence whose proof URL belongs to another source target', async () => {
    const goal = 'Preview the exact-head merge gate.';
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'merge-code',
        command: 'loop',
        provider: 'github',
        ...mutationEnvelope(goal, 'merge-code'),
        evidence: {
          repository: 'jussray/founder-control-room',
          commitSha: SHA,
          proofUrls: [
            'https://github.com/another-owner/another-repo/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    expect(response.body.plan.route.provider.preflightEvidenceMissing).toEqual([]);
    expect(response.body.plan.truth.blocked.join(' ')).toContain(
      `github proof requires an authoritative GitHub commit URL for repository jussray/founder-control-room at commit ${SHA}`,
    );
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('blocks attacker-host URLs that only imitate a GitHub repository and SHA path', async () => {
    const goal = 'Preview the exact-head merge gate.';
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'merge-code',
        command: 'loop',
        provider: 'github',
        ...mutationEnvelope(goal, 'merge-code'),
        evidence: {
          repository: 'jussray/founder-control-room',
          commitSha: SHA,
          proofUrls: [
            `https://example.com/jussray/founder-control-room/commit/${SHA}`,
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    expect(response.body.plan.truth.blocked.join(' ')).toContain('authoritative GitHub commit URL');
    expect(response.body.plan.authority.executionAllowed).toBe(false);
  });

  it('blocks HubSpot outreach when an unrelated URL is the only evidence', async () => {
    const goal = 'Preview one approved founder outreach email.';
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        ...mutationEnvelope(goal, 'send-email'),
        evidence: {
          proofUrls: ['https://example.com/unrelated-proof'],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    const blocked = response.body.plan.truth.blocked.join(' ');
    expect(blocked).toContain('hubspot preflight evidence requires workspaceId');
    expect(blocked).toContain('hubspot preflight evidence requires at least one nonempty typed recordId');
    expect(blocked).toContain('hubspot preflight evidence requires associationPlan');
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('blocks populated HubSpot identities when proof comes from an unrelated issuer', async () => {
    const goal = 'Preview one approved founder outreach email.';
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        ...mutationEnvelope(goal, 'send-email'),
        evidence: {
          proofUrls: ['https://example.com/123456/789/456'],
          workspaceId: '123456',
          recordIds: ['contact:789', 'company:456'],
          associationPlan: 'Associate contact:789 with company:456 before a separately approved send.',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    const blocked = response.body.plan.truth.blocked.join(' ');
    expect(blocked).toContain('hubspot proof does not identify workspace 123456');
    expect(blocked).toContain('hubspot proof does not identify record contact:789');
    expect(blocked).toContain('hubspot proof does not identify record company:456');
    expect(response.body.plan.authority.executionAllowed).toBe(false);
  });

  it('accepts authoritative HubSpot context but keeps outbound dispatch at review-only', async () => {
    const goal = 'Preview one approved founder outreach email.';
    const envelope = mutationEnvelope(goal, 'send-email');
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal,
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        ...envelope,
        evidence: {
          proofUrls: [
            'https://app.hubspot.com/contacts/123456/record/0-1/789',
            'https://app.hubspot.com/contacts/123456/record/0-2/456',
          ],
          workspaceId: '123456',
          recordIds: ['contact:789', 'company:456'],
          associationPlan: 'Associate contact:789 with company:456 before a separately approved send.',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      readiness: 'ready_for_review',
      authority: {
        approvalObserved: true,
        capabilityPlanBound: true,
        executionAllowed: false,
      },
      route: {
        capabilityPlan: {
          observed: true,
          valid: true,
          planHash: envelope.capabilityPlan.planHash,
        },
        provider: {
          id: 'hubspot',
          supported: true,
          executionAllowed: false,
          preflightEvidenceRequired: ['proofUrls', 'workspaceId', 'recordIds', 'associationPlan'],
          preflightEvidenceObserved: ['proofUrls', 'workspaceId', 'recordIds', 'associationPlan'],
          preflightEvidenceMissing: [],
        },
      },
    });
    expect(response.body.plan.truth.blocked).toEqual([]);
    expect(response.body.plan.nextGate).toContain('DispatchDecision');
    expect(response.body.plan.nextGate).toContain('consent');
    expect(response.body.plan.nextGate).toContain('suppression');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
