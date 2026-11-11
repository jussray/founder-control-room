import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { quickScanRouter } from '../quickscan.js';
import { resetQuickScanStoreForTests } from '../../../quickscan/store.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/quickscan', quickScanRouter);
  return app;
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: FOUNDER_EMAIL } },
    error: null,
  });
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

beforeEach(() => {
  vi.clearAllMocks();
  resetQuickScanStoreForTests();
  supabaseMock.from.mockImplementation((table: string) =>
    table === 'founder_users' ? founderUsersRow() : {});
});

describe('QuickScan opportunity projection', () => {
  it('returns evidence-bound advisory opportunity state with each founder-visible prospect', async () => {
    founderSession();
    const app = buildApp();

    const created = await request(app)
      .post('/quickscan/prospects')
      .set('Authorization', BEARER)
      .send({
        businessName: 'Example Beauty Studio',
        ownerName: 'Owner',
        segment: 'salon_studio_team_owner',
      });

    expect(created.status).toBe(201);

    const response = await request(app)
      .get('/quickscan')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.body.prospects).toHaveLength(1);
    expect(response.body.prospects[0]).toMatchObject({
      id: created.body.prospect.id,
      opportunity: {
        contract: 'fcr/growth-opportunity-intelligence@v1',
        priorityBand: 'unknown',
        score: 0,
        recommendedStage: 'new',
        nextGate: 'collect_qualification_evidence',
        authority: {
          advisoryOnly: true,
          authorizesOutreach: false,
          authorizesLeadMutation: false,
          authorizesSpend: false,
        },
      },
    });
  });
});
