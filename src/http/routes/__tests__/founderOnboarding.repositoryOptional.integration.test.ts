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

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/onboarding', founderOnboardingRouter);
  return instance;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { email: FOUNDER_EMAIL },
          error: null,
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
});

describe('POST /onboarding/bootstrap repository optionality', () => {
  it('does not silently assign GitHub when the founder creates a project without a repository', async () => {
    let insertedProject: Record<string, unknown> | null = null;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();

      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertedProject = row;
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: 'project-1', ...row },
                  error: null,
                }),
              }),
            };
          },
        };
      }

      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }

      if (table === 'project_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }

      return {};
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project: {
          slug: 'repo-optional-project',
          name: 'Repo Optional Project',
        },
        providers: [],
      });

    expect(response.status).toBe(201);
    expect(insertedProject).toMatchObject({
      repo_provider: 'none',
      repo_identifier: null,
      status: 'active',
    });
    expect(response.body.project.repo_provider).toBe('none');
    expect(response.body.project.repo_identifier).toBeNull();
  });
});
