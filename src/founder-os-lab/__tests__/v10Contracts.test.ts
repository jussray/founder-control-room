import { describe, expect, it } from 'vitest';
import { founderDecisionCardFromPlan } from '../decisionCard.js';
import {
  createV10OutcomeObservation,
  validateV10OutcomeObservation,
} from '../outcomeObservation.js';
import type { FounderOsLabPlan } from '../contracts.js';

const HASH = 'a'.repeat(64);
const RECEIPT = `fcr-conveyor-receipt-v3:${'b'.repeat(64)}`;

function labPlan(): FounderOsLabPlan {
  return {
    version: 'founder-os-lab-v1',
    goal: 'Ship one verified V10 slice.',
    action: 'plan',
    readiness: 'ready_for_review',
    isolation: {
      externalCalls: false,
      providerCalls: false,
      databaseWrites: false,
      filesystemWrites: false,
      environmentReads: false,
    },
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: false,
      approvalObserved: false,
      capabilityPlanBound: true,
    },
    route: {
      chiefSkill: 'juss-chief-ai',
      command: { id: 'v10', role: 'Synthesize the founder system.', class: 'founder' },
      provider: {
        id: 'chatgpt',
        mode: 'preview',
        supported: true,
        executionAllowed: false,
        approvalRequired: false,
        credentialBoundary: 'connector-owned',
        evidenceRequired: ['request scope'],
        preflightEvidenceRequired: [],
        preflightEvidenceObserved: [],
        preflightEvidenceMissing: [],
        rollback: 'Discard preview.',
      },
      project: null,
      capabilityPlan: {
        observed: true,
        valid: true,
        selectedBy: 'chief-ai-machine',
        planHash: HASH,
        registryHash: 'c'.repeat(64),
        capabilityIds: ['goalfix'],
        strategicLenses: ['futureyou', 'truthmode'],
        outcomeSignals: ['verification-pass'],
        errors: [],
      },
      capabilities: ['founder-routing', 'decision-card-preview', 'outcome-observation-preview'],
      adapters: [],
    },
    truth: {
      verified: ['Plan hash verified.'],
      inferred: ['Capability is the narrowest fit.'],
      unknown: [],
      blocked: [],
    },
    redteam: { shouldExist: true, premiseRisk: 'Authority drift.', failureModes: ['Replay.'] },
    l99: { authority: 'L0', state: 'ready_for_review', evidence: 'hash', rollback: 'discard', compoundingValue: 'reusable contract' },
    ooda: { observe: [], orient: [], decide: [], act: [], verify: [], loop: [] },
    nextGate: 'Review the plan.',
  };
}

describe('V10 founder-facing and analytics contracts', () => {
  it('builds one decision card without changing authority', () => {
    const card = founderDecisionCardFromPlan(labPlan());
    expect(card.goal).toBe('Ship one verified V10 slice.');
    expect(card.chiefAiRoute.capabilityIds).toEqual(['goalfix']);
    expect(card.futureContinuity.strategicLenses).toContain('futureyou');
    expect(card.authority.executionAllowed).toBe(false);
    expect(card.nextMove).toBe('Review the plan.');
  });

  it('records verified outcome evidence against the exact plan and receipt', () => {
    const observation = createV10OutcomeObservation({
      capabilityPlanHash: HASH,
      executionReceiptId: RECEIPT,
      observedAt: '2026-08-09T06:30:00.000Z',
      verified: true,
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      evidenceCompleteness: 100,
      outcomeSignals: ['verification-pass'],
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      metrics: [{ name: 'verification-pass', before: 0, after: 1, unit: 'boolean' }],
    });

    expect(observation.contract).toBe('juss-v10/outcome-observation@v1');
    expect(observation.goalSucceeded).toBe(true);
    expect(observation.metrics[0]?.after).toBe(1);
  });

  it('refuses success theater without verified evidence', () => {
    expect(validateV10OutcomeObservation({
      capabilityPlanHash: HASH,
      executionReceiptId: RECEIPT,
      observedAt: '2026-08-09T06:30:00.000Z',
      verified: false,
      goalSucceeded: true,
      founderOverride: false,
      rollbackUsed: false,
      retries: 0,
      evidenceCompleteness: 0,
      outcomeSignals: ['verification-pass'],
      evidenceUrls: [],
    })).toContain('goal success cannot be claimed before the outcome is verified');
  });
});
