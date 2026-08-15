import { describe, expect, it } from 'vitest';
import { founderConveyorReceiptId, type FounderConveyorReceiptIdentity } from '../founderConveyorReceipt.js';
import type { RepositoryTruthAssessment } from '../repositoryTruthAssessment.js';
import { createV10ClosedLoopOutcome } from '../v10ClosedLoopOutcome.js';

const PLAN_HASH = 'a'.repeat(64);
const REGISTRY_HASH = 'b'.repeat(64);

function receiptIdentity(): FounderConveyorReceiptIdentity {
  return {
    idempotencyKey: 'fcr-conveyor-v3:reference-loop',
    runId: 'reference-loop-run-1',
    projectSlug: 'founder-control-room',
    goal: 'Verify one bounded reference-loop execution',
    expectedHeadSha: 'c'.repeat(40),
    fromStage: 'verify',
    toStage: 'outcome',
    capabilityPlanHash: PLAN_HASH,
    registryHash: REGISTRY_HASH,
    skillIds: ['goalfix-v1'],
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
  };
}

function truthIdentity(identity: FounderConveyorReceiptIdentity) {
  return { projectSlug: identity.projectSlug, headSha: identity.expectedHeadSha };
}

function truth(overrides: Partial<RepositoryTruthAssessment> = {}): RepositoryTruthAssessment {
  return {
    state: 'verified',
    freshness: 'fresh',
    recommendation: 'candidate-promote',
    confidence: 90,
    evidenceCompleteness: 100,
    ageMinutes: 1,
    staleAfterMinutes: 30,
    freshUntil: '2026-08-15T03:00:00.000Z',
    founderReviewRequired: true,
    promotionAllowed: false,
    mutationAuthorized: false,
    blocker: null,
    nextAction: 'Keep observing.',
    reasons: ['Fresh signed evidence supports the current repository-health claim.'],
    ...overrides,
  };
}

describe('V10 closed-loop outcome sealing', () => {
  it('re-derives the exact execution receipt before sealing verified truth', () => {
    const identity = receiptIdentity();
    const executionReceiptId = founderConveyorReceiptId(identity);
    const observation = createV10ClosedLoopOutcome({
      receiptIdentity: identity,
      executionReceiptId,
      truthIdentity: truthIdentity(identity),
      truth: truth(),
      observedAt: '2026-08-15T02:30:00.000Z',
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      outcomeSignals: ['exact-head verification passed'],
      evidenceUrls: ['https://api.foundercontrolroom.org/version'],
    });

    expect(observation.contract).toBe('juss-v10/outcome-observation@v1');
    expect(observation.executionReceiptId).toBe(executionReceiptId);
    expect(observation.capabilityPlanHash).toBe(PLAN_HASH);
    expect(observation.verified).toBe(true);
    expect(observation.goalSucceeded).toBe(true);
    expect(observation.evidenceCompleteness).toBe(100);
    expect(observation.evidenceUrls).toEqual([
      'https://api.foundercontrolroom.org/version',
      'https://github.com/jussray/founder-control-room/actions/runs/1',
    ]);
  });

  it('rejects a receipt that is not bound to the supplied execution identity', () => {
    const identity = receiptIdentity();
    expect(() => createV10ClosedLoopOutcome({
      receiptIdentity: identity,
      executionReceiptId: `fcr-conveyor-receipt-v3:${'f'.repeat(64)}`,
      truthIdentity: truthIdentity(identity),
      truth: truth(),
      observedAt: '2026-08-15T02:30:00.000Z',
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      outcomeSignals: ['exact-head verification passed'],
    })).toThrow('executionReceiptId does not match the bound conveyor receipt identity');
  });

  it('rejects fresh truth from another project or head', () => {
    const identity = receiptIdentity();
    const executionReceiptId = founderConveyorReceiptId(identity);
    const base = {
      receiptIdentity: identity,
      executionReceiptId,
      truth: truth(),
      observedAt: '2026-08-15T02:30:00.000Z',
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      outcomeSignals: ['exact-head verification passed'],
    };

    expect(() => createV10ClosedLoopOutcome({
      ...base,
      truthIdentity: { projectSlug: 'another-project', headSha: identity.expectedHeadSha },
    })).toThrow('truth project does not match the bound conveyor project');

    expect(() => createV10ClosedLoopOutcome({
      ...base,
      truthIdentity: { projectSlug: identity.projectSlug, headSha: 'd'.repeat(40) },
    })).toThrow('truth head does not match the bound conveyor expected head');
  });

  it('refuses to convert stale repository truth into a successful verified outcome', () => {
    const identity = receiptIdentity();
    expect(() => createV10ClosedLoopOutcome({
      receiptIdentity: identity,
      executionReceiptId: founderConveyorReceiptId(identity),
      truthIdentity: truthIdentity(identity),
      truth: truth({ state: 'stale', freshness: 'stale', recommendation: 'hold', confidence: 40 }),
      observedAt: '2026-08-15T02:30:00.000Z',
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      outcomeSignals: ['exact-head verification passed'],
    })).toThrow('goal success cannot be claimed before the outcome is verified');
  });

  it('records stale truth as unverified when no success claim is made', () => {
    const identity = receiptIdentity();
    const observation = createV10ClosedLoopOutcome({
      receiptIdentity: identity,
      executionReceiptId: founderConveyorReceiptId(identity),
      truthIdentity: truthIdentity(identity),
      truth: truth({ state: 'stale', freshness: 'stale', recommendation: 'hold', confidence: 40, evidenceCompleteness: 72 }),
      observedAt: '2026-08-15T02:30:00.000Z',
      goalSucceeded: null,
      founderOverride: false,
      rollbackUsed: false,
      retries: 1,
      outcomeSignals: ['exact-head verification passed'],
    });

    expect(observation.verified).toBe(false);
    expect(observation.goalSucceeded).toBeNull();
    expect(observation.evidenceCompleteness).toBe(72);
  });
});
