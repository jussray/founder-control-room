import { describe, expect, it, vi } from 'vitest';

// The limiter must run before any identity or allowlist lookup, so these
// probes never need a working Supabase client.
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('unused') })) } },
  createSupabaseAuthClient: () => ({ auth: {} }),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn() } }));

import express from 'express';
import request from 'supertest';
import { authRouter } from '../auth.js';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/auth', authRouter);
  return instance;
}

async function statusUntilThrottled(send: () => Promise<number>, ceiling: number): Promise<number> {
  let status = 0;
  for (let attempt = 0; attempt < ceiling; attempt += 1) {
    status = await send();
    if (status === 429) break;
  }
  return status;
}

describe('founder auth route rate limits', () => {
  it('throttles founder session handoff before any identity lookup', async () => {
    const probe = app();
    const status = await statusUntilThrottled(
      async () => (await request(probe).post('/auth/session').send({})).status,
      70,
    );
    expect(status).toBe(429);
  });

  it('throttles unauthenticated founder invite probing before the founder check', async () => {
    const probe = app();
    const status = await statusUntilThrottled(
      async () => (await request(probe).post('/auth/founder/invite').send({ email: 'someone@example.com' })).status,
      40,
    );
    expect(status).toBe(429);
  });
});
