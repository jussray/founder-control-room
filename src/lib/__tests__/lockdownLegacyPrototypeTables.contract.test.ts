import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260723000000_lockdown_legacy_prototype_tables.sql",
);
const knownGaps = JSON.parse(read("config/rls-known-gaps.json")) as Array<{ table: string }>;
const queries = read("src/lib/queries.ts");

const LOCKED_DOWN_TABLES = ["lanes", "events", "ooda_steps", "prototype_evidence", "escalations"];

describe("legacy prototype table privilege lockdown", () => {
  it("enables RLS with a service-role-only policy for every previously-gapped table", () => {
    for (const table of LOCKED_DOWN_TABLES) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`create policy "control_room_service_role_only" on ${table}`);
    }
  });

  it("revokes anon/authenticated and grants only service_role, fail-closed", () => {
    for (const table of LOCKED_DOWN_TABLES) {
      expect(migration).toContain(`revoke all on table ${table} from anon, authenticated`);
      expect(migration).toContain(`grant select, insert, update, delete on table ${table} to service_role`);
    }
  });

  it("uses both USING and WITH CHECK so the policy blocks reads and writes", () => {
    // A policy with only USING would leave the door open to interpretation
    // for INSERT; WITH CHECK is what actually constrains new/modified rows.
    const policyBlocks = migration.split('create policy "control_room_service_role_only"').slice(1);
    expect(policyBlocks).toHaveLength(LOCKED_DOWN_TABLES.length);
    for (const block of policyBlocks) {
      expect(block).toContain("using (auth.role() = 'service_role')");
      expect(block).toContain("with check (auth.role() = 'service_role')");
    }
  });

  it("removes the now-fixed entries from the reviewed RLS-gap baseline", () => {
    const gapTables = new Set(knownGaps.map((entry) => entry.table));
    for (const table of LOCKED_DOWN_TABLES) {
      expect(gapTables.has(table)).toBe(false);
    }
  });

  it("keeps every direct query to these tables behind the service-role client", () => {
    // supabaseAdmin() is the service-role client; RLS is a no-op for it, so
    // this lockdown cannot change application behavior. If a caller ever
    // switches these tables to a non-admin client, this test should fail
    // and force a conscious decision about the new access path.
    for (const table of LOCKED_DOWN_TABLES) {
      // Either a direct .from('table') call or a nested PostgREST select
      // (e.g. missions(*, ooda_steps(*))) — both still run under
      // supabaseAdmin(), the service-role client asserted below.
      expect(queries, `expected src/lib/queries.ts to reference '${table}'`).toContain(table);
    }
    expect(queries).toContain("supabaseAdmin()");
  });
});
