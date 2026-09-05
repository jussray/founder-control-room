import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/20260905083500_founder_content_cadence_execution_lease.sql';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('founder-content cadence execution lease SQL integrity', () => {
  const sql = read(MIGRATION);

  it('keeps released cadence as history instead of deleting it', () => {
    expect(sql).toContain("lease_state = 'released'");
    expect(sql).toContain('founder_content_cadence_lease_events');
    expect(sql).not.toMatch(/delete\s+from\s+public\.founder_content_cadence_reservations/i);
  });

  it('lets only confirmed cadence participate in the rolling-hour floor', () => {
    const floor = sql.match(/select max\(r\.reserved_schedule_at\)[\s\S]{0,500}?r\.lease_state = 'confirmed'/i);
    expect(floor).not.toBeNull();
    expect(sql).toContain('Only execution-confirmed cadence is an hourly floor');
  });

  it('uses a bounded provisional lease plus an execution fence rather than timeout trust alone', () => {
    expect(sql).toContain("lease_now + interval '2 minutes'");
    expect(sql).toContain('reconcile_founder_content_cadence_execution_lease');
    expect(sql).toContain('founder_content_cadence_execution_lease_guard');
    expect(sql).toContain('before insert or update of status, request, result, started_at');
    expect(sql.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('supports both legacy and provider-neutral orchestration identities', () => {
    expect(sql).toContain("new.idempotency_key like 'fcr-n8n-social-v2:%'");
    expect(sql).toContain("cadence_provider := 'n8n'");
    expect(sql).toContain('cadence_channel := platform_raw');
    expect(sql).toContain('cadence_provider := provider_raw');
    expect(sql).toContain('cadence_channel := channel_raw');
  });

  it('does not release provider-attempted or approval-claimed execution state', () => {
    expect(sql).toContain("provider_write_attempted', 'false')) <> 'true'");
    expect(sql).toContain("approval_claimed', 'false')) <> 'true'");
    expect(sql).toContain("retryable_before_provider', 'false')) = 'true'");
  });

  it('keeps the source-only database boundary explicit', () => {
    expect(sql).toContain('SOURCE ONLY');
    expect(sql).toContain('grant execute on function public.reserve_founder_content_cadence');
    expect(sql).toContain('revoke all on function public.reconcile_founder_content_cadence_execution_lease() from service_role');
  });
});
