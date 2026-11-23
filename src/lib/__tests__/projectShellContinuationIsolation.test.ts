import { describe, expect, it, vi } from 'vitest';

const { fromSpy, guard } = vi.hoisted(() => ({
  fromSpy: vi.fn(),
  guard: { taskFilterApplied: false },
}));

vi.mock('../supabaseClient.js', () => ({ supabase: { from: fromSpy } }));
import { readProjectShellState } from '../projectShellState.js';

class ReadQuery {
  constructor(private readonly table: string) {}

  select(_fields: string) { return this; }
  eq(_column: string, _value: unknown) { return this; }
  is(column: string, value: unknown) {
    if (this.table === 'continuity_records'
      && column === 'task_id' && value === null) {
      guard.taskFilterApplied = true;
    }
    return this;
  }
  order(_column: string, _opts: { ascending: boolean }) { return this; }
  limit(_count: number) { return this; }
  async maybeSingle() {
    if (this.table === 'continuity_records') {
      return {
        data: guard.taskFilterApplied
          ? { valid_until: '2099-01-01T00:00:00Z', invalidated_at: null }
          : { valid_until: '2020-01-01T00:00:00Z', invalidated_at: null },
        error: null,
      };
    }
    if (this.table === 'truth_snapshots') {
      return {
        data: {
          classification: 'verified',
          observed_at: '2026-11-15T20:00:00Z',
          expires_at: '2099-01-01T00:00:00Z',
          conflicts: [],
        },
        error: null,
      };
    }
    if (this.table === 'outcomes') {
      return { data: { classification: 'achieved', evidence: [{ ref: 'proof' }] }, error: null };
    }
    return { data: null, error: null };
  }
}

describe('canonical project truth excludes unverified chat-work task packets', () => {
  it('reads only legacy truth-continuity rows with task_id IS NULL', async () => {
    guard.taskFilterApplied = false;
    fromSpy.mockImplementation((table: string) => new ReadQuery(table));
    const state = await readProjectShellState('project-1');
    expect(guard.taskFilterApplied).toBe(true);
    expect(state.continuity.valid).toBe(true);
    expect(state.classification).toBe('verified');
  });
});
