import { randomUUID } from 'node:crypto';

const tables = new Map();

export function vaultTable(name) {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
}

export function resetVaultFake(seed = {}) {
  tables.clear();
  for (const [name, rows] of Object.entries(seed)) {
    tables.set(name, structuredClone(rows));
  }
}

export function vaultSnapshot(name) {
  return structuredClone(vaultTable(name));
}

function valueAt(row, column) {
  return row[column];
}

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    const actual = valueAt(row, column);
    if (op === 'eq') return actual === value;
    if (op === 'in') return Array.isArray(value) && value.includes(actual);
    if (op === 'contains') {
      return Array.isArray(actual) && Array.isArray(value) && value.every((entry) => actual.includes(entry));
    }
    if (op === 'is') return value === null ? actual == null : actual === value;
    return false;
  });
}

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.mode = 'select';
    this.filters = [];
    this.rows = null;
    this.upsertConflict = [];
    this.limitValue = null;
    this.orderColumn = null;
    this.orderAscending = true;
  }

  select() { return this; }
  eq(column, value) { this.filters.push({ column, op: 'eq', value }); return this; }
  in(column, value) { this.filters.push({ column, op: 'in', value }); return this; }
  contains(column, value) { this.filters.push({ column, op: 'contains', value }); return this; }
  is(column, value) { this.filters.push({ column, op: 'is', value }); return this; }
  order(column, options = {}) { this.orderColumn = column; this.orderAscending = options.ascending !== false; return this; }
  limit(value) { this.limitValue = value; return this; }
  insert(rows) { this.mode = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(fields) { this.mode = 'update'; this.rows = [fields]; return this; }
  upsert(rows, options = {}) {
    this.mode = 'upsert';
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.upsertConflict = String(options.onConflict ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    return this;
  }

  single() { return this.run(true, false); }
  maybeSingle() { return this.run(true, true); }
  then(resolve, reject) { return this.run(false, true).then(resolve, reject); }

  async run(single, allowZero) {
    const target = vaultTable(this.tableName);
    const now = new Date().toISOString();
    let result = [];

    if (this.mode === 'insert') {
      result = this.rows.map((row) => {
        const inserted = { id: randomUUID(), created_at: now, ...row };
        target.push(inserted);
        return inserted;
      });
    } else if (this.mode === 'update') {
      result = target.filter((row) => matches(row, this.filters));
      for (const row of result) Object.assign(row, this.rows[0], { updated_at: now });
    } else if (this.mode === 'upsert') {
      result = this.rows.map((row) => {
        const existing = target.find((candidate) => this.upsertConflict.length > 0 && this.upsertConflict.every((key) => candidate[key] === row[key]));
        if (existing) {
          Object.assign(existing, row, { updated_at: now });
          return existing;
        }
        const inserted = { id: randomUUID(), created_at: now, updated_at: now, ...row };
        target.push(inserted);
        return inserted;
      });
    } else {
      result = target.filter((row) => matches(row, this.filters));
    }

    if (this.orderColumn) {
      result = [...result].sort((a, b) => {
        const av = a[this.orderColumn];
        const bv = b[this.orderColumn];
        if (av === bv) return 0;
        const direction = av < bv ? -1 : 1;
        return this.orderAscending ? direction : -direction;
      });
    }
    if (this.limitValue != null) result = result.slice(0, this.limitValue);

    if (!single) return { data: result, error: null };
    if (result.length === 0) return allowZero
      ? { data: null, error: null }
      : { data: null, error: { message: 'No rows found' } };
    return { data: result[0], error: null };
  }
}

async function rpc(name, args) {
  if (name !== 'record_fcr_api_token_usage') {
    return { data: null, error: { message: `Unhandled RPC: ${name}` } };
  }
  const token = vaultTable('fcr_api_tokens').find((row) => row.id === args.p_token_id && row.project_id === args.p_project_id);
  if (!token || token.revoked_at || Date.parse(token.expires_at) <= Date.now()) {
    return { data: null, error: { message: 'FCR API token is unavailable' } };
  }
  token.usage_count = Number(token.usage_count ?? 0) + 1;
  token.last_used_at = new Date().toISOString();
  vaultTable('fcr_api_usage_events').push({
    id: randomUUID(),
    token_id: args.p_token_id,
    project_id: args.p_project_id,
    route: args.p_route,
    method: args.p_method,
    capability: args.p_capability,
    status_code: args.p_status_code,
    connection_count: args.p_connection_count,
    created_at: new Date().toISOString(),
  });
  return { data: null, error: null };
}

export const supabase = {
  from(name) { return new QueryBuilder(name); },
  rpc,
};

export function makeSupabaseClient() {
  return supabase;
}
