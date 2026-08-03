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
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Preview one approved founder outreach email.',
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        approval: {
          id: 'founder-approved:outreach-preview-v1',
          actions: ['send-email'],
        },
        evidence: {
          proofUrls: ['https://example.com/unrelated-proof'],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.plan.readiness).toBe('blocked');
    const blocked = response.body.plan.truth.blocked.join(' ');
    expect(blocked).toContain('hubspot preflight evidence requires workspaceId');
    expect(blocked).toContain('hubspot preflight evidence requires at least one recordId');
    expect(blocked).toContain('hubspot preflight evidence requires associationPlan');
    expect(response.body.plan.authority.executionAllowed).toBe(false);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('blocks populated HubSpot identities when proof comes from an unrelated issuer', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Preview one approved founder outreach email.',
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        approval: {
          id: 'founder-approved:outreach-preview-v1',
          actions: ['send-email'],
        },
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

  it('accepts authoritative HubSpot context but still returns a non-executing preview', async () => {
    const response = await request(buildApp())
      .post('/founder-os/preview')
      .set('Authorization', BEARER)
      .send({
        goal: 'Preview one approved founder outreach email.',
        action: 'send-email',
        command: 'build',
        provider: 'hubspot',
        approval: {
          id: 'founder-approved:outreach-preview-v1',
          actions: ['send-email'],
        },
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
      readiness: 'ready_for_external_executor',
      authority: {
        approvalObserved: true,
        executionAllowed: false,
      },
      route: {
        provider: {
          id: 'hubspot',
          supported: true,
          executionAllowed: false,
          preflightEvidenceRequired: ['proofUrls'],
          preflightEvidenceObserved: ['proofUrls'],
          preflightEvidenceMissing: [],
        },
      },
    });
    expect(response.body.plan.truth.blocked).toEqual([]);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});
