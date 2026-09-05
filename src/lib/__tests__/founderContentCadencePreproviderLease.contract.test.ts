import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260830113000_founder_content_cadence_expiry_guard.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('founder-content cadence pre-provider lease contract', () => {
  it('preserves historical reservations and releases only active cadence authority', () => {
    expect(sql).toContain('add column if not exists released_at timestamptz');
    expect(sql).toContain('add column if not exists release_reason text');
    expect(sql).toContain('where released_at is null');
    expect(sql).not.toMatch(/delete\s+from\s+public\.founder_content_cadence_reservations/i);
    expect(sql).not.toMatch(/set\s+requested_schedule_at\s*=/i);
    expect(sql).not.toMatch(/set\s+reserved_schedule_at\s*=/i);
  });

  it('bounds unbound cadence slots to the existing two-minute preclaim lease', () => {
    expect(sql).toContain("created_at <= observed_now - interval '2 minutes'");
    expect(sql).toContain("release_reason = 'unbound_preprovider_lease_expired'");
    expect(sql).toContain("executions.action_type = 'schedule_founder_content'");
    expect(sql).toContain("executions.request ->> 'contentId' = reservations.content_id::text");
  });

  it('releases a stale same-content slot only with pre-provider execution evidence', () => {
    expect(sql).toContain("latest_execution_status = 'failed'");
    expect(sql).toContain("latest_retryable_before_provider, 'false') = 'true'");
    expect(sql).toContain("latest_provider_write_attempted, 'false') = 'false'");
    expect(sql).toContain("latest_approval_claimed, 'false') = 'false'");
    expect(sql).toContain("latest_execution_status = 'pending'");
    expect(sql).toContain("latest_execution_started_at <= observed_now - interval '2 minutes'");
    expect(sql).toContain('FOUNDER_CONTENT_CADENCE_STALE_RESERVATION_ACTIVE');
  });

  it('excludes released rows from active uniqueness and future cadence spacing', () => {
    expect(sql).toContain('create unique index if not exists founder_content_cadence_active_content_key');
    expect(sql).toContain('create unique index if not exists founder_content_cadence_active_slot_key');
    expect(sql).toContain('and r.released_at is null');
  });

  it('keeps the cadence RPC service-role only', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog');
    expect(sql).toContain('to service_role;');
  });
});
