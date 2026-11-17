import {describe, expect, it} from 'vitest';
import {runFastlaneCouncil} from '../fastlaneCouncil.js';
import {buildOperatorRelayResponse} from '../operatorRelayProviderResult.js';
import type {OperatorRelayAdapter, OperatorRelayAdapters} from '../operatorRelayDispatch.js';

const seats = [
  {operator: 'codex', capability: 'propose'},
  {operator: 'claude-code', capability: 'propose'},
] as const;

function verdict(name: string): string {
  return [
    'REALITY: VERIFIED test fixture', `FIX: ${name} recommends the bounded route`,
    'PROOF: VERIFIED local test adapter', 'RISK: INFERRED not production',
    'ROLLBACK: disable opt-in mode', 'NEXT GATE: founder review',
  ].join('\n');
}
function reason(round: number, converged: boolean): string {
  return [
    'AGREE: preserve legacy', 'DISAGREE: none',
    'BLIND SPOT: runtime not proven',
    `VERDICT: ${round === 1 && !converged ? 'need more review' : 'opt-in only'}`,
    `CONVERGED: ${converged ? 'YES' : 'NO'}`,
  ].join('\n');
}
const task = [
  'TASK: verify the opt-in route', 'OWNER: codex',
  'REPO/SURFACE: jussray/founder-control-room',
  'DONE WHEN: focused tests and Playwright pass',
  'RECEIPT DUE: founder by next review',
].join('\n');
function adapter(name: string, seen: Array<{name: string; goal: string; context: string}>, opts: {
  missingStage1?: boolean; neverConverge?: boolean; twoRounds?: boolean;
} = {}): OperatorRelayAdapter {
  return async (request) => {
    seen.push({name, goal: request.goal, context: request.context.summary});
    let answer: string;
    if (request.goal.includes('STAGE 1')) {
      answer = opts.missingStage1 ? 'I agree with Claude.' : verdict(name);
    } else if (request.goal.includes('STAGE 2')) {
      const round = request.goal.includes('ROUND 2') ? 2 : 1;
      answer = reason(round, !opts.neverConverge && (!opts.twoRounds || round === 2));
    } else {
      answer = task;
    }
    return buildOperatorRelayResponse(request, {
      answer, evidenceRefs: ['simulated:fastlane:test'],
    });
  };
}
function adapters(seen: Array<{name: string; goal: string; context: string}>, opts: Parameters<typeof adapter>[2] = {}): OperatorRelayAdapters {
  return {'codex': adapter('codex', seen, opts), 'claude-code': adapter('claude', seen, opts)};
}
const input = {goal: 'Review an opt-in independent Council mode', seed: 'ORIGINAL PROMPT', seats: [...seats]};

describe('runFastlaneCouncil v1.1', () => {
  it('fans out blind verdicts and never passes one Stage 1 answer to another seat', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    const written: unknown[] = [];
    const result = await runFastlaneCouncil({
      ...input, persist: async (row) => { written.push(row); },
    }, adapters(seen));
    const first = seen.filter((item) => item.goal.includes('STAGE 1'));
    expect(first.map((item) => item.name).sort()).toEqual(['claude', 'codex']);
    expect(first.every((item) => item.context === 'ORIGINAL PROMPT')).toBe(true);
    expect(first.every((item) => !item.context.includes('recommends'))).toBe(true);
    expect(result.transcript.stage1.complete).toBe(true);
    expect(result.transcript.stage2.rounds).toHaveLength(1);
    expect(result.transcript.stage2.unanimous).toBe(true);
    expect(result.transcript.state).toBe('awaiting_acceptance');
    expect(result.transcript.stage3.tasks).toEqual([{
      task: 'verify the opt-in route', owner: 'codex',
      repoSurface: 'jussray/founder-control-room',
      doneWhen: 'focused tests and Playwright pass',
      receiptDue: 'founder by next review', acceptance: 'PENDING',
    }]);
    expect(result.transcript.humanRelay).toBe(false);
    expect(written).toEqual([result]);
    expect(result.transcript.stage1.spreadMs).toBeGreaterThanOrEqual(0);
  });

  it('starts all Stage 1 requests before any verdict resolves', async () => {
    const seen: string[] = [];
    const resolves: Array<() => void> = [];
    const slow = (name: string): OperatorRelayAdapter => async (request) => {
      if (request.goal.includes('STAGE 1')) {
        seen.push(name);
        await new Promise<void>((resolve) => { resolves.push(resolve); });
      }
      return buildOperatorRelayResponse(request, {
        answer: request.goal.includes('STAGE 1') ?
          verdict(name) : request.goal.includes('STAGE 2') ? reason(1, true) : task,
        evidenceRefs: ['simulated:fastlane:deferred-test'],
      });
    };
    const pending = runFastlaneCouncil(input, {codex: slow('codex'), 'claude-code': slow('claude')});
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.sort()).toEqual(['claude', 'codex']);
    resolves.forEach((resolve) => resolve());
    const result = await pending;
    expect(result.transcript.stage1.complete).toBe(true);
  });

  it('runs no more than two open reasoning rounds and escalates dissent', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    const result = await runFastlaneCouncil(input, adapters(seen, {neverConverge: true}));
    expect(result.transcript.stage2.rounds).toHaveLength(2);
    expect(result.transcript.stage2.unanimous).toBe(false);
    expect(result.transcript.stage3.state).toBe('FOUNDER_RULING');
    expect(result.transcript.stage3.escalation?.split).toHaveLength(2);
    expect(seen.filter((item) => item.goal.includes('STAGE 3'))).toHaveLength(0);
    const round2 = seen.filter((item) => item.goal.includes('STAGE 2 ROUND 2'));
    expect(round2.every((item) => item.context.includes('[REASONING ROUND 1'))).toBe(true);
  });

  it('allows convergence in round two without assigning tasks in reasoning', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    const result = await runFastlaneCouncil(input, adapters(seen, {twoRounds: true}));
    expect(result.transcript.stage2.rounds).toHaveLength(2);
    expect(result.transcript.stage2.unanimous).toBe(true);
    expect(result.transcript.stage3.tasks[0]?.acceptance).toBe('PENDING');
  });

  it('blocks missing or malformed independent verdicts before reasoning', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    const result = await runFastlaneCouncil(input, adapters(seen, {missingStage1: true}));
    expect(result.transcript.stage1.complete).toBe(false);
    expect(result.transcript.stage2.rounds).toHaveLength(0);
    expect(result.transcript.stage3.state).toBe('FOUNDER_RULING');
    expect(result.transcript.stage3.tasks).toHaveLength(0);
    // A reaction to another seat must be disqualified and rerun blind once.
    expect(seen.filter((item) => item.goal.includes('STAGE 1'))).toHaveLength(4);
    expect(seen.filter((item) => item.goal.includes('STAGE 1')
      && item.context !== 'ORIGINAL PROMPT')).toHaveLength(0);
  });

  it('rejects ownership declared during Stage 2 reasoning', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    const base = adapters(seen);
    const withEarlyOwnership = (inner: OperatorRelayAdapter): OperatorRelayAdapter => async (request) => {
      if (request.goal.includes('STAGE 2')) {
        return buildOperatorRelayResponse(request, {
          answer: reason(1, true) + '\nOWNER: codex',
          evidenceRefs: ['simulated:early-ownership'],
        });
      }
      return inner(request);
    };
    const result = await runFastlaneCouncil(input, {
      codex: withEarlyOwnership(base.codex!),
      'claude-code': withEarlyOwnership(base['claude-code']!),
    });
    expect(result.transcript.stage2.unanimous).toBe(false);
    expect(result.transcript.stage3.state).toBe('FOUNDER_RULING');
    expect(result.transcript.stage3.tasks).toHaveLength(0);
  });

  it('rejects restricted context and duplicate seats without sending providers', async () => {
    const seen: Array<{name: string; goal: string; context: string}> = [];
    await expect(runFastlaneCouncil({...input, sensitivity: 'restricted'}, adapters(seen))).rejects.toThrow('restricted');
    await expect(runFastlaneCouncil({...input, seats: [seats[0], seats[0]]}, adapters(seen))).rejects.toThrow('distinct');
    expect(seen).toHaveLength(0);
  });
});
