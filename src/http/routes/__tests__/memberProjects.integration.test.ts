import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], founder: false, fail: false, queries: [] as string[] }));
vi.mock('../../../auth/memberSession.js', () => ({
  readMemberSession: async (req: express.Request) => req.get('Cookie') === 'member=A'
    ? { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.com' }
    : req.get('Cookie') === 'member=B'
      ? { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'b@example.com' } : null,
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from: (table: string) => {
  state.queries.push(table);
  if (table === 'founder_users') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.founder ? { email: 'a@example.com' } : null, error: null }) }) }) };
  if (table !== 'fcr_member_projects') throw Error('Unexpected private table');
  const filters: Record<string, unknown> = {};
  let inserted: Record<string, unknown> | undefined;
  let updated: Record<string, unknown> | undefined;
  function result() {
    if (state.fail) return { data: null, error: { message: 'unavailable' } };
    if (inserted) {
      const row = { id: '11111111-1111-4111-8111-111111111111', version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', ...inserted };
      state.rows.push(row); return { data: row, error: null };
    }
    if (!filters.owner_user_id) throw Error('Unscoped member query');
    const rows = state.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
    if (updated) rows.forEach(row => Object.assign(row, updated));
    return { data: rows, error: null };
  }
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters[column] = value; return query; },
    order: () => query,
    limit: async () => result(),
    insert: (row: Record<string, unknown>) => { inserted = row; return query; },
    update: (row: Record<string, unknown>) => { updated = row; return query; },
    single: async () => result(),
    maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
  };
  return query;
} } }));

import { memberProjectsRouter } from '../memberProjects.js';
const PROJECT = '11111111-1111-4111-8111-111111111111';
function app() { const api = express(); api.use(express.json()); api.use('/auth/member/projects', memberProjectsRouter); return api; }
function create(cookie = 'member=A', body: Record<string, unknown> = { title: 'First product', goal: 'Test one outcome' }) {
  return request(app()).post('/auth/member/projects').set('Cookie', cookie).set('Origin', 'http://localhost:8787').send(body);
}
beforeEach(() => { state.rows = []; state.queries = []; state.founder = false; state.fail = false; });
describe('member-owned project draft lifecycle', () => {
  it('creates, lists, resumes and saves only the authenticated member project', async () => {
    const created = await create(); expect(created.status).toBe(201);
    expect(state.rows[0].owner_user_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const list = await request(app()).get('/auth/member/projects').set('Cookie', 'member=A');
    expect(list.body.data.projects).toHaveLength(1); expect(list.headers['cache-control']).toBe('private, no-store');
    const resumed = await request(app()).get('/auth/member/projects/' + PROJECT).set('Cookie', 'member=A');
    expect(resumed.body.data.project.title).toBe('First product');
    const saved = await request(app()).patch('/auth/member/projects/' + PROJECT).set('Cookie', 'member=A')
      .set('Origin', 'http://localhost:8787').send({ title: 'Ready for a test', goal: 'One interview', version: 1 });
    expect(saved.status).toBe(200); expect(saved.body.data.project.version).toBe(2);
  });
  it('never exposes or modifies another member project even with its exact ID', async () => {
    await create();
    expect((await request(app()).get('/auth/member/projects').set('Cookie', 'member=B')).body.data.projects).toEqual([]);
    expect((await request(app()).get('/auth/member/projects/' + PROJECT).set('Cookie', 'member=B')).status).toBe(404);
    const modified = await request(app()).patch('/auth/member/projects/' + PROJECT).set('Cookie', 'member=B')
      .set('Origin', 'http://localhost:8787').send({ title: 'Stolen', goal: '', version: 1 });
    expect(modified.status).toBe(409); expect(state.rows[0].title).toBe('First product');
    expect(state.queries.every(table => ['founder_users', 'fcr_member_projects'].includes(table))).toBe(true);
  });
  it('rejects owner injection, invalid content and stale versions', async () => {
    expect((await create('member=A', { title: 'Project', goal: '', owner_user_id: 'other' })).status).toBe(400);
    expect((await create('member=A', { title: ' ', goal: '' })).status).toBe(400);
    await create();
    const result = await request(app()).patch('/auth/member/projects/' + PROJECT).set('Cookie', 'member=A')
      .set('Origin', 'http://localhost:8787').send({ title: 'Lost edit', goal: '', version: 2 });
    expect(result.status).toBe(409); expect(state.rows[0].version).toBe(1);
  });
  it('requires member identity and denies founder reclassification or storage failure', async () => {
    expect((await request(app()).get('/auth/member/projects')).status).toBe(401);
    state.founder = true; expect((await create()).status).toBe(403); expect(state.rows).toEqual([]);
    state.founder = false; state.fail = true;
    expect((await create()).status).toBe(503); expect(state.rows).toEqual([]);
  });
  it('rejects absent or foreign origins and attempted Bearer bypasses', async () => {
    for (const origin of ['', 'https://attacker.example']) {
      expect((await request(app()).post('/auth/member/projects').set('Cookie', 'member=A').set('Origin', origin)
        .send({ title: 'Blocked', goal: '' })).status).toBe(403);
    }
    expect((await request(app()).post('/auth/member/projects').set('Cookie', 'member=A').set('Origin', 'http://localhost:8787')
      .set('Sec-Fetch-Site', 'cross-site').send({ title: 'Blocked', goal: '' })).status).toBe(403);
    expect((await request(app()).post('/auth/member/projects').set('Cookie', 'member=A').set('Authorization', 'Bearer fake')
      .send({ title: 'Blocked', goal: '' })).status).toBe(400);
    expect(state.rows).toEqual([]);
  });
});
