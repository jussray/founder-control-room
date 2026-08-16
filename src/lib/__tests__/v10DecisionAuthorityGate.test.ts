import { describe, expect, it } from 'vitest';
import {
  V10_DECISION_CYCLE_CONTRACT,
  V10_DECISION_LENSES,
  evaluateV10DecisionAuthorityGate,
  v10DecisionReceiptHash,
  type V10DecisionReceipt,
} from '../v10DecisionAuthorityGate.js';

const SHA = 'a'.repeat(40);

function buildReceipt(overrides: Partial<V10DecisionReceipt> = {}): V10DecisionReceipt {
  const withoutHash: Omit<V10DecisionReceipt, 'decisionHash'> = {
    contract: V10_DECISION_CYCLE_CONTRACT,
    goal: 'Sharpen the Business OS without transferring reasoning authority into execution.',
    workspaceId: 'juss-portfolio',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    customerOutcome: 'One auditable founder decision can cross Chief, PromptOS, and FCR without drift.',
    desiredState: 'FCR independently verifies the exact decision that PromptOS compiled.',
    currentState: 'Capability and outcome contracts are already governed but decision context is not yet bound.',
    bottleneck: 'Cross-repo decision context can be reinterpreted unless identity is portable and independently checked.',
    decisionClass: 'reversible',
    reality: {
      verified: ['Chief owns reasoning and FCR owns execution authority.'],
      inferred: ['Binding one decision hash should reduce handoff drift.'],
      unknown: ['Long-run founder override rate is not measured yet.'],
      blocked: [],
    },
    lensReports: V10_DECISION_LENSES.map((lens) => ({
      lens,
      finding: `${lens} bounded finding`,
      recommendation: `${lens} bounded recommendation`,
      confidence: 0.7,
      evidenceRefs: [`evidence:${lens}`],
      assumptions: [`assumption:${lens}`],
      risks: [`risk:${lens}`],
      blockers: [],
      requestedEvidence: [`proof:${lens}`],
      metrics: lens === 'data-analytics'
        ? [{ name: 'time-to-proof', baseline: 'unknown', target: 'decrease', source: 'FCR receipts' }]
        : [],
    })),
    dissent: ['Redteam requires proof before authority resolution.'],
    candidateOptions: ['Keep handoffs informal.', 'Bind the decision with one portable hash.'],
    recommendation: 'Use one proposal-only decision receipt across the three peer systems.',
    authorityCeiling: 'reason',
    proofRequirements: ['exact-head CI', 'independent FCR read-back'],
    outcomeSignals: ['founder-goal-success-rate', 'time-to-proof'],
    rollback: 'Revert the isolated gate branch. No provider mutation occurs.',
    stopConditions: ['authority mismatch', 'evidence contradiction', 'head drift'],
    nextGate: 'Existing FCR authority resolution evaluates the validated proposal.',
    requiresFounderApproval: true,
    executionAuthorized: false,
    ...overrides,
  };

  const receipt = { ...withoutHash, decisionHash: v10DecisionReceiptHash(withoutHash) };
  return receipt;
}

describe('V10 decision authority gate', () => {
  it('independently validates Chief identity and PromptOS handoff before authority resolution', () => {
    const receipt = buildReceipt();
    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: receipt,
      promptOSDecisionHash: receipt.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.validDecisionReceipt).toBe(true);
    expect(result.promptOSBindingValid).toBe(true);
    expect(result.projectBindingValid).toBe(true);
    expect(result.exactHeadBindingValid).toBe(true);
    expect(result.founderApprovalPresent).toBe(true);
    expect(result.acceptedForAuthorityResolution).toBe(true);
    expect(result.executionAuthorized).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('rejects a PromptOS handoff that names a different decision', () => {
    const receipt = buildReceipt();
    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: receipt,
      promptOSDecisionHash: 'b'.repeat(64),
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('PromptOS decision hash does not match the validated Chief decision receipt');
  });

  it('rejects content tampering even when the submitted hash is unchanged', () => {
    const receipt = buildReceipt();
    const tampered = { ...receipt, recommendation: 'Skip proof and execute now.' };
    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: tampered,
      promptOSDecisionHash: receipt.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.validDecisionReceipt).toBe(false);
    expect(result.errors).toContain('decision receipt hash does not match decision content');
    expect(result.executionAuthorized).toBe(false);
  });

  it('stops on exact-head drift', () => {
    const receipt = buildReceipt();
    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: receipt,
      promptOSDecisionHash: receipt.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: 'c'.repeat(40),
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('decision expected head does not match current FCR project head');
  });

  it('requires founder approval and still never authorizes execution itself', () => {
    const receipt = buildReceipt();
    const denied = evaluateV10DecisionAuthorityGate({
      decisionReceipt: receipt,
      promptOSDecisionHash: receipt.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: false,
    });

    expect(denied.acceptedForAuthorityResolution).toBe(false);
    expect(denied.executionAuthorized).toBe(false);
    expect(denied.errors).toContain('founder approval is required before authority resolution');
  });

  it('fails closed when one required parallel lens disappears', () => {
    const receipt = buildReceipt();
    const withoutRedteam = {
      ...receipt,
      lensReports: receipt.lensReports.filter((report) => report.lens !== 'redteam'),
    };
    withoutRedteam.decisionHash = v10DecisionReceiptHash(withoutRedteam);

    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: withoutRedteam,
      promptOSDecisionHash: withoutRedteam.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('required V10 decision lens missing: redteam');
  });
});
