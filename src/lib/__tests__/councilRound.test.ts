import { describe, expect, it } from 'vitest';
import { CouncilLineageError, runCouncilRound, sha256, type CouncilConversationRow } from '../councilRound.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';
import type { OperatorRelayAdapter, OperatorRelayAdapters } from '../operatorRelayDispatch.js';

const fixedNow = () => new Date('2026-10-05T16:00:00.000Z');

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
  { operator: 'perplexity', capability: 'propose' },
  { operator: 'muse', capability: 'propose' },
  { operator: 'gemini', capability: 'propose' },
] as const;

describe('runCouncilRound', () => {
  it('chains seats with zero human relay and preserves exact hop lineage', async () => {
    const seen: Record<string, string> = {};
    const adapters: OperatorRelayAdapters = {
      'claude-code': seat('claude', seen),
      perplexity: seat('perplexity', seen),
      muse: seat('muse', seen),
      gemini: seat('gemini', seen),
    };
    const written: CouncilConversationRow[] = [];
    const row = await runCouncilRound({
      goal: 'Council telephone proof gate',
      initiator: 'fcr',
      sourceRef: 'founder-attested:claude-code',
      seed: 'A',
      seats: [...seats],
      now: fixedNow,
      persist: async (r) => { written.push(r); },
    }, adapters);

    expect(seen.claude).toBe('A');
    expect(seen.perplexity).toBe('claude on [A]');
    expect(seen.muse).toBe(`perplexity on [${seen.perplexity}]`);
    expect(seen.gemini).toBe(`muse on [${seen.muse}]`);

    const hops = row.transcript.hops;
    expect(row.transcript.state).toBe('complete');
    expect(row.transcript.humanRelay).toBe(false);
    expect(row.transcript.sourceRef).toBe('founder-attested:claude-code');
    expect(hops.map((h) => `${h.fromOperator}>${h.toOperator}`)).toEqual([
      'fcr>claude-code', 'claude-code>perplexity', 'perplexity>muse', 'muse>gemini',
    ]);
    expect(hops[0].inputSha256).toBe(sha256('A'));
    for (let i = 1; i < hops.length; i += 1) expect(hops[i].inputSha256).toBe(hops[i - 1].answerSha256);
    expect(hops.every((h) => h.liveProviderEvidence)).toBe(true);
    expect(row.participants).toEqual(['fcr', 'claude-code', 'perplexity', 'muse', 'gemini']);
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
      goal: 'g', initiator: 'fcr', sourceRef: 'mission:m1', seed: 'A', seats: [...seats], now: fixedNow,
    }, {
      'claude-code': counted('claude', seat('claude', seen)),
      perplexity: counted('perplexity', seat('perplexity', seen, { fail: true })),
    });
    expect(first.transcript.state).toBe('interrupted');
    expect(first.transcript.nextSeatIndex).toBe(1);
    expect(first.transcript.interruption?.reason).toContain('unreachable');
    expect(first.outcome).toBe('interrupted at seat 1');

    const resumed = await runCouncilRound({
      goal: 'g', initiator: 'fcr', sourceRef: 'mission:m1', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: first.transcript,
    }, {
      'claude-code': counted('claude', seat('claude', seen)),
      perplexity: counted('perplexity', seat('perplexity', seen)),
      muse: counted('muse', seat('muse', seen)),
      gemini: counted('gemini', seat('gemini', seen)),
    });
    expect(resumed.transcript.state).toBe('complete');
    expect(calls).toEqual(['claude', 'perplexity', 'perplexity', 'muse', 'gemini']);
    expect(seen.perplexity).toBe('claude on [A]');
  });

  it('does not advance past a blocked seat and retries that exact seat on resume', async () => {
    const calls: string[] = [];
    const blocked = await runCouncilRound({
      goal: 'g', initiator: 'fcr', seed: 'A', seats: [...seats], now: fixedNow,
    }, {
      'claude-code': async (request) => {
        calls.push('blocked-claude');
        return buildOperatorRelayResponse(request, {
          status: 'blocked',
          answer: 'not accepted',
          evidenceRefs: ['provider:claude:blocked-1'],
          completedAt: '2026-10-05T16:00:01.000Z',
        });
      },
    });
    expect(blocked.transcript.state).toBe('interrupted');
    expect(blocked.transcript.hops).toHaveLength(0);
    expect(blocked.transcript.nextSeatIndex).toBe(0);
    expect(blocked.transcript.interruption).toMatchObject({ seatIndex: 0, operator: 'claude-code', status: 'blocked' });

    const resumed = await runCouncilRound({
      goal: 'g', initiator: 'fcr', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: blocked.transcript,
    }, {
      'claude-code': async (request) => {
        calls.push('completed-claude');
        return buildOperatorRelayResponse(request, {
          answer: 'claude accepted', evidenceRefs: ['provider:claude:ok-2'], completedAt: '2026-10-05T16:00:02.000Z',
        });
      },
      perplexity: seat('perplexity', {}),
      muse: seat('muse', {}),
      gemini: seat('gemini', {}),
    });
    expect(resumed.transcript.state).toBe('complete');
    expect(calls).toEqual(['blocked-claude', 'completed-claude']);
    expect(resumed.transcript.hops[0].toOperator).toBe('claude-code');
  });

  it('fails closed when a resume transcript was tampered with or provenance changed', async () => {
    const first = await runCouncilRound({
      goal: 'g', initiator: 'fcr', sourceRef: 'founder-attested:claude-code', seed: 'A', seats: [...seats], now: fixedNow,
    }, { 'claude-code': seat('claude', {}) });
    const tampered = structuredClone(first.transcript);
    tampered.hops[0].answer = 'forged';
    await expect(runCouncilRound({
      goal: 'g', initiator: 'fcr', sourceRef: 'founder-attested:claude-code', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: tampered,
    }, {})).rejects.toBeInstanceOf(CouncilLineageError);

    await expect(runCouncilRound({
      goal: 'g', initiator: 'fcr', sourceRef: 'founder-attested:codex', seed: 'A', seats: [...seats], now: fixedNow, resumeFrom: first.transcript,
    }, {})).rejects.toThrow('resume source reference mismatch');
  });

  it('labels a hop backed only by non-provider evidence as not live', async () => {
    const row = await runCouncilRound({
      goal: 'g', initiator: 'fcr', seed: 'A', seats: [seats[0]], now: fixedNow,
    }, {
      'claude-code': async (request) => buildOperatorRelayResponse(request, {
        answer: 'simulated', evidenceRefs: ['simulated:role-analysis'], completedAt: '2026-10-05T16:00:01.000Z',
      }),
    });
    expect(row.transcript.hops[0].liveProviderEvidence).toBe(false);
  });
});
