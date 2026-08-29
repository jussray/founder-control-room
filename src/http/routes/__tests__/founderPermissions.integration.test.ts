import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rows, mockGetUser, interactiveSession } = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  mockGetUser: vi.fn(),
  interactiveSession: { enabled: false },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));

vi.mock('../../../auth/founderSession.js', async () => {
  const actual = await vi.importActual<typeof import('../../../auth/founderSession.js')>('../../../auth/founderSession.js');
  return {
    ...actual,
    readFounderSession: vi.fn(() => interactiveSession.enabled
      ? { accessToken: 'browser-founder-token', refreshToken: 'browser-founder-refresh' }
      : null),
  };
});

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'founder_users') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { email: 'founder@example.com' }, error: null }) };
        return chain;
      }
      if (table !== 'founder_permission_requests') throw new Error(`unexpected table: ${table}`);
      let operation: 'read' | 'insert' | 'update' = 'read';
      let payload: Record<string, unknown> = {};
      const filters = new Map<string, unknown>();
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (field: string, value: unknown) => { filters.set(field, value); return chain; },
        insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return chain; },
        update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; return chain; },
        maybeSingle: async () => {
          const requestId = String(filters.get('request_id') ?? '');
          const existing = rows.get(requestId) ?? null;
          if (operation === 'read') return { data: existing, error: null };
          if (operation === 'update') {
            if (!existing || (filters.has('status') && existing.status !== filters.get('status'))) return { data: null, error: null };
            const updated = { ...existing, ...payload };
            rows.set(requestId, updated);
            return { data: updated, error: null };
          }
          throw new Error('maybeSingle is not valid for insert in this test');
        },
        single: async () => {
          if (operation !== 'insert') throw new Error('single expected insert');
          const requestId = String(payload.request_id ?? '');
          const inserted = {
            ...payload,
            decision: null,
            decision_hash: null,
            decision_surface: null,
            requested_at: '2026-08-25T09:15:00.000Z',
            decided_at: null,
            consumed_at: null,
          };
          rows.set(requestId, inserted);
          return { data: inserted, error: null };
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: [...rows.values()], error: null }),
      };
      return chain;
    }),
  },
}));

import request from 'supertest';
import { createServer } from '../../server.js';

const bearer = 'Bearer test-founder-token';
const proposal = {
  proposalId: 'mission-ask-founder',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'merge',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};

describe('founder permission broker HTTP contract', () => {
  beforeEach(() => {
    rows.clear();
    interactiveSession.enabled = false;
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'founder@example.com' } }, error: null });
  });

  it('lets a bearer-authenticated agent ask but not self-approve', async () => {
    const app = createServer();
    const created = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-001', requestedBySurface: 'chatgpt', proposal, note: 'Approve this exact candidate?' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(created.body.founderPermissionSatisfied).toBe(false);
    expect(created.body.independentReviewSatisfied).toBeNull();

    const bearerOnlyDecision = await request(app)
      .post('/mcp/founder-permissions/requests/permission:ask-founder-001/decision')
      .set('Authorization', bearer)
      .send({ decision: 'approved', surface: 'chatgpt' });
    expect(bearerOnlyDecision.status).toBe(403);
    expect(bearerOnlyDecision.body.code).toBe('FOUNDER_INTERACTIVE_APPROVAL_REQUIRED');

    interactiveSession.enabled = true;
    const approved = await request(app)
      .post('/mcp/founder-permissions/requests/permission:ask-founder-001/decision')
      .set('Authorization', bearer)
      .send({ decision: 'approved', surface: 'chatgpt' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.founderPermissionSatisfied).toBe(true);
    expect(approved.body.independentReviewSatisfied).toBeNull();
    expect(approved.body.decisionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed when the same request id is reused for another proposal', async () => {
    const app = createServer();
    const first = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-002', requestedBySurface: 'claude', proposal });
    expect(first.status).toBe(201);
    const conflicting = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-002', requestedBySurface: 'claude', proposal: { ...proposal, expectedHeadSha: 'd'.repeat(40) } });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('FOUNDER_PERMISSION_SCOPE_MISMATCH');
  });

  it('does not let a later approval overwrite an existing rejection', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-003', requestedBySurface: 'perplexity', proposal });
    interactiveSession.enabled = true;
    const rejected = await request(app).post('/mcp/founder-permissions/requests/permission:ask-founder-003/decision').set('Authorization', bearer)
      .send({ decision: 'rejected', surface: 'perplexity' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.founderPermissionSatisfied).toBe(false);
    const overwrite = await request(app).post('/mcp/founder-permissions/requests/permission:ask-founder-003/decision').set('Authorization', bearer)
      .send({ decision: 'approved', surface: 'perplexity' });
    expect(overwrite.status).toBe(409);
    expect(overwrite.body.code).toBe('FOUNDER_PERMISSION_ALREADY_DECIDED');
  });

  it('rate limits repeated broker requests before founder authorization work can be abused', async () => {
    const app = createServer();
    const sourceIp = '203.0.113.77';
    const makeRequest = () => request(app)
      .get('/mcp/founder-permissions/requests')
      .set('Authorization', bearer)
      .set('X-Forwarded-For', sourceIp);

    const first = await makeRequest();
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-limit']).toBe('60');

    const remaining = Number(first.headers['ratelimit-remaining']);
    expect(Number.isInteger(remaining)).toBe(true);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(60);

    const withinLimit = await Promise.all(
      Array.from({ length: remaining }, () => makeRequest()),
    );
    expect(withinLimit.every((response) => response.status === 200)).toBe(true);

    const limited = await makeRequest();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'Rate limit exceeded.' });
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
