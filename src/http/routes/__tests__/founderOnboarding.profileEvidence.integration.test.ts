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
import { founderOnboardingRouter } from '../founderOnboarding.js';

const BEARER = 'Bearer test-token';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/onboarding', founderOnboardingRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: 'founder@example.com' } },
    error: null,
  });
});

describe('GET /onboarding/state profile evidence isolation', () => {
  it('keeps project and connection truth available when profile-event evidence cannot be read', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') {
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
      }
      if (table === 'projects') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [{
                id: 'project-1',
                slug: 'example-project',
                name: 'Example Project',
                repo_provider: 'none',
                repo_identifier: null,
                stack: null,
                status: 'active',
                risk_level: 'medium',
              }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'project_connections') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: null,
                error: { message: 'profile evidence temporarily unavailable' },
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await request(app())
      .get('/onboarding/state')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.body.complete).toBe(true);
    expect(response.body.projects).toHaveLength(1);
    expect(response.body.projects[0]).toMatchObject({
      slug: 'example-project',
      controlRoomProfile: null,
      connections: [],
    });
    expect(response.body.composerProfileEvidence).toEqual({
      status: 'unavailable',
      founderDeclared: true,
      authorityGranted: false,
    });
  });
});
