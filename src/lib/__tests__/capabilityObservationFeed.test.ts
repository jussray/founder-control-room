import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RepositoryProvider, VerificationSignal } from '../../providers/RepositoryProvider.js';
import {
  repositoryRepairSourceRef,
  verifyRepositoryRepairOutcome,
  type CapabilityOutcomeVerificationReceipt,
} from '../capabilityOutcomeVerification.js';
import { foldRelayReceiptsIntoCapabilityObservation } from '../capabilityObservationFeed.js';
import { rankCapabilityCandidates, type CapabilityCandidate, type ExternalBenchmarkPrior } from '../modelCapabilityMarket.js';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
  type RelayOperatorId,
  type RelayStatus,
} from '../operatorRelay.js';

let seq = 0;
const HEAD = 'a'.repeat(40);
const REPOSITORY = 'jussray/founder-control-room';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function receipt(
  fromOperator: RelayOperatorId,
  status: RelayStatus,
  overrides: Partial<Pick<OperatorRelayResponseV1, 'relayId' | 'responseHash' | 'evidenceRefs' | 'completedAt' | 'unresolved'>> & { authorityRequested?: unknown } = {},
): OperatorRelayResponseV1 {
  seq += 1;
  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: overrides.relayId ?? `relay-${seq}`,
    requestHash: sha256(`request-${seq}`),
    fromOperator,
    toOperator: 'fcr',
    status,
    answer: `answer ${seq}`,
    evidenceRefs: overrides.evidenceRefs ?? [`receipt:${fromOperator}:${seq}`],
    unresolved: overrides.unresolved ?? [],
    authorityRequested: ('authorityRequested' in overrides ? overrides.authorityRequested : 'none') as 'none',
    completedAt: overrides.completedAt ?? `2026-09-29T1${seq % 10}:00:00.000Z`,
  };
  let responseHash = overrides.responseHash;
  if (!responseHash) {
    try {
      responseHash = operatorRelayResponseHash(identity);
    } catch {
      responseHash = sha256(`malformed-response-${seq}`);
    }
  }
  return { ...identity, responseHash };
}

function provider(signals: VerificationSignal[]): RepositoryProvider {
  return {
    name: 'github',
    resolveRef: async () => HEAD,
    getRef: async () => ({ name: HEAD, commitSha: HEAD, committedAt: '2026-09-29T09:00:00.000Z' }),
    listVerificationSignals: async () => signals,
  } as unknown as RepositoryProvider;
}

function canonicalRequest(operator: RelayOperatorId, relayId: string): OperatorRelayRequestV1 {
  const summary = `repair ${relayId}`;
  const sourceRef = repositoryRepairSourceRef(REPOSITORY, HEAD);
  const identity: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId,
    fromOperator: 'fcr',
    toOperator: operator,
    capability: 'implement',
    goal: 'repair exact repository head',
    context: {
      summary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(summary, sourceRef),
    },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: 'internal',
    createdAt: '2026-09-29T09:00:00.000Z',
    expiresAt: '2026-09-29T16:00:00.000Z',
  };
  return { ...identity, requestHash: operatorRelayRequestHash(identity) };
}

async function verifiedRepositoryOutcome(
  operator: RelayOperatorId,
  relayId: string,
  completedAt: string,
): Promise<{ response: OperatorRelayResponseV1; verification: CapabilityOutcomeVerificationReceipt }> {
  const request = canonicalRequest(operator, relayId);
  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId,
    requestHash: request.requestHash,
    fromOperator: operator,
    toOperator: 'fcr',
    status: 'completed',
    answer: `verified answer ${relayId}`,
    evidenceRefs: [`provider:${operator}:${relayId}`],
    unresolved: [],
    authorityRequested: 'none',
    completedAt,
  };
  const response: OperatorRelayResponseV1 = {
    ...identity,
    responseHash: operatorRelayResponseHash(identity),
  };
  const result = await verifyRepositoryRepairOutcome({
    request,
    response,
    repository: REPOSITORY,
    expectedHeadSha: HEAD,
    requiredChecks: [{ name: 'CI', issuerId: '15368' }],
  }, {
    providerFactory: () => provider([{
      id: relayId.replace(/\D/g, '') || String(relayId.length),
      name: 'CI',
      status: 'passed',
      commitSha: HEAD,
      provider: 'github',
      issuer: { kind: 'app', id: '15368', name: 'github-actions' },
      startedAt: '2026-09-29T14:00:00.000Z',
      completedAt: '2026-09-29T14:01:00.000Z',
      detailsUrl: `https://github.example.test/actions/${relayId}`,
    }]),
  });
  if (!result.receipt) throw new Error(`fixture verification failed: ${result.blockers.join(', ')}`);
  return { response, verification: result.receipt };
}

const NOW = new Date('2026-09-29T15:00:00.000Z');
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe('capability observation feed from operator relay receipts', () => {
  it('folds outcomes deterministically and counts only independently verified completed repairs as proof', async () => {
    const r1 = await verifiedRepositoryOutcome('codex', 'r1', '2026-09-29T10:00:00.000Z');
    const r2 = await verifiedRepositoryOutcome('codex', 'r2', '2026-09-29T12:00:00.000Z');
    const r3 = await verifiedRepositoryOutcome('codex', 'r3', '2026-09-29T11:00:00.000Z');
    const receipts = [
      r1.response,
      r2.response,
      r3.response,
      receipt('codex', 'failed', { relayId: 'r4', evidenceRefs: ['ci:run/4'], completedAt: '2026-09-29T09:00:00.000Z' }),
      receipt('codex', 'blocked', { relayId: 'r5', evidenceRefs: [], completedAt: '2026-09-29T08:00:00.000Z' }),
      receipt('codex', 'accepted', { relayId: 'r6', evidenceRefs: [], completedAt: '2026-09-29T13:00:00.000Z' }),
    ];
    const verificationReceipts = [r1.verification, r2.verification, r3.verification];
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts,
      verificationReceipts,
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
      proofRate: 0.6,
      falseGreenRate: 0,
      authorityViolationRate: 0,
      evidenceRefs: [
        'https://github.example.test/actions/r1',
        'https://github.example.test/actions/r2',
        'https://github.example.test/actions/r3',
      ],
    });

    const reordered = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [...receipts].reverse(),
      verificationReceipts,
    });
    expect(reordered.observation).toEqual(summary.observation);
  });

  it('treats provider answers as unproven when no task verifier has authenticated them', () => {
    const receipts = Array.from({ length: 5 }, (_, index) =>
      receipt('gemini', 'completed', {
        relayId: `g${index}`,
        evidenceRefs: [`provider:google:response-${index}`],
        completedAt: '2026-09-29T14:00:00.000Z',
      }));
    const candidates: CapabilityCandidate[] = [
      { operatorId: 'gemini', providerFamily: 'google', taskClasses: ['multimodal-generation'], capability: 'implement' },
      { operatorId: 'muse', providerFamily: 'meta', taskClasses: ['multimodal-generation'], capability: 'implement' },
    ];
    const benchmarkPriors: ExternalBenchmarkPrior[] = [
      { operatorId: 'muse', taskClass: 'multimodal-generation', observedAt: '2026-09-29T13:00:00.000Z', score: 1, sourceRef: 'public-benchmark:muse' },
    ];

    const unverified = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'gemini',
      taskClass: 'multimodal-generation',
      receipts,
    });
    expect(unverified.observation?.proofRate).toBe(0);
    expect(unverified.observation?.evidenceRefs).toEqual([]);

    const ranked = rankCapabilityCandidates({
      taskClass: 'multimodal-generation',
      candidates,
      observations: [unverified.observation!],
      benchmarkPriors,
      options: { now: NOW },
    });
    expect(ranked.find((candidate) => candidate.operatorId === 'gemini')?.status).toBe('trial');
    expect(ranked.find((candidate) => candidate.operatorId === 'gemini')?.localSamples).toBe(0);
  });

  it('can promote repository repair only after enough real verifier receipts exist', async () => {
    const verified = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        verifiedRepositoryOutcome('codex', `repair-${index}`, '2026-09-29T14:00:00.000Z')),
    );
    const observation = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: verified.map((entry) => entry.response),
      verificationReceipts: verified.map((entry) => entry.verification),
    }).observation!;

    expect(observation.proofRate).toBe(1);
    expect(observation.evidenceRefs).toHaveLength(5);

    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair',
      candidates: [
        { operatorId: 'codex', providerFamily: 'openai', taskClasses: ['repository-repair'], capability: 'implement' },
        { operatorId: 'deepseek', providerFamily: 'deepseek', taskClasses: ['repository-repair'], capability: 'implement' },
      ],
      observations: [observation],
      benchmarkPriors: [],
      options: { now: NOW },
    });
    expect(ranked.find((candidate) => candidate.operatorId === 'codex')?.status).toBe('eligible');
    expect(ranked[0]?.operatorId).toBe('codex');
    expect(ranked.every((candidate) => candidate.selectionAuthority === false && candidate.executionAuthority === false)).toBe(true);
  });

  it('does not let stale receipts ride on one fresh verified receipt', async () => {
    const stale = Array.from({ length: 50 }, (_, index) =>
      receipt('codex', 'completed', {
        relayId: `old-${index}`,
        evidenceRefs: ['ci:run/old'],
        completedAt: '2026-03-01T00:00:00.000Z',
      }));
    const fresh = await verifiedRepositoryOutcome('codex', 'fresh', '2026-09-29T14:00:00.000Z');
    const unplaceable = receipt('codex', 'completed', {
      relayId: 'nowhen',
      evidenceRefs: ['ci:run/x'],
      completedAt: 'not-a-date',
    });

    const windowed = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [...stale, fresh.response, unplaceable],
      verificationReceipts: [fresh.verification],
      window: { now: NOW, maxAgeMs: THIRTY_DAYS },
    });
    expect(windowed.ignoredStale).toBe(51);
    expect(windowed.observation).toEqual({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      observedAt: '2026-09-29T14:00:00.000Z',
      sampleSize: 1,
      successRate: 1,
      proofRate: 1,
      falseGreenRate: 0,
      authorityViolationRate: 0,
      evidenceRefs: ['https://github.example.test/actions/fresh'],
    });

    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair',
      candidates: [{ operatorId: 'codex', providerFamily: 'openai', taskClasses: ['repository-repair'], capability: 'implement' }],
      observations: [windowed.observation!],
      benchmarkPriors: [],
      options: { now: NOW },
    });
    expect(ranked[0]?.status).toBe('trial');

    const unwindowed = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [...stale, fresh.response, unplaceable],
      verificationReceipts: [fresh.verification],
    });
    expect(unwindowed.ignoredStale).toBe(1);
    expect(unwindowed.observation?.sampleSize).toBe(51);
    expect(unwindowed.observation?.proofRate).toBeCloseTo(1 / 51);
  });

  it('does not trust a serialized or copied verification receipt even when its deterministic hash is valid', async () => {
    const verified = await verifiedRepositoryOutcome('codex', 'bound', '2026-09-29T14:00:00.000Z');
    const trusted = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [verified.response],
      verificationReceipts: [verified.verification],
    });
    expect(trusted.observation?.proofRate).toBe(1);

    const reconstructed = JSON.parse(JSON.stringify(verified.verification)) as CapabilityOutcomeVerificationReceipt;
    const untrusted = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'codex',
      taskClass: 'repository-repair',
      receipts: [verified.response],
      verificationReceipts: [reconstructed],
    });
    expect(untrusted.observation?.proofRate).toBe(0);
    expect(untrusted.observation?.evidenceRefs).toEqual([]);
  });

  it('counts exact duplicates once and lets a later outcome for the same relayId supersede an earlier one', () => {
    const first = receipt('muse', 'completed', {
      relayId: 'same',
      responseHash: 'sha256:a',
      evidenceRefs: ['drift:diff/1'],
      completedAt: '2026-09-29T10:00:00.000Z',
    });
    const correction = receipt('muse', 'failed', {
      relayId: 'same',
      responseHash: 'sha256:b',
      evidenceRefs: ['drift:diff/1'],
      completedAt: '2026-09-29T11:00:00.000Z',
    });
    const summary = foldRelayReceiptsIntoCapabilityObservation({
      operatorId: 'muse',
      taskClass: 'cross-provider-drift',
      receipts: [first, first, first, correction],
    });
    expect(summary.ignoredDuplicate).toBe(2);
    expect(summary.supersededByLaterOutcome).toBe(1);
    expect(summary.consideredReceipts).toBe(1);
    expect(summary.observation?.sampleSize).toBe(1);
    expect(summary.observation?.successRate).toBe(0);
    expect(summary.observation?.observedAt).toBe('2026-09-29T11:00:00.000Z');
  });

  it('counts a completed receipt without evidence as a false green even when it bypassed relay validation', () => {
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

  it('counts anything other than exact none as an authority violation, including malformed values', () => {
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
      operatorId: 'deepseek',
      taskClass: 'architecture-review',
      receipts: [
        receipt('codex', 'completed'),
        receipt('claude-code', 'failed'),
        receipt('deepseek', 'accepted'),
      ],
    });
    expect(summary.observation).toBeNull();
    expect(summary.consideredReceipts).toBe(0);
    expect(summary.ignoredForeignOperator).toBe(2);
    expect(summary.ignoredInFlight).toBe(1);
  });
});
