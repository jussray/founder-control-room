// In-memory PostgREST-shaped store used only by the e2e harness. Not part
// of the shipped application — src/lib/supabaseClient.ts and
// supabaseAuthClient.ts are untouched; a Node ESM loader (loader.mjs)
// redirects those two import specifiers to fakeSupabaseClient.mjs /
// fakeSupabaseAuthClient.mjs, which read/write this shared store.
import { randomUUID } from 'node:crypto';

export const db = new Map();

export function table(name) {
  if (!db.has(name)) db.set(name, []);
  return db.get(name);
}

function getPath(row, colExpr) {
  // Supports plain columns and the one JSON-arrow filter this app uses:
  // "config->>repository" (Postgres ->> operator, text extraction).
  if (colExpr.includes('->>')) {
    const [base, key] = colExpr.split('->>');
    return row[base]?.[key];
  }
  return row[colExpr];
}

export function matchesFilters(row, filters) {
  return filters.every(({ col, op, val }) => {
    const actual = getPath(row, col);
    switch (op) {
      case 'eq': return actual === val;
      case 'in': return Array.isArray(val) && val.includes(actual);
      case 'gte': return actual !== undefined && actual >= val;
      case 'lt': return actual !== undefined && actual < val;
      default: return true;
    }
  });
}

export function sortRows(rows, col, ascending) {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return ascending ? cmp : -cmp;
  });
}

// Mirrors column defaults the real Postgres schema applies on insert (see
// supabase/migrations) that this generic in-memory store wouldn't otherwise
// know about — e.g. projects.verification_enabled defaults to true in
// 20260717195000_guarded_terminal_and_schema_reconciliation.sql, and the
// guarded terminal route 409s on any project row missing it.
const TABLE_DEFAULTS = {
  projects: { verification_enabled: true },
};

export function withDefaults(row, tableName) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    ...(TABLE_DEFAULTS[tableName] ?? {}),
    ...row,
  };
}
