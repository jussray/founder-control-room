import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/20260905083600_founder_content_cadence_partial_unique_reconcile.sql';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('founder-content cadence partial unique reconciliation', () => {
  const sql = read(MIGRATION);

  it('discovers predecessor uniqueness by definition instead of guessed long names', () => {
    expect(sql).toContain("c.contype = 'u'");
    expect(sql).toContain('pg_catalog.pg_get_constraintdef(c.oid)');
    expect(sql).toContain("'UNIQUE (provider, channel, content_id)'");
    expect(sql).toContain("'UNIQUE (provider, channel, reserved_schedule_at)'");
    expect(sql).toContain('drop constraint %I');
  });

  it('reasserts partial active uniqueness while allowing released historical rows', () => {
    expect(sql).toContain('founder_content_cadence_active_content_unique');
    expect(sql).toContain("where lease_state in ('provisional', 'confirmed')");
    expect(sql).toContain('founder_content_cadence_confirmed_slot_unique');
    expect(sql).toContain("where lease_state = 'confirmed'");
    expect(sql).toContain('Released historical rows do not block a safe retry');
  });
});
