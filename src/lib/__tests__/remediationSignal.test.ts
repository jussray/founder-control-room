import { describe, expect, it, vi } from 'vitest';
import { dispatchRemediationSignal, planRemediationSignal } from '../remediationSignal.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

const signal = { repository: 'jussray/example', pr: 7, head: 'a'.repeat(40), kind: 'ci_failed' as const };
const now = new Date('2026-11-25T12:00:00Z');

describe('FCR remediation signal', () => {
  it('routes CI to Codex and conflict to Claude, never converts a founder hold into work', () => {
    expect(planRemediationSignal(signal)?.target).toBe('codex');
    expect(planRemediationSignal({ ...signal, kind: 'merge_conflict' })?.target).toBe('claude-code');
    expect(planRemediationSignal({ ...signal, kind: 'founder_hold' })).toBeNull();
    expect(() => planRemediationSignal({ ...signal, head: 'abc' })).toThrow();
  });
  it('binds a minimized signal to the exact head, never grants write authority', async () => {
    const adapter = vi.fn(async (request) => buildOperatorRelayResponse(request, {
      answer: 'Plan only', evidenceRefs: ['provider:test:receipt'], completedAt: now.toISOString(),
    }));
    const result = await dispatchRemediationSignal(signal, { codex: adapter }, async () => true, now);
    expect(result.state).toBe('relay_returned');
    expect(adapter).toHaveBeenCalledTimes(1);
    const req = adapter.mock.calls[0][0];
    expect(req.context.summary).toContain(signal.head);
    expect(Object.values(req.authority)).toEqual([false, false, false, false, false]);
  });
  it('never dispatches duplicate, held, or unconnected work', async () => {
    const adapter = vi.fn();
    expect((await dispatchRemediationSignal(signal, { codex: adapter }, async () => false, now)).state).toBe('duplicate');
    expect((await dispatchRemediationSignal({ ...signal, kind: 'founder_hold' }, { codex: adapter }, async () => true, now)).state).toBe('held');
    expect((await dispatchRemediationSignal(signal, {}, async () => true, now)).state).toBe('blocked');
    expect(adapter).not.toHaveBeenCalled();
  });
});
