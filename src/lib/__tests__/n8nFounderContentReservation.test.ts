import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromMock },
}));

import {
  buildN8nFounderContentRequest,
  finalizeN8nFounderContentExecution,
  reserveN8nFounderContentExecution,
  type FirstPartyFounderScheduleEnvelope,
  type VerifiedN8nFounderContentReceipt,
} from '../n8nFounderContentOrchestrator.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const AUTH_HASH = 'a'.repeat(64);
const PROPOSAL_HASH = 'b'.repeat(64);
const PAYLOAD_HASH = 'c'.repeat(64);
const SOURCE_SHA = 'd'.repeat(40);
const RESERVATION_STARTED_AT = '2026-09-02T02:00:00.000Z';
const STALE_RESERVATION_STARTED_AT = '2026-09-02T01:57:00.000Z';

function envelope(): FirstPartyFounderScheduleEnvelope {
  return {
    version: 1,
    lane: 'first_party_founder_governed_schedule',
    provider: 'buffer',
    state: 'scheduled_review_window',
    content_id: '33333333-3333-4333-8333-333333333333',
    platform: 'linkedin',
    channel: 'juss_rayy_linkedin',
    text: 'A public founder progress update whose implementation details stay private.',
    source: {
      repo: 'jussray/founder-control-room',
      commit_sha: SOURCE_SHA,
    },
    authority: {
      publish_allowed: true,
      schedule_allowed: true,
      standing_policy_applied: false,
      authorization_mode: 'exact-current-you',
      authorization_receipt_verified: true,
      exact_current_you_approval_required: true,
      first_party_founder_content: true,
      founder_content_authorization_hash: AUTH_HASH,
      founder_content_proposal_hash: PROPOSAL_HASH,
      public_payload_hash: PAYLOAD_HASH,
      current_you_intent_id: 'current-you-founder-content',
      current_you_intent_version: 9,
    },
    provider_request: {
      method: 'schedule',
      save_to_draft: false,
      schedule_at: '2026-08-17T16:20:00.000Z',
      review_deadline: '2026-08-17T16:20:00.000Z',
      review_window_minutes: 20,
      share_now_allowed: false,
      external_write_included: false,
    },
  };
}

interface DbOptions {
  projectRows?: Array<{ id: string; repo_identifier: string }>;
  existing?: {
    id: string;
    mission_id: string | null;
    project_id: string;
    action_type: string;
    status: 'pending' | 'succeeded' | 'failed';
  } | null;
  finalizeRow?: { id: string } | null;
  currentStartedAt?: string;
  reservationStartedAt?: string | null;
}

function installDb(options: DbOptions = {}) {
  const events: string[] = [];
  const updateFilters: Array<Array<[string, unknown]>> = [];
  const insertMock = vi.fn((_payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        events.push('reserve');
        return {
          data: {
            id: EXECUTION_ID,
            started_at: options.reservationStartedAt === undefined
              ? RESERVATION_STARTED_AT
              : options.reservationStartedAt,
          },
          error: null,
        };
      },
    }),
  }));
  const updateMock = vi.fn((_payload: Record<string, unknown>) => {
    const filters: Array<[string, unknown]> = [];
    updateFilters.push(filters);
    const builder = {
      eq(field: string, value: unknown) {
        filters.push([field, value]);
        return builder;
      },
      select() {
        return {
          maybeSingle: async () => {
            const startedAtFilter = filters.find(([field]) => field === 'started_at')?.[1];
            const generationMatches = startedAtFilter === (options.currentStartedAt ?? RESERVATION_STARTED_AT);
            const data = options.finalizeRow === undefined
              ? (generationMatches ? { id: EXECUTION_ID } : null)
              : options.finalizeRow;
            return { data, error: null };
          },
        };
      },
    };
    return builder;
  });

  fromMock.mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: options.projectRows ?? [{ id: PROJECT_ID, repo_identifier: 'jussray/founder-control-room' }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'approval_executions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: options.existing ?? null, error: null }),
          }),
        }),
        insert: insertMock,
        update: updateMock,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { events, insertMock, updateMock, updateFilters };
}

function receipt(): VerifiedN8nFounderContentReceipt {
  return {
    orchestrationId: 'fcr-n8n-social-v1:test',
    provider: 'buffer',
    state: 'scheduled',
    providerItemId: 'buffer-item-1',
    providerRequestId: 'buffer-request-1',
    truthState: 'provider_schedule_receipt_pending_readback',
    published: false,
    requiresProviderReadback: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('n8n founder-content durable reservation', () => {
  it('reserves the exact authorization in FCR before external orchestration can proceed and carries the DB-returned generation', async () => {
    const db = installDb();
    const request = buildN8nFounderContentRequest(envelope());

    const result = await reserveN8nFounderContentExecution(request, 'Founder@Example.com');

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      executionId: EXECUTION_ID,
      projectId: PROJECT_ID,
      reservationStartedAt: RESERVATION_STARTED_AT,
    }));
    expect(db.events).toEqual(['reserve']);
    expect(db.insertMock).toHaveBeenCalledWith(expect.objectContaining({
      mission_id: null,
      project_id: PROJECT_ID,
      action_type: 'schedule_founder_content',
      idempotency_key: request.orchestrationId,
      executed_by: 'founder@example.com',
      status: 'pending',
      success: null,
      started_at: expect.any(String),
    }));
    const inserted = db.insertMock.mock.calls[0]?.[0] as { request?: unknown; started_at?: unknown };
    expect(inserted.started_at).toEqual(expect.any(String));
    expect(JSON.stringify(inserted.request)).not.toContain(envelope().text);
  });

  it('fails closed when the reservation write does not return an authoritative started_at generation', async () => {
    const db = installDb({ reservationStartedAt: null });
    const request = buildN8nFounderContentRequest(envelope());

    const result = await reserveN8nFounderContentExecution(request, 'Founder@Example.com');

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
    }));
    expect(db.events).toEqual(['reserve']);
  });

  it('blocks an exact authorization that is already reserved without creating another row', async () => {
    const db = installDb({
      existing: {
        id: EXECUTION_ID,
        mission_id: null,
        project_id: PROJECT_ID,
        action_type: 'schedule_founder_content',
        status: 'pending',
      },
    });
    const request = buildN8nFounderContentRequest(envelope());

    const result = await reserveN8nFounderContentExecution(request, 'founder@example.com');

    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'ACTION_ALREADY_RESERVED' }));
    expect(db.insertMock).not.toHaveBeenCalled();
  });

  it('fails closed when a globally unique key belongs to a different execution scope', async () => {
    const db = installDb({
      existing: {
        id: EXECUTION_ID,
        mission_id: null,
        project_id: '44444444-4444-4444-8444-444444444444',
        action_type: 'merge',
        status: 'succeeded',
      },
    });
    const request = buildN8nFounderContentRequest(envelope());

    const result = await reserveN8nFounderContentExecution(request, 'founder@example.com');

    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'IDEMPOTENCY_SCOPE_MISMATCH' }));
    expect(db.insertMock).not.toHaveBeenCalled();
  });

  it('requires an actual matched pending generation before claiming audit finalization', async () => {
    installDb({ finalizeRow: null });

    expect(await finalizeN8nFounderContentExecution(
      EXECUTION_ID,
      receipt(),
      RESERVATION_STARTED_AT,
    )).toBe(false);
  });

  it('finalizes only a matched pending reservation generation and retains provider read-back as the truth gate', async () => {
    const db = installDb({ currentStartedAt: RESERVATION_STARTED_AT });

    expect(await finalizeN8nFounderContentExecution(
      EXECUTION_ID,
      receipt(),
      RESERVATION_STARTED_AT,
    )).toBe(true);
    expect(db.updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded',
      success: true,
      result: expect.objectContaining({
        published: false,
        requiresProviderReadback: true,
      }),
    }));
    expect(db.updateFilters[0]).toContainEqual(['started_at', RESERVATION_STARTED_AT]);
  });

  it('prevents generation A from finalizing a row rearmed as generation B', async () => {
    const db = installDb({ currentStartedAt: RESERVATION_STARTED_AT });

    expect(await finalizeN8nFounderContentExecution(
      EXECUTION_ID,
      receipt(),
      STALE_RESERVATION_STARTED_AT,
    )).toBe(false);
    expect(await finalizeN8nFounderContentExecution(
      EXECUTION_ID,
      receipt(),
      RESERVATION_STARTED_AT,
    )).toBe(true);

    expect(db.updateFilters[0]).toContainEqual(['started_at', STALE_RESERVATION_STARTED_AT]);
    expect(db.updateFilters[1]).toContainEqual(['started_at', RESERVATION_STARTED_AT]);
  });
});
