import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260803011000_harden_live_rls_and_onboarding_function.sql",
  ),
  "utf8",
);

const SERVICE_ONLY_TABLES = [
  "lanes",
  "events",
  "ooda_steps",
  "escalations",
  "founder_users",
  "repository_capability_evidence",
  "repository_findings",
  "repository_verification_runs",
] as const;

describe("live Supabase security hardening", () => {
  it("makes every live advisor table explicitly service-role-only", () => {
    for (const [index, table] of SERVICE_ONLY_TABLES.entries()) {
      const nextTable = SERVICE_ONLY_TABLES[index + 1];
      const blockStart = migration.indexOf(
        `alter table public.${table} enable row level security`,
      );
      const blockEnd = nextTable
        ? migration.indexOf(
            `alter table public.${nextTable} enable row level security`,
            blockStart + 1,
          )
        : migration.indexOf(
            "create or replace function public.update_onboarding_updated_at()",
            blockStart + 1,
          );

      expect(blockStart, `missing migration block for ${table}`).toBeGreaterThanOrEqual(0);
      expect(blockEnd, `missing migration block boundary after ${table}`).toBeGreaterThan(
        blockStart,
      );

      const block = migration.slice(blockStart, blockEnd);
      expect(block).toContain(
        `drop policy if exists "control_room_service_role_only" on public.${table}`,
      );
      expect(block).toContain(
        `create policy "control_room_service_role_only" on public.${table}`,
      );
      expect(block).toContain("for all\n  to service_role\n  using (true)\n  with check (true)");
      expect(block).toContain(
        `revoke all on table public.${table} from anon, authenticated`,
      );
      expect(block).toContain(
        `grant select, insert, update, delete on table public.${table} to service_role`,
      );
    }
  });

  it("does not add per-row auth function evaluation to the policies", () => {
    expect(migration).not.toContain("auth.role()");
    expect(migration).not.toContain("auth.uid()");
  });

  it("pins the onboarding trigger search path and qualifies the clock", () => {
    expect(migration).toContain(
      "create or replace function public.update_onboarding_updated_at()",
    );
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("new.updated_at = pg_catalog.now()");
  });

  it("contains no application-data mutation", () => {
    expect(migration).not.toMatch(/^\s*(insert|update|delete)\s+/gim);
  });
});
