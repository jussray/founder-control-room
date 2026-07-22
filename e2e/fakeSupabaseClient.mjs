// Fake replacement for src/lib/supabaseClient.ts, loaded only under
// e2e/loader.mjs. Implements exactly the query-builder chains this repo's
// route/controller code actually calls (verified against the real source),
// backed by the in-memory store in fakeStore.mjs.
import { table, matchesFilters, sortRows, withDefaults } from './fakeStore.mjs';

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.mode = null;
    this.filters = [];
    this.insertRows = null;
    this.updateFields = null;
    this.upsertConflictCols = null;
    this.orderCol = null;
    this.orderAsc = true;
    this.limitN = null;
    this._promise = null;
  }

  select() { if (!this.mode) this.mode = 'select'; return this; }
  insert(rows) { this.mode = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(fields) { this.mode = 'update'; this.updateFields = fields; return this; }
  upsert(rows, opts) {
    this.mode = 'upsert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertConflictCols = (opts?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this;
  }
  delete() { this.mode = 'delete'; return this; }

  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
  in(col, arr) { this.filters.push({ col, op: 'in', val: arr }); return this; }
  gte(col, val) { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col, val) { this.filters.push({ col, op: 'lt', val }); return this; }
  filter(colExpr, _op, val) { this.filters.push({ col: colExpr, op: 'eq', val }); return this; }
  order(col, opts = {}) { this.orderCol = col; this.orderAsc = opts.ascending !== false; return this; }
  limit(n) { this.limitN = n; return this; }

  single() { return this._run({ wantSingle: true, allowZero: false }); }
  maybeSingle() { return this._run({ wantSingle: true, allowZero: true }); }

  then(resolve, reject) {
    if (!this._promise) this._promise = this._run({ wantSingle: false });
    return this._promise.then(resolve, reject);
  }

  async _run({ wantSingle, allowZero }) {
    const rows = table(this.tableName);

    if (this.mode === 'insert') {
      const inserted = this.insertRows.map((r) => {
        const row = withDefaults(r, this.tableName);
        rows.push(row);
        return row;
      });
      return this._shapeResult(inserted, wantSingle, allowZero);
    }

    if (this.mode === 'upsert') {
      const results = this.insertRows.map((r) => {
        const conflictKeys = this.upsertConflictCols.length ? this.upsertConflictCols : Object.keys(r);
        const existingIdx = rows.findIndex((row) => conflictKeys.every((k) => row[k] === r[k]));
        if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...r, updated_at: new Date().toISOString() };
          return rows[existingIdx];
        }
        const row = withDefaults(r, this.tableName);
        rows.push(row);
        return row;
      });
      return this._shapeResult(results, wantSingle, allowZero);
    }

    const matched = rows.filter((row) => matchesFilters(row, this.filters));

    if (this.mode === 'update') {
      for (const row of matched) Object.assign(row, this.updateFields, { updated_at: new Date().toISOString() });
      return this._shapeResult(matched, wantSingle, allowZero);
    }

    if (this.mode === 'delete') {
      const remaining = rows.filter((row) => !matchesFilters(row, this.filters));
      table(this.tableName).length = 0;
      table(this.tableName).push(...remaining);
      return { data: null, error: null };
    }

    // select
    let result = sortRows(matched, this.orderCol, this.orderAsc);
    if (this.limitN != null) result = result.slice(0, this.limitN);
    return this._shapeResult(result, wantSingle, allowZero);
  }

  _shapeResult(rows, wantSingle, allowZero) {
    if (!wantSingle) return { data: rows, error: null };
    if (rows.length === 0) {
      return allowZero ? { data: null, error: null } : { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }
}

async function fakeRpc(name, args) {
  if (name === 'try_acquire_controller_lease') {
    const leases = table('controller_leases');
    const existing = leases.find((l) => l.lease_key === args.p_lease_key);
    const now = Date.now();
    if (existing && new Date(existing.expires_at).getTime() > now) {
      return { data: false, error: null };
    }
    const claimedAt = new Date().toISOString();
    const expiresAt = new Date(now + (args.p_ttl_seconds ?? 60) * 1000).toISOString();
    if (existing) {
      existing.claimed_at = claimedAt;
      existing.expires_at = expiresAt;
    } else {
      leases.push({ lease_key: args.p_lease_key, claimed_at: claimedAt, expires_at: expiresAt });
    }
    return { data: true, error: null };
  }

  if (name === 'claim_outbox_work') {
    const now = new Date().toISOString();
    const outbox = table('controller_outbox');
    const claimable = outbox
      .filter((row) => !row.completed_at && !row.claimed_at && row.available_at <= now)
      .slice(0, args.p_limit ?? 10);
    for (const row of claimable) row.claimed_at = now;
    return {
      data: claimable.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        controller: row.controller,
        resource_id: row.resource_id,
        reason: row.reason,
        source_event_id: row.source_event_id,
        attempt_count: row.attempt_count,
        claimed_at: row.claimed_at,
      })),
      error: null,
    };
  }

  if (name === 'complete_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned_or_completed' } };
    }
    row.completed_at = new Date().toISOString();
    row.claimed_at = null;
    row.last_error = null;
    if (args.p_source_event_id) {
      const event = table('provider_events').find((r) => r.id === args.p_source_event_id);
      if (!event) return { data: null, error: { message: 'provider_event_not_found' } };
      event.processing_status = 'processed'; event.processed_at = new Date().toISOString();
    }
    return { data: null, error: null };
  }

  if (name === 'fail_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned' } };
    }
    row.claimed_at = null;
    row.attempt_count = (row.attempt_count ?? 0) + 1;
    row.last_error = args.p_error;
    const backoffSeconds = 2 ** Math.min(row.attempt_count, 6);
    row.available_at = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    return { data: null, error: null };
  }

  if (name === 'abandon_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned_or_completed' } };
    }
    row.completed_at = new Date().toISOString();
    row.claimed_at = null;
    row.attempt_count = (row.attempt_count ?? 0) + 1;
    row.last_error = args.p_error;
    if (args.p_source_event_id) {
      const event = table('provider_events').find((r) => r.id === args.p_source_event_id);
      if (!event) return { data: null, error: { message: 'provider_event_not_found' } };
      event.processing_status = 'failed'; event.last_error = args.p_error;
    }
    return { data: null, error: null };
  }

  console.warn(`[fake supabase] unhandled rpc "${name}" — returning null`);
  return { data: null, error: null };
}

export const supabase = {
  from(tableName) { return new QueryBuilder(tableName); },
  rpc: fakeRpc,
};

export function makeSupabaseClient() {
  return supabase;
}

// Seed the founder allowlist synchronously at process start, mirroring what
// migration 0002 does for real (`insert into founder_users ...`) — this
// module is the first thing the loader redirects to, so this runs before
// the HTTP server accepts any request.
if (process.env.E2E_SEED_FOUNDER_EMAIL) {
  table('founder_users').push({ email: process.env.E2E_SEED_FOUNDER_EMAIL, created_at: new Date().toISOString() });
}
