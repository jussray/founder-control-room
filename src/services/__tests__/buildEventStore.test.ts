import { describe, expect, it, vi } from 'vitest';
import { createBuildEvent } from '../../buildEvents/buildEvent.js';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import { loadBuildEvents } from '../buildEventStore.js';

const SHA = 'a'.repeat(40);

function sourceEvent() {
  return createBuildEvent({
    eventId: 'github:retained-main-source',
    occurredAt: '2026-08-20T16:00:00Z',
    source: 'github',
    category: 'source',
    phase: 'build',
    truth: 'verified',
    authority: 'observed',
    status: 'completed',
    repository: {
      name: 'jussray/Sekret-Bip',
      branch: 'main',
      refKind: 'branch-head',
      commitSha: SHA,
    },
    evidenceRefs: ['test:retained-main-source'],
  });
}

function query(rows: unknown[]) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.contains.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data: rows, error: null });
  return builder;
}

describe('build-event read retention', () => {
  it('retains the newest validated main source fact when it has aged out of the bounded general feed', async () => {
    const generalFeed = query([]);
    const retainedMain = query([{ metadata: sourceEvent() }]);
    mockFrom
      .mockReturnValueOnce(generalFeed)
      .mockReturnValueOnce(retainedMain);

    const result = await loadBuildEvents('project-1');

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventId).toBe('github:retained-main-source');
    expect(retainedMain.contains).toHaveBeenCalledWith('metadata', expect.objectContaining({
      category: 'source',
      truth: 'verified',
      repository: { branch: 'main', refKind: 'branch-head' },
    }));
  });
});
