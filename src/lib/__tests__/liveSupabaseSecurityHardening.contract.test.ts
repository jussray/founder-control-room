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
const executableSql = migration.replace(/^\s*--.*$/gm, "");

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
      const blockStart = executableSql.indexOf(
        `alter table public.${table} enable row level security`,
      );
      const blockEnd = nextTable
        ? executableSql.indexOf(
            `alter table public.${nextTable} enable row level security`,
            blockStart + 1,
          )
        : executableSql.indexOf(
            "create or replace function public.update_onboarding_updated_at()",
            blockStart + 1,
          );

      expect(blockStart, `missing migration block for ${table}`).toBeGreaterThanOrEqual(0);
      expect(blockEnd, `missing migration block boundary after ${table}`).toBeGreaterThan(
        blockStart,
      );

      const block = executableSql.slice(blockStart, blockEnd);
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

  it("does not add per-row auth function evaluation to executable policy SQL", () => {
    expect(executableSql).not.toContain("auth.role()");
    expect(executableSql).not.toContain("auth.uid()");
  });

  it("pins the onboarding trigger search path and qualifies the clock", () => {
    expect(executableSql).toContain(
      "create or replace function public.update_onboarding_updated_at()",
    );
    expect(executableSql).toContain("set search_path = ''");
    expect(executableSql).toContain("new.updated_at = pg_catalog.now()");
  });

  it("contains no application-data mutation", () => {
    expect(executableSql).not.toMatch(/^\s*(insert|update|delete)\s+/gim);
  });
});
