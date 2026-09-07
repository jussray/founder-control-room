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

function validCapitalPreview() {
  return {
    decisionId: 'seed-round-1',
    projectId: 'founder-control-room',
    legalEntityId: 'juss-labs-llc',
    capitalLaneId: 'seed',
    milestoneUnlocked: 'Prove 100 paying customers.',
    nextFinancingTrigger: 'Raise again only after 100 paying customers and 30% repeat.',
    expectedRunwayMonths: 12,
    currency: 'USD',
    preMoneyCents: 1_000_000_000,
    raiseAmountCents: 300_000_000,
    asOf: '2026-09-06T20:00:00.000Z',
    observedAt: '2026-09-06T19:00:00.000Z',
    maxEvidenceAgeDays: 30,
    instrument: 'SAFE',
    economicRightsKnown: true,
    controlRightsKnown: true,
    optionsBefore: ['80M strategic exit', 'remain independent'],
    optionsAfter: ['remain independent'],
    classification: 'VERIFIED',
    evidenceRefs: ['evidence:term-sheet-draft'],
    maxDilutionPct: 25,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
});

describe('POST /founder-os/capital-preview', () => {
  it('rejects requests without a founder session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } });

    const response = await request(buildApp())
      .post('/founder-os/capital-preview')
      .send(validCapitalPreview());

    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('returns a founder-only capital decision card with no financing authority', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/capital-preview')
      .set('Authorization', BEARER)
      .send(validCapitalPreview());

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.card).toMatchObject({
      contract: 'juss-v10/founder-capital-decision-card@v1',
      decisionId: 'seed-round-1',
      planning: {
        milestoneUnlocked: 'Prove 100 paying customers.',
        expectedRunwayMonths: 12,
      },
      capital: {
        classification: 'VERIFIED',
        currency: 'USD',
        postMoneyValuationCents: 1_300_000_000,
      },
      termBurden: {
        classification: 'VERIFIED',
        completeness: 'COMPLETE',
        instrument: 'SAFE',
      },
      optionality: {
        classification: 'VERIFIED',
        state: 'CONSTRAINED',
        preservedOptions: ['remain independent'],
        weakenedOptions: ['80M strategic exit'],
        addedOptions: [],
      },
      verdict: {
        state: 'HOLD',
      },
      authority: {
        authorizesMerge: false,
        authorizesDeploy: false,
        authorizesPublish: false,
        authorizesSpend: false,
        authorizesFundraise: false,
        authorizesExternalContact: false,
      },
    });
    expect(response.body.card.capital.impliedDilutionPct).toBeCloseTo(23.076923, 5);
    expect(response.body.card.verdict.reasons).toContain('falsifier:unknown');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('founder_users');
  });

  it('fails closed when capital evidence is stale', async () => {
    founderSession();
    const payload = validCapitalPreview();
    payload.observedAt = '2026-07-01T00:00:00.000Z';

    const response = await request(buildApp())
      .post('/founder-os/capital-preview')
      .set('Authorization', BEARER)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.card.capital.classification).toBe('UNKNOWN');
    expect(response.body.card.capital.impliedDilutionPct).toBeNull();
    expect(response.body.card.verdict.state).toBe('HOLD');
    expect(response.body.card.verdict.reasons).toContain('dimension:economics:unknown');
    expect(response.body.card.diagnostics.terms).toContain('pre_money:stale_evidence');
    expect(response.body.card.diagnostics.terms).toContain('raise_amount:stale_evidence');
  });

  it('falsifies the path when verified dilution exceeds the founder ceiling', async () => {
    founderSession();
    const payload = validCapitalPreview();
    payload.maxDilutionPct = 20;

    const response = await request(buildApp())
      .post('/founder-os/capital-preview')
      .set('Authorization', BEARER)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.card.verdict.state).toBe('FALSIFIED');
    expect(response.body.card.verdict.reasons).toContain('stop_condition:triggered');
    expect(response.body.card.authority.authorizesFundraise).toBe(false);
  });

  it('rejects unsupported request fields', async () => {
    founderSession();

    const response = await request(buildApp())
      .post('/founder-os/capital-preview')
      .set('Authorization', BEARER)
      .send({ ...validCapitalPreview(), recommendation: 'raise now' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('unsupported fields');
  });
});
