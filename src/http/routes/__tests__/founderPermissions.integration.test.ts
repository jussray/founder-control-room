import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rows, mockGetUser, interactiveSession, raceNextInsert } = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  mockGetUser: vi.fn(),
  interactiveSession: { enabled: false },
  raceNextInsert: { enabled: false },
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
      ? {
        accessToken: 'browser-founder-token',
        refreshToken: 'browser-founder-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      }
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
      const filters: Array<{ field: string; op: 'eq' | 'is' | 'gt'; value: unknown }> = [];
      const matches = (row: Record<string, unknown>): boolean => filters.every(({ field, op, value }) => {
        if (op === 'eq') return row[field] === value;
        if (op === 'is') return row[field] === value || (value === null && row[field] == null);
        if (op === 'gt') return String(row[field] ?? '') > String(value ?? '');
        return false;
      });
      const insertedRow = () => ({
        ...payload,
        decision: null,
        decision_hash: null,
        decision_surface: null,
        requested_at: '2026-08-29T05:00:00.000Z',
        decided_at: null,
        expires_at: null,
        revoked_at: null,
        consumed_at: null,
      });
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (field: string, value: unknown) => { filters.push({ field, op: 'eq', value }); return chain; },
        is: (field: string, value: unknown) => { filters.push({ field, op: 'is', value }); return chain; },
        gt: (field: string, value: unknown) => { filters.push({ field, op: 'gt', value }); return chain; },
        insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return chain; },
        update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; return chain; },
        maybeSingle: async () => {
          const requestIdFilter = filters.find((filter) => filter.field === 'request_id' && filter.op === 'eq');
          const requestId = String(requestIdFilter?.value ?? '');
          const existing = rows.get(requestId) ?? null;
          if (operation === 'read') return { data: existing && matches(existing) ? existing : null, error: null };
          if (operation === 'update') {
            if (!existing || !matches(existing)) return { data: null, error: null };
            const updated = { ...existing, ...payload };
            rows.set(requestId, updated);
            return { data: updated, error: null };
          }
          throw new Error('maybeSingle is not valid for insert in this test');
        },
        single: async () => {
          if (operation !== 'insert') throw new Error('single expected insert');
          const requestId = String(payload.request_id ?? '');
          const inserted = insertedRow();
          if (raceNextInsert.enabled) {
            raceNextInsert.enabled = false;
            rows.set(requestId, inserted);
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
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
const origin = 'http://localhost:8787';
const proposal = {
  proposalId: 'mission-ask-founder',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'merge',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};
const actionTarget = {
  type: 'merge',
  repo: 'jussray/founder-control-room',
  pullRequestNumber: 727,
  baseSha: 'd'.repeat(40),
  headSha: 'b'.repeat(40),
};

function founderUser(id = '11111111-1111-4111-8111-111111111111') {
  return { data: { user: { id, email: 'founder@example.com' } }, error: null };
}

function interactivePost(app: ReturnType<typeof createServer>, path: string) {
  return request(app)
    .post(path)
    .set('Authorization', bearer)
    .set('Origin', origin)
    .set('Sec-Fetch-Site', 'same-origin');
}

describe('founder permission broker HTTP contract', () => {
  beforeEach(() => {
    rows.clear();
    interactiveSession.enabled = false;
    raceNextInsert.enabled = false;
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue(founderUser());
  });

  it('lets an agent ask but requires an independently authenticated browser session to decide', async () => {
    const app = createServer();
    const created = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-001', requestedBySurface: 'chatgpt', proposal, actionTarget, note: 'Approve this exact candidate?' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(created.body.founderPermissionSatisfied).toBe(false);
    expect(created.body.executionAuthorized).toBe(false);

    const bearerOnlyDecision = await request(app)
      .post('/mcp/founder-permissions/requests/permission:ask-founder-001/decision')
      .set('Authorization', bearer)
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ decision: 'approved' });
    expect(bearerOnlyDecision.status).toBe(401);

    interactiveSession.enabled = true;
    const unattestedSurface = await interactivePost(app, '/mcp/founder-permissions/requests/permission:ask-founder-001/decision')
      .send({ decision: 'approved', surface: 'chatgpt' });
    expect(unattestedSurface.status).toBe(400);
    expect(unattestedSurface.body.code).toBe('FOUNDER_PERMISSION_UNATTESTED_DECISION_SURFACE');

    const approved = await interactivePost(app, '/mcp/founder-permissions/requests/permission:ask-founder-001/decision')
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.decisionSurface).toBe('fcr');
    expect(approved.body.decision.executionAuthorized).toBe(false);
    expect(approved.body.executionAuthorized).toBe(false);
    expect(approved.body.founderPermissionSatisfied).toBe(true);
    expect(approved.body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(approved.body.independentReviewSatisfied).toBeNull();
  });

  it('ignores bearer identity when authenticating the interactive decision cookie', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:cookie-authority-001', requestedBySurface: 'chatgpt', proposal, actionTarget });
    interactiveSession.enabled = true;
    mockGetUser.mockImplementation(async (token: string) => token === 'browser-founder-token'
      ? founderUser('22222222-2222-4222-8222-222222222222')
      : { data: { user: { id: 'agent-id', email: 'agent@example.com' } }, error: null });

    const approved = await interactivePost(app, '/mcp/founder-permissions/requests/permission:cookie-authority-001/decision')
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(rows.get('permission:cookie-authority-001')?.founder_user_id)
      .toBe('22222222-2222-4222-8222-222222222222');
  });

  it('requires a browser Origin even when a bearer header is present', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:origin-001', requestedBySurface: 'chatgpt', proposal, actionTarget });
    interactiveSession.enabled = true;
    const noBrowserOrigin = await request(app)
      .post('/mcp/founder-permissions/requests/permission:origin-001/decision')
      .set('Authorization', bearer)
      .send({ decision: 'approved' });
    expect(noBrowserOrigin.status).toBe(403);
    expect(noBrowserOrigin.body.code).toBe('FOUNDER_INTERACTIVE_APPROVAL_REQUIRED');
  });

  it('consumes a fresh approval exactly once and removes satisfied state', async () => {
    const app = createServer();
    const created = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:consume-001', requestedBySurface: 'claude', proposal, actionTarget });
    expect(created.status).toBe(201);
    interactiveSession.enabled = true;
    const approved = await interactivePost(app, '/mcp/founder-permissions/requests/permission:consume-001/decision')
      .send({ decision: 'approved' });
    expect(approved.body.founderPermissionSatisfied).toBe(true);

    const consumed = await request(app)
      .post('/mcp/founder-permissions/requests/permission:consume-001/consume')
      .set('Authorization', bearer)
      .send({ requestHash: approved.body.requestHash, decisionHash: approved.body.decisionHash });
    expect(consumed.status).toBe(200);
    expect(consumed.body.consumed).toBe(true);
    expect(consumed.body.founderPermissionSatisfied).toBe(false);
    expect(consumed.body.executionAuthorized).toBe(false);

    const replay = await request(app)
      .post('/mcp/founder-permissions/requests/permission:consume-001/consume')
      .set('Authorization', bearer)
      .send({ requestHash: approved.body.requestHash, decisionHash: approved.body.decisionHash });
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('FOUNDER_PERMISSION_NOT_CONSUMABLE');
  });

  it('rejects an approval whose persisted expiry exceeds the 20-minute founder decision window', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:extended-expiry-001', requestedBySurface: 'claude', proposal, actionTarget });
    interactiveSession.enabled = true;
    const approved = await interactivePost(app, '/mcp/founder-permissions/requests/permission:extended-expiry-001/decision')
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.founderPermissionSatisfied).toBe(true);

    const stored = rows.get('permission:extended-expiry-001');
    expect(stored).toBeDefined();
    const decidedAt = String(stored?.decided_at ?? '');
    expect(Number.isFinite(Date.parse(decidedAt))).toBe(true);
    stored!.expires_at = new Date(Date.parse(decidedAt) + (20 * 60 * 1000) + 1).toISOString();

    const observed = await request(app)
      .get('/mcp/founder-permissions/requests/permission:extended-expiry-001')
      .set('Authorization', bearer);
    expect(observed.status).toBe(200);
    expect(observed.body.founderPermissionSatisfied).toBe(false);

    const consumed = await request(app)
      .post('/mcp/founder-permissions/requests/permission:extended-expiry-001/consume')
      .set('Authorization', bearer)
      .send({ requestHash: approved.body.requestHash, decisionHash: approved.body.decisionHash });
    expect(consumed.status).toBe(409);
    expect(consumed.body.code).toBe('FOUNDER_PERMISSION_NOT_CONSUMABLE');
  });

  it('lets the interactive founder revoke an unconsumed approval', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:revoke-001', requestedBySurface: 'perplexity', proposal, actionTarget });
    interactiveSession.enabled = true;
    const approved = await interactivePost(app, '/mcp/founder-permissions/requests/permission:revoke-001/decision')
      .send({ decision: 'approved' });
    expect(approved.body.founderPermissionSatisfied).toBe(true);

    const revoked = await interactivePost(app, '/mcp/founder-permissions/requests/permission:revoke-001/revoke').send({});
    expect(revoked.status).toBe(200);
    expect(revoked.body.revoked).toBe(true);
    expect(revoked.body.founderPermissionSatisfied).toBe(false);
  });

  it('does not let a stale decision resurrect a revoked pending request', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:revoked-pending-001', requestedBySurface: 'chatgpt', proposal, actionTarget });
    interactiveSession.enabled = true;

    const revoked = await interactivePost(app, '/mcp/founder-permissions/requests/permission:revoked-pending-001/revoke').send({});
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('pending');
    const revokedAt = rows.get('permission:revoked-pending-001')?.revoked_at;
    expect(typeof revokedAt).toBe('string');

    const staleDecision = await interactivePost(app, '/mcp/founder-permissions/requests/permission:revoked-pending-001/decision')
      .send({ decision: 'approved' });
    expect(staleDecision.status).toBe(409);
    expect(staleDecision.body.code).toBe('FOUNDER_PERMISSION_DECISION_RACE');
    expect(rows.get('permission:revoked-pending-001')?.status).toBe('pending');
    expect(rows.get('permission:revoked-pending-001')?.revoked_at).toBe(revokedAt);
    expect(rows.get('permission:revoked-pending-001')?.decision).toBeNull();
  });

  it('fails closed when the same request id is reused for another exact target', async () => {
    const app = createServer();
    const first = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-002', requestedBySurface: 'claude', proposal, actionTarget });
    expect(first.status).toBe(201);
    const conflicting = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({
        requestId: 'permission:ask-founder-002',
        requestedBySurface: 'claude',
        proposal: { ...proposal, expectedHeadSha: 'e'.repeat(40) },
        actionTarget: { ...actionTarget, headSha: 'e'.repeat(40) },
      });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('FOUNDER_PERMISSION_SCOPE_MISMATCH');
  });

  it('reconciles a concurrent duplicate insert as an idempotent retry', async () => {
    const app = createServer();
    raceNextInsert.enabled = true;
    const result = await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:insert-race-001', requestedBySurface: 'chatgpt', proposal, actionTarget });
    expect(result.status).toBe(200);
    expect(result.body.idempotent).toBe(true);
    expect(result.body.status).toBe('pending');
  });

  it('does not let a later approval overwrite an existing rejection', async () => {
    const app = createServer();
    await request(app).post('/mcp/founder-permissions/requests').set('Authorization', bearer)
      .send({ requestId: 'permission:ask-founder-003', requestedBySurface: 'perplexity', proposal, actionTarget });
    interactiveSession.enabled = true;
    const rejected = await interactivePost(app, '/mcp/founder-permissions/requests/permission:ask-founder-003/decision')
      .send({ decision: 'rejected' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.founderPermissionSatisfied).toBe(false);
    const overwrite = await interactivePost(app, '/mcp/founder-permissions/requests/permission:ask-founder-003/decision')
      .send({ decision: 'approved' });
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