import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawProviderEvent } from '../inbox.js';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  tableUpsert: vi.fn(),
  tableSelect: vi.fn(),
  tableUpdate: vi.fn(),
  upsertSelect: vi.fn(),
  upsertSingle: vi.fn(),
  lookupEq: vi.fn(),
  lookupMaybeSingle: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  updateMaybeSingle: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import {
  markEventFailed,
  markEventProcessed,
  persistProviderEvent,
} from '../inbox.js';

const event: RawProviderEvent = {
  provider: 'github',
  projectId: 'project-1',
  providerEventId: 'delivery-1',
  eventType: 'pull_request',
  resourceType: 'pull_request',
  resourceId: '79',
  payload: { action: 'opened' },
};

const tableChain = {
  upsert: mocks.tableUpsert,
  select: mocks.tableSelect,
  update: mocks.tableUpdate,
};

const upsertChain = {
  select: mocks.upsertSelect,
  single: mocks.upsertSingle,
};

const lookupChain = {
  eq: mocks.lookupEq,
  maybeSingle: mocks.lookupMaybeSingle,
};

const updateChain = {
  eq: mocks.updateEq,
  select: mocks.updateSelect,
  maybeSingle: mocks.updateMaybeSingle,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'provider_events') throw new Error(`Unexpected table ${table}`);
    return tableChain;
  });
  mocks.tableUpsert.mockReturnValue(upsertChain);
  mocks.upsertSelect.mockReturnValue(upsertChain);
  mocks.tableSelect.mockReturnValue(lookupChain);
  mocks.lookupEq.mockReturnValue(lookupChain);
  mocks.tableUpdate.mockReturnValue(updateChain);
  mocks.updateEq.mockReturnValue(updateChain);
  mocks.updateSelect.mockReturnValue(updateChain);

  mocks.upsertSingle.mockResolvedValue({ data: { id: 'event-1' }, error: null });
  mocks.lookupMaybeSingle.mockResolvedValue({ data: { id: 'event-1' }, error: null });
  mocks.updateMaybeSingle.mockResolvedValue({ data: { id: 'event-1' }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe('persistProviderEvent', () => {
  it('returns the persisted row id for a new event', async () => {
    await expect(persistProviderEvent(event)).resolves.toEqual({
      id: 'event-1',
      isDuplicate: false,
    });

    expect(mocks.tableUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'github',
        project_id: 'project-1',
        provider_event_id: 'delivery-1',
        processing_status: 'pending',
        attempt_count: 0,
      }),
      {
        onConflict: 'provider,provider_event_id',
        ignoreDuplicates: true,
      },
    );
  });

  it('resolves a duplicate only after the existing row lookup succeeds', async () => {
    mocks.upsertSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No row returned' },
    });
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: { id: 'existing-event' },
      error: null,
    });

    await expect(persistProviderEvent(event)).resolves.toEqual({
      id: 'existing-event',
      isDuplicate: true,
    });
    expect(mocks.lookupEq).toHaveBeenNthCalledWith(1, 'provider', 'github');
    expect(mocks.lookupEq).toHaveBeenNthCalledWith(
      2,
      'provider_event_id',
      'delivery-1',
    );
  });

  it('fails closed when the duplicate lookup errors', async () => {
    mocks.upsertSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No row returned' },
    });
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'lookup unavailable' },
    });

    await expect(persistProviderEvent(event)).rejects.toThrow(
      'Failed to resolve duplicate provider event: lookup unavailable',
    );
  });

  it('fails closed when the duplicate lookup returns no row', async () => {
    mocks.upsertSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No row returned' },
    });
    mocks.lookupMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(persistProviderEvent(event)).rejects.toThrow(
      'Failed to resolve duplicate provider event: database returned no row id',
    );
  });

  it('fails closed when a nominally successful insert returns no row', async () => {
    mocks.upsertSingle.mockResolvedValue({ data: null, error: null });

    await expect(persistProviderEvent(event)).rejects.toThrow(
      'Failed to persist provider event: database returned no row id',
    );
  });

  it('propagates ordinary persistence errors', async () => {
    mocks.upsertSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'write unavailable' },
    });

    await expect(persistProviderEvent(event)).rejects.toThrow(
      'Failed to persist provider event: write unavailable',
    );
  });
});

describe('markEventProcessed', () => {
  it('requires a confirmed updated row', async () => {
    await expect(markEventProcessed('event-1')).resolves.toBeUndefined();

    expect(mocks.tableUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_status: 'processed',
        last_error: null,
      }),
    );
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'event-1');
    expect(mocks.updateSelect).toHaveBeenCalledWith('id');
  });

  it('throws when the processed update fails', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'update unavailable' },
    });

    await expect(markEventProcessed('event-1')).rejects.toThrow(
      'Failed to mark provider event processed: update unavailable',
    );
  });

  it('throws when no provider event row was updated', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(markEventProcessed('missing-event')).rejects.toThrow(
      'Failed to mark provider event processed: database returned no row id',
    );
  });
});

describe('markEventFailed', () => {
  it('confirms the failed update and increments the attempt counter', async () => {
    await expect(
      markEventFailed('event-1', `private\u0000failure\n${'x'.repeat(1_200)}`),
    ).resolves.toBeUndefined();

    const update = mocks.tableUpdate.mock.calls[0][0];
    expect(update.processing_status).toBe('failed');
    expect(update.last_error).not.toContain('\u0000');
    expect(update.last_error).not.toContain('\n');
    expect(update.last_error).toHaveLength(1_000);
    expect(mocks.rpc).toHaveBeenCalledWith('increment_attempt_count', {
      row_id: 'event-1',
    });
  });

  it('does not increment attempts when the failed update errors', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'update unavailable' },
    });

    await expect(markEventFailed('event-1', 'failure')).rejects.toThrow(
      'Failed to mark provider event failed: update unavailable',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not increment attempts when no event row was updated', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(markEventFailed('missing-event', 'failure')).rejects.toThrow(
      'Failed to mark provider event failed: database returned no row id',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('surfaces attempt increment failures', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'rpc unavailable' } });

    await expect(markEventFailed('event-1', 'failure')).rejects.toThrow(
      'Failed to increment provider event attempts: rpc unavailable',
    );
  });
});
