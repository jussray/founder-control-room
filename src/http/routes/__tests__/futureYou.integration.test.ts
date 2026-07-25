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
import { futureYouRouter } from '../futureYou.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const PROJECT_ID = 'project-1';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/futureyou', futureYouRouter);
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /futureyou/v8/brief', () => {
  it('rejects requests without a founder session', async () => {
    const response = await request(buildApp()).get('/futureyou/v8/brief');
    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('returns a read-only evidence-aware brief for an allowlisted founder', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({
                data: [{
                  id: 'mission-1',
                  project_id: PROJECT_ID,
                  title: 'Review payment automation proof',
                  description: null,
                  status: 'in_review',
                  risk_level: 'high',
                  updated_at: '2026-07-24T18:00:00.000Z',
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({
                data: [{
                  id: 'event-1',
                  project_id: PROJECT_ID,
                  event_type: 'provider_delivery_failed',
                  severity: 'critical',
                  screen: 'provider-webhook',
                  metadata: { provider: 'example' },
                  created_at: '2026-07-24T19:00:00.000Z',
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: PROJECT_ID, slug: 'founder-control-room', name: 'Founder Control Room' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const response = await request(buildApp())
      .get('/futureyou/v8/brief')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.version).toBe('futureyou-v8');
    expect(response.body.priorities[0]).toMatchObject({
      source: 'mission',
      authority: { level: 'L3', requiresExplicitApproval: true },
    });
    expect(response.body.blindSpots).toContain(
      'No verified revenue or expected-value feed is connected to this read model; rankings are operational, not financial forecasts.',
    );
  });
});
