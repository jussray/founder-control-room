import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyFounderContentCadenceSchedule,
  buildFounderContentCadenceTelemetry,
  FOUNDER_CONTENT_CADENCE_POLICY,
  FOUNDER_CONTENT_MIN_GAP_MINUTES,
  reserveFounderContentCadence,
} from '../founderContentCadence.js';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const REQUESTED = '2026-08-17T16:20:00.000Z';
const RETRY_REQUESTED = '2026-08-17T16:40:00.000Z';
const APPROVAL_EXPIRES_AT = '2026-08-17T18:20:00.000Z';
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222';
const EXPIRY_GUARD_MIGRATION = 'supabase/migrations/20260830113000_founder_content_cadence_expiry_guard.sql';

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    reservation_id: RESERVATION_ID,
    cadence_policy_id: FOUNDER_CONTENT_CADENCE_POLICY,
    requested_schedule_at: REQUESTED,
    reserved_schedule_at: REQUESTED,
    deferred_seconds: 0,
    ...overrides,
  };
}

function rpcClient(
  row = rpcRow(),
  error: { message: string } | null = null,
  expectedRequested = REQUESTED,
) {
  return {
    async rpc(functionName: string, args: Record<string, unknown>) {
      expect(functionName).toBe('reserve_founder_content_cadence');
      expect(args).toEqual({
        p_provider: 'buffer',
        p_channel: 'juss_rayy_linkedin',
        p_content_id: CONTENT_ID,
        p_requested_schedule_at: expectedRequested,
        p_approval_expires_at: APPROVAL_EXPIRES_AT,
      });
      return { data: row ? [row] : null, error };
    },
  };
}

describe('founder-content hourly cadence', () => {
  it('keeps the 20-minute requested schedule when the hourly lane is empty', async () => {
    const reservation = await reserveFounderContentCadence({
      provider: 'BUFFER',
      channel: 'JUSS_RAYY_LINKEDIN',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient());

    expect(reservation.policyId).toBe('founder-content-hourly-cap-v1');
    expect(reservation.requestedScheduleAt).toBe(REQUESTED);
    expect(reservation.reservedScheduleAt).toBe(REQUESTED);
    expect(reservation.deferred).toBe(false);
    expect(reservation.deferredSeconds).toBe(0);
  });

  it('accepts a server-reserved later slot and records the delay without exposing copy', async () => {
    const reserved = '2026-08-17T17:20:00.000Z';
    const reservation = await reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({ reserved_schedule_at: reserved, deferred_seconds: 3600 })));

    expect(reservation.reservedScheduleAt).toBe(reserved);
    expect(reservation.deferred).toBe(true);
    expect(reservation.deferredSeconds).toBe(3600);

    const telemetry = buildFounderContentCadenceTelemetry(reservation);
    expect(telemetry).toEqual({
      event: 'fcr:founder-content-cadence',
      policyId: 'founder-content-hourly-cap-v1',
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      deferred: true,
      deferredSeconds: 3600,
      minimumGapMinutes: 60,
    });
    expect(JSON.stringify(telemetry)).not.toContain('post');
    expect(FOUNDER_CONTENT_MIN_GAP_MINUTES).toBe(60);
  });

  it('changes only the provider schedule after cadence reservation and preserves founder review timing', async () => {
    const reservation = await reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({
      reserved_schedule_at: '2026-08-17T17:20:00.000Z',
      deferred_seconds: 3600,
    })));
    const envelope = {
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      content_id: CONTENT_ID,
      provider_request: {
        schedule_at: REQUESTED,
        review_deadline: REQUESTED,
        review_window_minutes: 20,
      },
      text: 'public copy remains unchanged',
    };

    const adjusted = applyFounderContentCadenceSchedule(envelope, reservation);
    expect(adjusted.provider_request.schedule_at).toBe('2026-08-17T17:20:00.000Z');
    expect(adjusted.provider_request.review_deadline).toBe(REQUESTED);
    expect(adjusted.provider_request.review_window_minutes).toBe(20);
    expect(adjusted.text).toBe(envelope.text);
    expect(envelope.provider_request.schedule_at).toBe(REQUESTED);
  });

  it('reuses the canonical cadence slot and original review deadline across a fresh retry timestamp', async () => {
    const reserved = '2026-08-17T17:20:00.000Z';
    const reservation = await reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: RETRY_REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({
      requested_schedule_at: REQUESTED,
      reserved_schedule_at: reserved,
      deferred_seconds: 3600,
    }), null, RETRY_REQUESTED));

    expect(reservation.requestedScheduleAt).toBe(REQUESTED);
    expect(reservation.reservedScheduleAt).toBe(reserved);

    const adjusted = applyFounderContentCadenceSchedule({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      content_id: CONTENT_ID,
      provider_request: {
        schedule_at: RETRY_REQUESTED,
        review_deadline: RETRY_REQUESTED,
        review_window_minutes: 20,
      },
      text: 'same exact authorized content',
    }, reservation);

    expect(adjusted.provider_request.schedule_at).toBe(reserved);
    expect(adjusted.provider_request.review_deadline).toBe(REQUESTED);
    expect(adjusted.provider_request.review_window_minutes).toBe(20);
  });

  it('rejects a cadence row whose canonical review origin postdates the current request', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({
      requested_schedule_at: '2026-08-17T16:30:00.000Z',
      reserved_schedule_at: '2026-08-17T17:20:00.000Z',
      deferred_seconds: 3000,
    })))).rejects.toThrow(/may not postdate current request/);
  });

  it('rejects a reservation being replayed onto a different content or channel', async () => {
    const reservation = await reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient());

    expect(() => applyFounderContentCadenceSchedule({
      provider: 'buffer',
      channel: 'other_linkedin',
      content_id: CONTENT_ID,
      provider_request: { schedule_at: REQUESTED },
    }, reservation)).toThrow(/destination identity mismatch/);
  });

  it('fails closed when database policy identity drifts', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({ cadence_policy_id: 'different-policy' })))).rejects.toThrow(/policy identity mismatch/);
  });

  it('fails closed when the database tries to move a post earlier than founder review allows', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({
      reserved_schedule_at: '2026-08-17T16:19:59.000Z',
      deferred_seconds: 0,
    })))).rejects.toThrow(/may not predate requested schedule/);
  });

  it('fails closed if a returned reservation reaches or exceeds approval expiry', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow({
      reserved_schedule_at: APPROVAL_EXPIRES_AT,
      deferred_seconds: 7200,
    })))).rejects.toThrow(/must remain before approval expiry/);
  });

  it('fails before durable cadence authority when requested schedule is already outside approval', async () => {
    let touchedRpc = false;
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: REQUESTED,
    }, {
      async rpc() {
        touchedRpc = true;
        return { data: [rpcRow()], error: null };
      },
    })).rejects.toThrow(/approvalExpiresAt must be later than requestedScheduleAt/);
    expect(touchedRpc).toBe(false);
  });

  it('fails closed when cadence storage is unavailable', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss_rayy_linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient(rpcRow(), { message: 'database unavailable' }))).rejects.toThrow(/CADENCE_RESERVATION_FAILED/);
  });

  it('rejects caller-shaped identifiers before touching durable cadence authority', async () => {
    await expect(reserveFounderContentCadence({
      provider: 'buffer',
      channel: 'juss rayy linkedin',
      contentId: CONTENT_ID,
      requestedScheduleAt: REQUESTED,
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }, rpcClient())).rejects.toThrow(/channel is invalid/);
  });

  it('locks atomic rolling-hour semantics and service-role-only storage in the migration', () => {
    const migration = readFileSync(
      'supabase/migrations/20260817160605_founder_content_hourly_cadence.sql',
      'utf8',
    );

    expect(migration).toContain("latest_reserved_at + interval '1 hour'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("'founder-content-cadence:' || normalized_provider || ':' || normalized_channel");
    expect(migration).toContain('unique (provider, channel, content_id)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('grant execute on function public.reserve_founder_content_cadence');
    expect(migration).toContain('to service_role');
    expect(migration).not.toContain('post_text');
  });

  it('rejects approval-expired deferred slots inside the atomic RPC before any insert', () => {
    const migration = readFileSync(EXPIRY_GUARD_MIGRATION, 'utf8');
    const expiryGuard = "if next_reserved_at >= p_approval_expires_at then";
    const guardIndex = migration.indexOf(expiryGuard);
    const insertIndex = migration.indexOf('insert into public.founder_content_cadence_reservations', guardIndex);

    expect(migration).toContain('p_approval_expires_at timestamptz');
    expect(migration).toContain("raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(guardIndex);
    expect(migration).toContain('drop function public.reserve_founder_content_cadence(text, text, uuid, timestamptz)');
    expect(migration).toContain('grant execute on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) to service_role');
    expect(migration).not.toContain('delete from public.founder_content_cadence_reservations');
  });
});
