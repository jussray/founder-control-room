import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const auth = vi.hoisted(() => ({ allow: false }));
const reads = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (_req: unknown, res: { status: (code: number) => { json: (value: unknown) => unknown } }, next: () => void) => {
    if (!auth.allow) return res.status(401).json({ error: 'Founder session required' });
    next();
  },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: reads }));

import { canonBootstrapRouter } from '../canonBootstrap.js';

describe('canonical knowledge bootstrap request guard', () => {
  it('rate-limits even unauthenticated requests before any database read', async () => {
    auth.allow = false;
    reads.from.mockClear();
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/canon', canonBootstrapRouter);
    const caller = '198.51.100.246';
    for (let i = 0; i < 30; i += 1) {
      const result = await request(app)
        .get('/api/canon/bootstrap?project=demo&key=state')
        .set('X-Forwarded-For', caller);
      expect(result.status).toBe(401);
    }
    const throttled = await request(app)
      .get('/api/canon/bootstrap?project=demo&key=state')
      .set('X-Forwarded-For', caller);
    expect(throttled.status).toBe(429);
    expect(throttled.body.error).toBe('Rate limit exceeded.');
    expect(reads.from).not.toHaveBeenCalled();
  });
});
