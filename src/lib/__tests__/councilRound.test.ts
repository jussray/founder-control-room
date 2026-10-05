import { describe, expect, it } from 'vitest';
import { CouncilLineageError, runCouncilRound, sha256, type CouncilConversationRow } from '../councilRound.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';
import type { OperatorRelayAdapter, OperatorRelayAdapters } from '../operatorRelayDispatch.js';

const fixedNow = () => new Date('2026-10-05T16:00:00.000Z');

/** Fake seat: records exactly what it received and answers deterministically. */
function seat(name: string, seen: Record<string, string>, opts: { fail?: boolean; status?: 'blocked' } = {}): OperatorRelayAdapter {
  return async (request) => {
    seen[name] = request.context.summary;
    if (opts.fail) throw new Error(`${name} provider unreachable`);
    return buildOperatorRelayResponse(request, {
      answer: `${name} on [${request.context.summary}]`,
      evidenceRefs: [`provider:${name}:resp-1`],
      completedAt: '2026-10-05T16:00:01.000Z',
      ...(opts.status ? { status: opts.status } : {}),
    });
  };
}

const seats = [
  { operator: 'claude-code', capability: 'propose' },
  { operator: 'deepseek', capability: 'propose' },
  { operator: 'muse', capability: 'propose' },
  { operator: 'gemini', capability: 'propose' },
] as const;

describe('runCouncilRound', () => {
  it('chains seats with zero human relay: each seat receives the previous answer byte-for-byte', async () => {
    const seen: Record<string, string> = {};
    const adapters: OperatorRelayAdapters = {
      'claude-code': seat('claude', seen),
      deepseek: seat('deepseek', seen),
      muse: seat('muse', seen),
      gemini: seat('gemini', seen),
    };
    const written: CouncilConversationRow[] = [];
    const row = await runCouncilRound({
      goal: 'Council telephone proof gate',
      initiator: 'codex',
      seed: 'A',
      seats: [...seats],
      now: fixedNow,
      persist: async (r) => { written.push(r); },
    }, adapters);

    expect(seen.claude).toBe('A');
    expect(seen.deepseek).toBe('claude on [A]');
    expect(seen.muse).toBe(`deepseek on [${seen.deepseek}]`);
    expect(seen.gemini).toBe(`muse on [${seen.muse}]`);

    const hops = row.transcript.hops;
    expect(row.transcript.state).toBe('complete');
    expect(row.transcript.humanRelay).toBe(false);
    expect(hops.map((h) => `${h.fromOperator}>${h.toOperator}`)).toEqual([
      'codex>claude-code', 'claude-code>deepseek', 'deepseek>muse', 'muse>gemini',
    ]);
    expect(hops[0].inputSha256).toBe(sha256('A'));
    for (let i = 1; i < hops.length; i += 1) expect(hops[i].inputSha256).toBe(hops[i - 1].answerSha256);
    expect(hops.every((h) => h.liveProviderEvidence)).toBe(true);
    expect(row.participants).toEqual(['codex', 'claude-code', 'deepseek', 'muse', 'gemini']);
    expect(row.outcome).toBe(hops[3].answer);
    expect(written).toEqual([row]);
  });

  it('interrupts on a failed seat and resumes from the exact checkpoint without re-calling finished seats', async () => {
    const seen: Record<string, string> = {};
    const calls: string[] = [];
    const counted = (name: string, inner: OperatorRelayAdapter): OperatorRelayAdapter => async (r) => {
      calls.push(name);
      return inner(r);
    };
    const first = await runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [...seats], now: fixedNow,
    }, {
      'claude-code': counted('claude', seat('claude', seen)),
      deepseek: counted('deepseek', seat('deepseek', seen, { fail: true })),
    });
    expect(first.transcript.state).toBe('interrupted');
    expect(first.transcript.nextSeatIndex).toBe(1);
    expect(first.transcript.interruption?.reason).toContain('unreachable');
    expect(first.outcome).toBe('interrupted at seat 1');

    const resumed = await runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: first.transcript,
    }, {
      'claude-code': counted('claude', seat('claude', seen)),
      deepseek: counted('deepseek', seat('deepseek', seen)),
      muse: counted('muse', seat('muse', seen)),
      gemini: counted('gemini', seat('gemini', seen)),
    });
    expect(resumed.transcript.state).toBe('complete');
    expect(calls).toEqual(['claude', 'deepseek', 'deepseek', 'muse', 'gemini']);
    expect(seen.deepseek).toBe('claude on [A]');
  });

  it('stops (not success) when a seat returns blocked', async () => {
    const row = await runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [...seats], now: fixedNow,
    }, { 'claude-code': seat('claude', {}, { status: 'blocked' }) });
    expect(row.transcript.state).toBe('interrupted');
    expect(row.transcript.hops).toHaveLength(1);
    expect(row.outcome).not.toContain('claude on');
  });

  it('fails closed when a resume transcript was tampered with', async () => {
    const first = await runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [...seats], now: fixedNow,
    }, { 'claude-code': seat('claude', {}) });
    const tampered = structuredClone(first.transcript);
    tampered.hops[0].answer = 'forged';
    await expect(runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: tampered,
    }, {})).rejects.toBeInstanceOf(CouncilLineageError);
  });

  it('labels a hop backed only by non-provider evidence as not live', async () => {
    const row = await runCouncilRound({
      goal: 'g', initiator: 'codex', seed: 'A', seats: [seats[0]], now: fixedNow,
    }, {
      'claude-code': async (request) => buildOperatorRelayResponse(request, {
        answer: 'simulated', evidenceRefs: ['simulated:role-analysis'], completedAt: '2026-10-05T16:00:01.000Z',
      }),
    });
    expect(row.transcript.hops[0].liveProviderEvidence).toBe(false);
  });
});
