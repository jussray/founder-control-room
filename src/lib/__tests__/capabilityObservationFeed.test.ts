import { describe, expect, it } from 'vitest';
import { foldRelayReceiptsIntoCapabilityObservation } from '../capabilityObservationFeed.js';
import { rankCapabilityCandidates, type CapabilityCandidate, type ExternalBenchmarkPrior } from '../modelCapabilityMarket.js';
import { OPERATOR_RELAY_RESPONSE_CONTRACT, type OperatorRelayResponseV1, type RelayOperatorId, type RelayStatus } from '../operatorRelay.js';

let seq = 0;

function receipt(
  fromOperator: RelayOperatorId,
  status: RelayStatus,
  overrides: Partial<Pick<OperatorRelayResponseV1, 'evidenceRefs' | 'completedAt' | 'unresolved'>> & { authorityRequested?: string } = {},
): OperatorRelayResponseV1 {
  seq += 1;
  const base = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: `relay-${seq}`,
    requestHash: `sha256:req-${seq}`,
    fromOperator,
    toOperator: 'claude-code' as RelayOperatorId,
    status,
    answer: `answer ${seq}`,
    evidenceRefs: overrides.evidenceRefs ?? [`receipt:${fromOperator}:${seq}`],
    unresolved: overrides.unresolved ?? [],
    authorityRequested: (overrides.authorityRequested ?? 'none') as 'none',
    completedAt: overrides.completedAt ?? `2026-09-29T1${seq % 10}:00:00.000Z`,
    responseHash: `sha256:res-${seq}`,
  };
  return base;
}

describe('capability observation feed from operator relay receipts', () => {
  it('folds outcome receipts into one deterministic observation and ignores in-flight receipts', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [
        receipt('codex', 'completed', { evidenceRefs: ['ci:run/1'], completedAt: '2026-09-29T10:00:00.000Z' }),
        receipt('codex', 'completed', { evidenceRefs: ['ci:run/2', 'ci:run/1'], completedAt: '2026-09-29T12:00:00.000Z' }),
        receipt('codex', 'completed', { evidenceRefs: ['playwright:trace/3'], completedAt: '2026-09-29T11:00:00.000Z' }),
        receipt('codex', 'failed', { evidenceRefs: ['ci:run/4'], completedAt: '2026-09-29T09:00:00.000Z' }),
        receipt('codex', 'blocked', { evidenceRefs: [], completedAt: '2026-09-29T08:00:00.000Z' }),
        receipt('codex', 'accepted', { evidenceRefs: [], completedAt: '2026-09-29T13:00:00.000Z' }),
      ],
    });

    expect(summary.consideredReceipts).toBe(5);
    expect(summary.ignoredInFlight).toBe(1);
    expect(summary.ignoredForeignOperator).toBe(0);
    expect(summary.observation).toEqual({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      observedAt: '2026-09-29T12:00:00.000Z',
      sampleSize: 5,
      successRate: 0.6,
      proofRate: 0.8,
      falseGreenRate: 0,
      authorityViolationRate: 0,
      evidenceRefs: ['ci:run/1', 'ci:run/2', 'ci:run/4', 'playwright:trace/3'],
    });
    expect(summary.observation).not.toHaveProperty('medianCostUsd');
    expect(summary.observation).not.toHaveProperty('medianDurationMs');
  });

  it('counts a completed receipt without evidence as a false green even when it bypassed the relay validator', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'muse',
      taskClass: 'cross-provider-drift',
      receipts: [
        receipt('muse', 'completed', { evidenceRefs: ['drift:diff/1'] }),
        receipt('muse', 'completed', { evidenceRefs: [] }),
        receipt('muse', 'completed', { evidenceRefs: ['   '] }),
        receipt('muse', 'failed', { evidenceRefs: ['drift:diff/4'] }),
      ],
    });
    expect(summary.observation?.sampleSize).toBe(4);
    expect(summary.observation?.successRate).toBe(0.75);
    expect(summary.observation?.proofRate).toBe(0.5);
    expect(summary.observation?.falseGreenRate).toBe(0.5);
  });

  it('counts any runtime authorityRequested other than none as an authority violation', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'gemini',
      taskClass: 'browser-runtime',
      receipts: [
        receipt('gemini', 'completed'),
        receipt('gemini', 'completed', { authorityRequested: 'merge' }),
      ],
    });
    expect(summary.observation?.authorityViolationRate).toBe(0.5);
  });

  it('never re-attributes receipts answered by another operator and returns no observation when none remain', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'deepseek',
      taskClass: 'architecture-review',
      receipts: [receipt('codex', 'completed'), receipt('claude-code', 'failed'), receipt('deepseek', 'accepted')],
    });
    expect(summary.observation).toBeNull();
    expect(summary.consideredReceipts).toBe(0);
    expect(summary.ignoredForeignOperator).toBe(2);
    expect(summary.ignoredInFlight).toBe(1);
  });

  it('feeds the market for the multimodal-generation task class so receipts, not benchmarks, decide eligibility', () => {
    const now = new Date('2026-09-29T15:00:00.000Z');
    const candidates: CapabilityCandidate[] = [
      { operatorId: 'gemini', providerFamily: 'google', taskClasses: ['multimodal-generation'], capability: 'implement' },
      { operatorId: 'muse', providerFamily: 'meta', taskClasses: ['multimodal-generation'], capability: 'implement' },
    ];
    const fed = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'gemini',
      taskClass: 'multimodal-generation',
      receipts: Array.from({ length: 5 }, (_, index) =>
        receipt('gemini', 'completed', { evidenceRefs: [`asset:sha256/${index}`], completedAt: '2026-09-29T14:00:00.000Z' })),
    });
    const benchmarkPriors: ExternalBenchmarkPrior[] = [
      { operatorId: 'muse', taskClass: 'multimodal-generation', observedAt: '2026-09-29T13:00:00.000Z', score: 1, sourceRef: 'public-benchmark:muse' },
    ];

    const ranked = rankCapabilityCandidates({
      taskClass: 'multimodal-generation',
      candidates,
      observations: fed.observation ? [fed.observation] : [],
      benchmarkPriors,
      options: { now },
    });

    expect(ranked.find((candidate) => candidate.operatorId === 'gemini')?.status).toBe('eligible');
    expect(ranked.find((candidate) => candidate.operatorId === 'muse')?.status).toBe('trial');
    expect(ranked[0]?.operatorId).toBe('gemini');
    expect(ranked.every((candidate) => candidate.selectionAuthority === false && candidate.executionAuthority === false)).toBe(true);
  });
});
