import { describe, expect, it } from 'vitest';
import { foldRelayReceiptsIntoCapabilityObservation } from '../capabilityObservationFeed.js';
import { rankCapabilityCandidates, type CapabilityCandidate, type ExternalBenchmarkPrior } from '../modelCapabilityMarket.js';
import { OPERATOR_RELAY_RESPONSE_CONTRACT, operatorRelayResponseHash, type OperatorRelayResponseV1, type RelayOperatorId, type RelayStatus } from '../operatorRelay.js';

let seq = 0;

function receipt(
  fromOperator: RelayOperatorId,
  status: RelayStatus,
  overrides: Partial<Pick<OperatorRelayResponseV1, 'relayId' | 'responseHash' | 'evidenceRefs' | 'completedAt' | 'unresolved'>> & { authorityRequested?: unknown } = {},
): OperatorRelayResponseV1 {
  seq += 1;
  const base: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: overrides.relayId ?? `relay-${seq}`,
    requestHash: `sha256:req-${seq}`,
    fromOperator,
    toOperator: 'claude-code',
    status,
    answer: `answer ${seq}`,
    evidenceRefs: overrides.evidenceRefs ?? [`receipt:${fromOperator}:${seq}`],
    unresolved: overrides.unresolved ?? [],
    // Out-of-contract fixtures are built on purpose: the fold must count what the validator would reject.
    authorityRequested: ('authorityRequested' in overrides ? overrides.authorityRequested : 'none') as 'none',
    completedAt: overrides.completedAt ?? `2026-09-29T1${seq % 10}:00:00.000Z`,
  };
  // Only intentionally malformed fixtures lack a canonical response hash.
  let computedHash: string;
  try { computedHash = operatorRelayResponseHash(base); }
  catch { computedHash = `sha256:malformed-${seq}`; }
  return { ...base, responseHash: overrides.responseHash ?? computedHash };
}

const NOW = new Date('2026-09-29T15:00:00.000Z');
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe('capability observation feed from operator relay receipts', () => {
  it('folds outcome receipts deterministically, ignores in-flight receipts, and excludes blocked from the success denominator', () => {
    const receipts = [
      receipt('codex', 'completed', { relayId: 'r1', evidenceRefs: ['ci:run/1'], completedAt: '2026-09-29T10:00:00.000Z' }),
      receipt('codex', 'completed', { relayId: 'r2', evidenceRefs: ['ci:run/2 ', 'ci:run/1'], completedAt: '2026-09-29T12:00:00.000Z' }),
      receipt('codex', 'completed', { relayId: 'r3', evidenceRefs: ['playwright:trace/3'], completedAt: '2026-09-29T11:00:00.000Z' }),
      receipt('codex', 'failed', { relayId: 'r4', evidenceRefs: ['ci:run/4'], completedAt: '2026-09-29T09:00:00.000Z' }),
      receipt('codex', 'blocked', { relayId: 'r5', evidenceRefs: [], completedAt: '2026-09-29T08:00:00.000Z' }),
      receipt('codex', 'accepted', { relayId: 'r6', evidenceRefs: [], completedAt: '2026-09-29T13:00:00.000Z' }),
    ];
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts,
      verifiedResponseHashes: new Set(receipts.filter((entry) => ['r1', 'r2', 'r3', 'r4'].includes(entry.relayId)).map((entry) => entry.responseHash)),
    });

    expect(summary.consideredReceipts).toBe(5);
    expect(summary.ignoredInFlight).toBe(1);
    expect(summary.ignoredForeignOperator).toBe(0);
    expect(summary.ignoredDuplicate).toBe(0);
    expect(summary.supersededByLaterOutcome).toBe(0);
    expect(summary.ignoredStale).toBe(0);
    expect(summary.observation).toEqual({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      observedAt: '2026-09-29T12:00:00.000Z',
      sampleSize: 5,
      successRate: 0.75,
      proofRate: 0.8,
      verifiedCompletedCount: 3,
      falseGreenRate: 0,
      authorityViolationRate: 0,
      evidenceRefs: ['ci:run/1', 'ci:run/2', 'ci:run/4', 'playwright:trace/3'],
    });
    expect(summary.observation).not.toHaveProperty('medianCostUsd');
    expect(summary.observation).not.toHaveProperty('medianDurationMs');

    const reordered = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair', receipts: [...receipts].reverse(), verifiedResponseHashes: new Set(receipts.filter((entry) => ['r1', 'r2', 'r3', 'r4'].includes(entry.relayId)).map((entry) => entry.responseHash)),
    });
    expect(reordered.observation).toEqual(summary.observation);
  });

  it('treats a provider answering as unproven: without a verifier no evidence is carried and the market keeps the operator in trial', () => {
    const receipts = Array.from({ length: 5 }, (_, index) =>
      receipt('gemini', 'completed', { relayId: `g${index}`, evidenceRefs: [`provider:google:response-${index}`], completedAt: '2026-09-29T14:00:00.000Z' }));
    const candidates: CapabilityCandidate[] = [
      { operatorId: 'gemini', providerFamily: 'google', taskClasses: ['multimodal-generation'], capability: 'implement' },
      { operatorId: 'muse', providerFamily: 'meta', taskClasses: ['multimodal-generation'], capability: 'implement' },
    ];
    const benchmarkPriors: ExternalBenchmarkPrior[] = [
      { operatorId: 'muse', taskClass: 'multimodal-generation', observedAt: '2026-09-29T13:00:00.000Z', score: 1, sourceRef: 'public-benchmark:muse' },
    ];

    const unverified = foldRelayReceiptsIntoCapabilityObservation({ operatorId: 'gemini', taskClass: 'multimodal-generation', receipts });
    expect(unverified.observation?.sampleSize).toBe(5);
    expect(unverified.observation?.successRate).toBe(1);
    expect(unverified.observation?.proofRate).toBe(0);
    expect(unverified.observation?.falseGreenRate).toBe(0);
    expect(unverified.observation?.evidenceRefs).toEqual([]);
    const rankedUnverified = rankCapabilityCandidates({
      taskClass: 'multimodal-generation', candidates, observations: [unverified.observation!], benchmarkPriors, options: { now: NOW },
    });
    expect(rankedUnverified.find((candidate) => candidate.operatorId === 'gemini')?.status).toBe('trial');
    expect(rankedUnverified.find((candidate) => candidate.operatorId === 'gemini')?.localSamples).toBe(0);

    const verified = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'gemini', taskClass: 'multimodal-generation', receipts, verifiedResponseHashes: new Set(receipts.map((entry) => entry.responseHash)),
    });
    expect(verified.observation?.proofRate).toBe(1);
    expect(verified.observation?.verifiedCompletedCount).toBe(5);
    expect(verified.observation?.evidenceRefs.length).toBe(5);
    const rankedVerified = rankCapabilityCandidates({
      taskClass: 'multimodal-generation', candidates, observations: [verified.observation!], benchmarkPriors, options: { now: NOW },
    });
    expect(rankedVerified.find((candidate) => candidate.operatorId === 'gemini')?.status).toBe('eligible');
    expect(rankedVerified.find((candidate) => candidate.operatorId === 'muse')?.status).toBe('trial');
    expect(rankedVerified[0]?.operatorId).toBe('gemini');
    expect(rankedVerified.every((candidate) => candidate.selectionAuthority === false && candidate.executionAuthority === false)).toBe(true);
  });

  it('does not let stale receipts ride on one fresh receipt, and excludes receipts that cannot be placed in time', () => {
    const stale = Array.from({ length: 50 }, (_, index) =>
      receipt('codex', 'completed', { relayId: `old-${index}`, evidenceRefs: ['ci:run/old'], completedAt: '2026-03-01T00:00:00.000Z' }));
    const fresh = receipt('codex', 'failed', { relayId: 'fresh', evidenceRefs: ['ci:run/fresh'], completedAt: '2026-09-29T14:00:00.000Z' });
    const unplaceable = receipt('codex', 'completed', { relayId: 'nowhen', evidenceRefs: ['ci:run/x'], completedAt: 'not-a-date' });
    const verifiedResponseHashes = new Set([...stale, fresh, unplaceable].map((entry) => entry.responseHash));

    const windowed = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair', receipts: [...stale, fresh, unplaceable], verifiedResponseHashes, window: { now: NOW, maxAgeMs: THIRTY_DAYS },
    });
    expect(windowed.ignoredStale).toBe(51);
    expect(windowed.observation).toEqual({
      operatorId: 'codex', taskClass: 'repository-repair', observedAt: '2026-09-29T14:00:00.000Z',
      sampleSize: 1, successRate: 0, proofRate: 1, verifiedCompletedCount: 0, falseGreenRate: 0, authorityViolationRate: 0, evidenceRefs: ['ci:run/fresh'],
    });
    const candidates: CapabilityCandidate[] = [{ operatorId: 'codex', providerFamily: 'openai', taskClasses: ['repository-repair'], capability: 'implement' }];
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair', candidates, observations: [windowed.observation!], benchmarkPriors: [], options: { now: NOW },
    });
    expect(ranked[0]?.status).toBe('trial');

    const unwindowed = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair', receipts: [...stale, fresh, unplaceable], verifiedResponseHashes,
    });
    expect(unwindowed.ignoredStale).toBe(1);
    expect(unwindowed.observation?.sampleSize).toBe(51);
  });

  it('counts exact duplicates once and lets a later outcome for the same relayId supersede an earlier one', () => {
    const first = receipt('muse', 'completed', { relayId: 'same', evidenceRefs: ['drift:diff/1'], completedAt: '2026-09-29T10:00:00.000Z' });
    const correction = receipt('muse', 'failed', { relayId: 'same', evidenceRefs: ['drift:diff/1'], completedAt: '2026-09-29T11:00:00.000Z' });
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'muse', taskClass: 'cross-provider-drift', receipts: [first, first, first, correction], verifiedResponseHashes: new Set([correction.responseHash]),
    });
    expect(summary.ignoredDuplicate).toBe(2);
    expect(summary.supersededByLaterOutcome).toBe(1);
    expect(summary.consideredReceipts).toBe(1);
    expect(summary.observation?.sampleSize).toBe(1);
    expect(summary.observation?.successRate).toBe(0);
    expect(summary.observation?.observedAt).toBe('2026-09-29T11:00:00.000Z');
  });

  it('does not transfer proof to a later response that reuses an independently verified relay ID', () => {
    const first = receipt('codex', 'completed', {
      relayId: 'reused',
      evidenceRefs: ['ci:original'], completedAt: '2026-09-29T10:00:00.000Z',
    });
    const replacement = receipt('codex', 'completed', {
      relayId: 'reused',
      evidenceRefs: ['ci:unverified'], completedAt: '2026-09-29T11:00:00.000Z',
    });
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair',
      receipts: [first, replacement],
      verifiedResponseHashes: new Set([first.responseHash]),
    });
    expect(summary.consideredReceipts).toBe(1);
    expect(summary.supersededByLaterOutcome).toBe(1);
    expect(summary.observation?.proofRate).toBe(0);
    expect(summary.observation?.evidenceRefs).toEqual([]);
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair',
      candidates: [{ operatorId: 'codex', providerFamily: 'openai', taskClasses: ['repository-repair'], capability: 'implement' }],
      observations: [summary.observation!], options: { now: NOW, minLocalSamples: 1 },
    });
    expect(ranked[0]?.status).toBe('trial');
    // Only independent verification of the exact replacement hash can confer proof.
    const reverified = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair',
      receipts: [first, replacement], verifiedResponseHashes: new Set([replacement.responseHash]),
    });
    expect(reverified.observation?.proofRate).toBe(1);
    expect(reverified.observation?.verifiedCompletedCount).toBe(1);
    expect(reverified.observation?.evidenceRefs).toEqual(['ci:unverified']);
  });

  it('rejects forged content retaining an originally verified response hash', () => {
    const original = receipt('codex', 'completed', {
      relayId: 'tampered', evidenceRefs: ['ci:original'], completedAt: '2026-09-29T12:00:00.000Z',
    });
    const mutated = { ...original, evidenceRefs: ['ci:made-up-proof'] };
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex', taskClass: 'repository-repair',
      receipts: [mutated], verifiedResponseHashes: new Set([original.responseHash]),
    });
    expect(summary.observation?.proofRate).toBe(0);
    expect(summary.observation?.evidenceRefs).toEqual([]);
    expect(summary.observation?.sampleSize).toBe(1);
  });

  it('counts a completed receipt without evidence as a false green even when it bypassed the relay validator', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'muse',
      taskClass: 'cross-provider-drift',
      receipts: [
        receipt('muse', 'completed', { evidenceRefs: ['drift:diff/1'] }),
        receipt('muse', 'completed', { evidenceRefs: [] }),
        receipt('muse', 'completed', { evidenceRefs: ['   '] }),
        receipt('muse', 'completed', { evidenceRefs: 'drift:diff/str' as unknown as string[] }),
        receipt('muse', 'failed', { evidenceRefs: ['drift:diff/5'] }),
      ],
    });
    expect(summary.observation?.sampleSize).toBe(5);
    expect(summary.observation?.successRate).toBe(0.8);
    expect(summary.observation?.falseGreenRate).toBe(0.6);
    expect(summary.observation?.proofRate).toBe(0);
    expect(summary.observation?.evidenceRefs).toEqual([]);
  });

  it('counts anything other than the exact string none as an authority violation, including malformed values', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'gemini',
      taskClass: 'browser-runtime',
      receipts: [
        receipt('gemini', 'completed'),
        receipt('gemini', 'completed', { authorityRequested: 'merge' }),
        receipt('gemini', 'completed', { authorityRequested: ['none'] }),
        receipt('gemini', 'completed', { authorityRequested: undefined }),
      ],
    });
    expect(summary.observation?.authorityViolationRate).toBe(0.75);
  });

  it('never re-attributes receipts answered by another operator and returns no observation when none remain', () => {
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'muse',
      taskClass: 'architecture-review',
      receipts: [receipt('codex', 'completed'), receipt('claude-code', 'failed'), receipt('muse', 'accepted')],
    });
    expect(summary.observation).toBeNull();
    expect(summary.consideredReceipts).toBe(0);
    expect(summary.ignoredForeignOperator).toBe(2);
    expect(summary.ignoredInFlight).toBe(1);
  });
});
