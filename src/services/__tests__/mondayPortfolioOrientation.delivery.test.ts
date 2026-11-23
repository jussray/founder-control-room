import { describe, expect, it, vi } from 'vitest';
import { makeSupabaseClient } from '../../lib/supabaseClient.js';
import { sendFounderControlRoomEmail } from '../../worker/projectEmail.js';
import { canRetryMondayPortfolioOrientation, runMondayPortfolioOrientationCycle } from '../mondayPortfolioOrientation.js';

vi.mock('../../lib/supabaseClient.js', () => ({ makeSupabaseClient: vi.fn() }));
vi.mock('../../worker/projectEmail.js', () => ({ sendFounderControlRoomEmail: vi.fn() }));

const monday = new Date('2026-10-05T12:00:00Z');
const later = new Date('2026-10-05T12:45:00Z');

function fakeClient(rejectReceipt = false) {
  let run: Record<string, unknown> | null = null;
  const writes: Record<string, unknown>[] = [];
  const runTable = {
    select(_columns: string) {
      const q = { eq(_k: string, _v: unknown) { return q; },
        async maybeSingle() { return { data: run, error: null }; } };
      return q;
    },
    async insert(record: Record<string, unknown>) {
      if (run) return { error: { code: '23505', message: 'duplicate' } };
      run = { ...record };
      return { error: null };
    },
    update(change: Record<string, unknown>) {
      const filters: Array<[string, unknown]> = [];
      const execute = () => {
        if (!run || !filters.every(([k, v]) => run?.[k] === v)) return { data: null, error: null };
        if (change.status === 'sent' && rejectReceipt) {
          return { data: null, error: { message: 'simulated sent receipt failure' } };
        }
        run = { ...run, ...change };
        writes.push(change);
        return { data: { week_key: run.week_key }, error: null };
      };
      const q = {
        eq(k: string, v: unknown) { filters.push([k, v]); return q; },
        select(_columns: string) { return q; },
        async maybeSingle() { return execute(); },
        then(resolve: (result: ReturnType<typeof execute>) => unknown) {
          return Promise.resolve(execute()).then(resolve);
        },
      };
      return q;
    },
  };
  function evidence(name: string) {
    const q = {
      select(_columns: string) { return q; },
      eq(_k: string, _v: unknown) { return q; },
      order(_k: string, _v: unknown) { return q; },
      limit(_n: number) { return q; },
      then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
        const data = name === 'projects'
          ? [{ id: 'fcr', slug: 'founder-control-room', repo_identifier: 'jussray/founder-control-room' }]
          : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return q;
  }
  return { client: { from(table: string) {
    return table === 'portfolio_orientation_runs' ? runTable : evidence(table);
  } }, getRun: () => run, writes };
}

describe('Monday founder orientation at-most-once email', () => {
  it('blocks stale running, sent, unknown and legacy failed states', () => {
    for (const [status, error_code] of [
      ['running', null],
      ['sent', null],
      ['failed', 'orientation_send_outcome_unknown_manual_reconcile'],
      ['failed', 'orientation_receipt_write_failed'],
    ] as const) {
      expect(canRetryMondayPortfolioOrientation({
        status, error_code, started_at: monday.toISOString(),
      }, later)).toBe(false);
    }
  });

  it('retries only known pre-send failures after ten minutes', () => {
    const r = { status: 'failed' as const, started_at: monday.toISOString(),
      error_code: 'orientation_pre_send_failed:orientation_projects_failed' };
    expect(canRetryMondayPortfolioOrientation(r, new Date('2026-10-05T12:09:59Z'))).toBe(false);
    expect(canRetryMondayPortfolioOrientation(r, new Date('2026-10-05T12:10:00Z'))).toBe(true);
    expect(canRetryMondayPortfolioOrientation({ ...r, started_at: 'invalid' }, later)).toBe(false);
  });

  it('does not resend after provider acceptance and database receipt failure', async () => {
    const s = fakeClient(true);
    vi.mocked(makeSupabaseClient).mockReturnValue(s.client as never);
    vi.mocked(sendFounderControlRoomEmail).mockReset().mockResolvedValue('provider-id');
    const env = { FCR_EMAIL: { send: vi.fn() } } as never;
    await expect(runMondayPortfolioOrientationCycle(env, monday))
      .rejects.toThrow('orientation_receipt_write_failed');
    expect(s.getRun()).toMatchObject({ status: 'failed', message_id: 'provider-id',
      error_code: 'orientation_send_outcome_unknown_manual_reconcile' });
    expect(s.writes).toHaveLength(1);
    expect(await runMondayPortfolioOrientationCycle(env, later)).toMatchObject({
      status: 'skipped', reason: 'week_already_claimed_or_sent',
    });
    expect(sendFounderControlRoomEmail).toHaveBeenCalledTimes(1);
  });

  it('does not resend after an ambiguous provider timeout', async () => {
    const s = fakeClient();
    vi.mocked(makeSupabaseClient).mockReturnValue(s.client as never);
    vi.mocked(sendFounderControlRoomEmail).mockReset().mockRejectedValue(new Error('provider-timeout'));
    const env = { FCR_EMAIL: { send: vi.fn() } } as never;
    await expect(runMondayPortfolioOrientationCycle(env, monday)).rejects.toThrow('provider-timeout');
    expect(s.getRun()).toMatchObject({ status: 'failed',
      error_code: 'orientation_send_outcome_unknown_manual_reconcile' });
    expect((await runMondayPortfolioOrientationCycle(env, later)).status).toBe('skipped');
    expect(sendFounderControlRoomEmail).toHaveBeenCalledTimes(1);
  });
});
