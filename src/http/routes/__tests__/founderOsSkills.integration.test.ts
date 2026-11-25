import { readFileSync } from 'node:fs';
import { boundFounderRow } from './founderAuthFixture.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    ...boundFounderRow(FOUNDER_EMAIL, 'founder-user-1'),
  };
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL, email_confirmed_at: '2026-11-15T00:00:00Z' } },
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


describe('GET /founder-os/distribution/skills', () => {
  const PIN = 'de476e73754ca9616cb7ed178e1ff9c2f84416ba';
  const READ_TOKEN = 'test-fcr-distribution-read-token-at-least-24-chars';
  const upstreamBody = {
    repo: 'jussray/ULTRATHINK-',
    repo_sha: PIN,
    kernel_status: 'draft',
    skills: [
      { name: 'juss-os', version: '3.1.1', repo_sha: PIN },
      { name: 'truthmode', version: '1', repo_sha: PIN },
    ],
  };
  const upstreamResponse = (payload: unknown = upstreamBody, state = 'current', status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Distribution-State': state },
    });

  beforeEach(() => {
    vi.stubEnv('FCR_DISTRIBUTION_READ_TOKEN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('requires the existing founder session before reading any distribution data', async () => {
    vi.stubEnv('FCR_DISTRIBUTION_READ_TOKEN', READ_TOKEN);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });
    const response = await request(buildApp()).get('/founder-os/distribution/skills');
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed without a scoped server-held token', async () => {
    founderSession();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(buildApp()).get('/founder-os/distribution/skills')
      .set('Authorization', BEARER);
    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.reason).toBe('distribution_client_not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the fixed upstream with a server token and returns only an exact-SHA receipt', async () => {
    founderSession();
    vi.stubEnv('FCR_DISTRIBUTION_READ_TOKEN', READ_TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(buildApp()).get('/founder-os/distribution/skills')
      .set('Authorization', BEARER);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      contract: 'juss/fcr-distribution-read@v1',
      status: 'source_observed',
      executionAllowed: false,
      canonicalizationGranted: false,
      repo: 'jussray/ULTRATHINK-',
      repo_sha: PIN,
      kernel_status: 'draft',
      skill_names: ['juss-os', 'truthmode'],
    });
    expect(JSON.stringify(response.body)).not.toContain(READ_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://juss-distribution.mcgill-raylene.workers.dev/api/v1/skills');
    expect(options).toMatchObject({
      method: 'GET', headers: { Authorization: `Bearer ${READ_TOKEN}`, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store',
    });
  });

  it.each([
    ['stale cache', () => upstreamResponse(upstreamBody, 'stale')],
    ['wrong repository', () => upstreamResponse({ ...upstreamBody, repo: 'somebody/else' })],
    ['moved repository SHA', () => upstreamResponse({ ...upstreamBody, repo_sha: 'f'.repeat(40) })],
    ['mismatched skill source', () => upstreamResponse({ ...upstreamBody, skills: [{ name: 'juss-os', version: '3.1.1', repo_sha: 'f'.repeat(40) }] })],
    ['upstream unauthorized', () => upstreamResponse({ error: 'unauthorized' }, 'current', 401)],
    ['missing kernel', () => upstreamResponse({ ...upstreamBody, skills: [{ name: 'truthmode', version: '1', repo_sha: PIN }] })],
  ])('blocks %s instead of fabricating a successful council receipt', async (_name, fixture) => {
    founderSession();
    vi.stubEnv('FCR_DISTRIBUTION_READ_TOKEN', READ_TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fixture()));
    const response = await request(buildApp()).get('/founder-os/distribution/skills')
      .set('Authorization', BEARER);
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ status: 'blocked', reason: 'distribution_unverified' });
  });

  it('does not expose downstream network errors or token values', async () => {
    founderSession();
    vi.stubEnv('FCR_DISTRIBUTION_READ_TOKEN', READ_TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sensitive downstream detail')));
    const response = await request(buildApp()).get('/founder-os/distribution/skills')
      .set('Authorization', BEARER);
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(JSON.stringify(response.body)).not.toContain(READ_TOKEN);
  });
});

describe('GET /founder-os/external-skills', () => {
  it('requires founder authentication', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });
    const response = await request(buildApp()).get('/founder-os/external-skills');
    expect(response.status).toBe(401);
  });
  it('lists fifteen quarantined candidates with no execution authority', async () => {
    founderSession();
    const response = await request(buildApp()).get('/founder-os/external-skills').set('Authorization', BEARER);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.executionAllowed).toBe(false);
    expect(response.body.skills).toHaveLength(15);
    expect(response.body.skills.every((row: { executionAllowed: boolean }) => row.executionAllowed === false)).toBe(true);
  });
  it('filters by destination and rejects unknown or repeated destinations', async () => {
    founderSession();
    const filtered = await request(buildApp()).get('/founder-os/external-skills?destination=medusa').set('Authorization', BEARER);
    expect(filtered.status).toBe(200);
    expect(filtered.body.skills.map((row: { id: string }) => row.id)).toEqual(['skillspector']);
    for (const query of ['destination=unknown', 'destination=chief&destination=fcr']) {
      const invalid = await request(buildApp()).get('/founder-os/external-skills?' + query).set('Authorization', BEARER);
      expect(invalid.status).toBe(400);
    }
  });
});


describe('GET /founder-os/security-skills/catalog', () => {
  const url = '/founder-os/security-skills/catalog';
  it('denies unauthenticated access', async () => {
    const response = await request(buildApp()).get(url);
    expect(response.status).toBe(401);
    expect(response.body.records).toBeUndefined();
  });
  it('denies an authenticated identity not bound to the founder row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user', email: FOUNDER_EMAIL, email_confirmed_at: '2026-11-15T00:00:00Z' } }, error: null });
    const response = await request(buildApp()).get(url).set('Authorization', BEARER);
    expect(response.status).toBe(403);
    expect(response.body.records).toBeUndefined();
  });
  it('returns only the pinned metadata snapshot to the founder without fetching external content', async () => {
    founderSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await request(buildApp()).get(url).set('Authorization', BEARER);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(JSON.parse(readFileSync('docs/security-skill-catalog.v1.json', 'utf8')));
      expect(response.body.execution_enabled).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(supabaseMock.from).toHaveBeenCalledTimes(1);
      expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('does not expose a write method', async () => {
    founderSession();
    const response = await request(buildApp()).post(url).set('Authorization', BEARER).send({ execution_enabled: true });
    expect(response.status).toBe(404);
  });
});
