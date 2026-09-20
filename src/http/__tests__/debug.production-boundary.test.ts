import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, fromMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: fromMock, rpc: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { debugRouter } from '../routes/debug.js';

function app() {
  const instance = express();
  instance.use('/_debug', debugRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('debug provider production boundary', () => {
  it('keeps the provider diagnostic available to development/CI without exposing values', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key-present-but-never-returned');

    const response = await request(app()).get('/_debug/provider');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: 'openai',
      mock: false,
      fallback: false,
      openaiKeyPresent: true,
      nodeEnv: 'test',
      environment: 'test',
    });
    expect(JSON.stringify(response.body)).not.toContain('test-key-present-but-never-returned');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('requires founder auth when the canonical Cloudflare runtime marker says production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ENVIRONMENT', 'production');

    const response = await request(app()).get('/_debug/provider');

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('provider');
    expect(response.body).not.toHaveProperty('openaiKeyPresent');
    expect(response.body).not.toHaveProperty('perplexityKeyPresent');
  });

  it('also fails closed for a Node production deployment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENVIRONMENT', 'test');

    const response = await request(app()).get('/_debug/provider');

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('provider');
  });
});
