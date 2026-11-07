import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permissionRows, authorityRows, mockGetUser, interactiveSession } = vi.hoisted(() => ({
  permissionRows: new Map<string, Record<string, unknown>>(),
  authorityRows: new Map<string, Record<string, unknown>>(),
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
      if (table !== 'founder_permission_requests' && table !== 'founder_authority_receipts') {
        throw new Error(`unexpected table: ${table}`);
      }

      let operation: 'read' | 'insert' = 'read';
      let payload: Record<string, unknown> = {};
      const filters: Array<{ field: string; op: 'eq' | 'is' | 'gt' | 'in'; value: unknown }> = [];
      const source = table === 'founder_permission_requests' ? permissionRows : authorityRows;
      const matches = (row: Record<string, unknown>): boolean => filters.every(({ field, op, value }) => {
        if (op === 'eq') return row[field] === value;
        if (op === 'is') return row[field] === value || (value === null && row[field] == null);
        if (op === 'gt') return String(row[field] ?? '') > String(value ?? '');
        if (op === 'in') return Array.isArray(value) && value.includes(row[field]);
        return false;
      });

      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (field: string, value: unknown) => { filters.push({ field, op: 'eq', value }); return chain; },
        is: (field: string, value: unknown) => { filters.push({ field, op: 'is', value }); return chain; },
        gt: (field: string, value: unknown) => { filters.push({ field, op: 'gt', value }); return chain; },
        in: (field: string, value: unknown[]) => { filters.push({ field, op: 'in', value }); return chain; },
        insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return chain; },
        maybeSingle: async () => {
          if (operation === 'insert') {
            if (table !== 'founder_authority_receipts') throw new Error('unexpected insert');
            const id = String(payload.receipt_id ?? '');
            if (authorityRows.has(id)) return { data: null, error: { code: '23505' } };
            authorityRows.set(id, payload);
            return { data: payload, error: null };
          }
          const row = [...source.values()].find(matches) ?? null;
          return { data: row, error: null };
        },
        then: (resolve: (value: unknown) => void) => resolve({
          data: [...source.values()].filter(matches),
          error: null,
        }),
      };
      return chain;
    }),
  },
}));

import request from 'supertest';
import { createServer } from '../../server.js';
import {
  createFounderPermissionRequest,
  resolveFounderPermissionRequest,
} from '../../../lib/founderPermissionBroker.js';

const bearer = 'Bearer test-founder-token';
const origin = 'http://localhost:8787';
const founderId = '11111111-1111-4111-8111-111111111111';
const headSha = 'b'.repeat(40);
const baseSha = 'd'.repeat(40);
const proposal = {
  proposalId: 'authority-receipt-test',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'merge',
  expectedHeadSha: headSha,
  capabilityPlanHash: 'c'.repeat(64),
};
const actionTarget = {
  type: 'merge' as const,
  repo: 'jussray/founder-control-room',
  pullRequestNumber: 908,
  baseSha,
  headSha,
};

function founderUser() {
  return { data: { user: { id: founderId, email: 'founder@example.com' } }, error: null };
}

function approvedPermissionRow(note: string | null = 'Approved from an external console.') {
  const permission = createFounderPermissionRequest({
    requestId: 'permission:authority-receipt-001',
    requestedBySurface: 'chatgpt',
    proposal,
    actionTarget,
    note,
  });
  const resolution = resolveFounderPermissionRequest({ request: permission, decision: 'approved' });
  return {
    request_id: permission.requestId,
    requested_by_surface: permission.requestedBySurface,
    request_hash: permission.requestHash,
    proposal: permission.proposal,
    action_target: permission.actionTarget,
    note: permission.note,
    status: 'approved',
    decision: resolution.decision,
    decision_hash: resolution.decision.decisionHash,
    decision_surface: 'fcr',
    founder_user_id: founderId,
    founder_email: 'founder@example.com',
    requested_at: new Date(Date.now() - 60_000).toISOString(),
    decided_at: new Date(Date.now() - 30_000).toISOString(),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    revoked_at: null,
    consumed_at: null,
  };
}

function interactivePost(app: ReturnType<typeof createServer>, path: string) {
  return request(app)
    .post(path)
    .set('Authorization', bearer)
    .set('Origin', origin)
    .set('Sec-Fetch-Site', 'same-origin');
}

describe('canonical founder action authority HTTP contract', () => {
  beforeEach(() => {
    permissionRows.clear();
    authorityRows.clear();
    interactiveSession.enabled = false;
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue(founderUser());
  });

  it('keeps broker decisions non-authorizing until the interactive founder issues an exact receipt', async () => {
    const row = approvedPermissionRow();
    permissionRows.set(String(row.request_id), row);
    const app = createServer();

    const bearerOnly = await request(app)
      .post('/mcp/founder-authority-receipts/permission:authority-receipt-001/issue')
      .set('Authorization', bearer)
      .set('Origin', origin)
      .send();
    expect(bearerOnly.status).toBe(401);

    interactiveSession.enabled = true;
    const issued = await interactivePost(
      app,
      '/mcp/founder-authority-receipts/permission:authority-receipt-001/issue',
    ).send();

    expect(issued.status).toBe(201);
    expect(issued.body.executionAuthorized).toBe(true);
    expect(issued.body.receipt.receipt_id).toMatch(/^far:[0-9a-f]{48}$/);
    expect(issued.body.receipt.action_type).toBe('merge');
    expect(issued.body.receipt.repository).toBe('jussray/founder-control-room');
    expect(issued.body.receipt.pull_request_number).toBe(908);
    expect(issued.body.receipt.base_sha).toBe(baseSha);
    expect(issued.body.receipt.head_sha).toBe(headSha);
  });

  it('preserves the broker note when revalidating canonical request identity', async () => {
    const row = approvedPermissionRow('Founder approved after exact-head proof.');
    permissionRows.set(String(row.request_id), row);
    interactiveSession.enabled = true;
    const app = createServer();

    const issued = await interactivePost(
      app,
      '/mcp/founder-authority-receipts/permission:authority-receipt-001/issue',
    ).send();

    expect(issued.status).toBe(201);
    expect(issued.body.executionAuthorized).toBe(true);
  });

  it('verifies only an exact live action scope without returning founder identity', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    authorityRows.set('far:' + 'e'.repeat(48), {
      receipt_id: 'far:' + 'e'.repeat(48),
      action_type: 'merge',
      repository: 'jussray/founder-control-room',
      pull_request_number: 908,
      base_sha: baseSha,
      head_sha: headSha,
      environment: null,
      status: 'active',
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      reserved_at: null,
      consumed_at: null,
      revoked_at: null,
      founder_email: 'must-not-leak@example.com',
      decision_hash: 'f'.repeat(64),
    });
    const app = createServer();

    const verified = await request(app).get('/mcp/founder-authority-receipts/verify').query({
      actionType: 'merge',
      repository: 'jussray/founder-control-room',
      pullRequestNumber: 908,
      baseSha,
      headSha,
    });
    expect(verified.status).toBe(200);
    expect(verified.body.valid).toBe(true);
    expect(verified.body.executionAuthorized).toBe(true);
    expect(JSON.stringify(verified.body)).not.toContain('must-not-leak@example.com');
    expect(JSON.stringify(verified.body)).not.toContain('f'.repeat(64));

    const staleHead = await request(app).get('/mcp/founder-authority-receipts/verify').query({
      actionType: 'merge',
      repository: 'jussray/founder-control-room',
      pullRequestNumber: 908,
      baseSha,
      headSha: '1'.repeat(40),
    });
    expect(staleHead.status).toBe(200);
    expect(staleHead.body.valid).toBe(false);
  });
});
