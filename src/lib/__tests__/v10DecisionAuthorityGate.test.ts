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
    candidateOptions: ['Bind the decision with one portable hash.', 'Keep handoffs informal.'],
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

  return { ...withoutHash, decisionHash: v10DecisionReceiptHash(withoutHash) };
}

function evaluate(receipt: unknown, promptOSDecisionHash?: string) {
  const candidate = receipt as V10DecisionReceipt;
  return evaluateV10DecisionAuthorityGate({
    decisionReceipt: receipt,
    promptOSDecisionHash: promptOSDecisionHash ?? candidate.decisionHash,
    expectedProjectSlug: 'founder-control-room',
    currentHeadSha: SHA,
    requireExactHead: true,
    founderApproved: true,
  });
}

describe('V10 decision authority gate', () => {
  it('independently validates Chief identity and PromptOS handoff before authority resolution', () => {
    const receipt = buildReceipt();
    const result = evaluate(receipt);

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
    const result = evaluate(receipt, 'b'.repeat(64));

    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('PromptOS decision hash does not match the validated Chief decision receipt');
  });

  it('rejects content tampering even when the submitted hash is unchanged', () => {
    const receipt = buildReceipt();
    const tampered = { ...receipt, recommendation: 'Skip proof and execute now.' };
    const result = evaluate(tampered, receipt.decisionHash);

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

    const result = evaluate(withoutRedteam);
    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('required V10 decision lens missing: redteam');
  });

  it('rejects unknown top-level fields even when they are outside the decision hash', () => {
    const receipt = buildReceipt();
    const polluted = { ...receipt, apiToken: 'must-never-ride-an-authority-receipt' };
    const result = evaluate(polluted, receipt.decisionHash);

    expect(result.validDecisionReceipt).toBe(false);
    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors).toContain('unknown decision receipt field: apiToken');
  });

  it('rejects unknown nested lens and metric fields', () => {
    const receipt = buildReceipt();
    const polluted = structuredClone(receipt) as V10DecisionReceipt & Record<string, unknown>;
    const firstReport = polluted.lensReports[0] as V10DecisionReceipt['lensReports'][number] & Record<string, unknown>;
    firstReport.secretRef = 'provider/cloudflare/root';
    const metricReport = polluted.lensReports.find((report) => report.metrics.length > 0);
    expect(metricReport).toBeDefined();
    const firstMetric = metricReport!.metrics[0] as V10DecisionReceipt['lensReports'][number]['metrics'][number] & Record<string, unknown>;
    firstMetric.authorityOverride = 'execute';

    const result = evaluate(polluted, receipt.decisionHash);
    expect(result.validDecisionReceipt).toBe(false);
    expect(result.acceptedForAuthorityResolution).toBe(false);
    expect(result.errors.some((error) => error.includes('secretRef'))).toBe(true);
    expect(result.errors.some((error) => error.includes('authorityOverride'))).toBe(true);
  });

  it('rejects oversized un-hashed tails instead of silently truncating them', () => {
    const receipt = buildReceipt();
    const oversized = { ...receipt, goal: `${receipt.goal}${'x'.repeat(4_000)}` };
    const result = evaluate(oversized, receipt.decisionHash);

    expect(result.validDecisionReceipt).toBe(false);
    expect(result.errors).toContain('decision receipt goal exceeds 4000 characters');
  });

  it('rejects overlong hash and SHA prefixes rather than accepting truncation', () => {
    const receipt = buildReceipt();
    const overlongHash = { ...receipt, decisionHash: `${receipt.decisionHash}a` };
    const hashResult = evaluate(overlongHash, overlongHash.decisionHash);
    expect(hashResult.validDecisionReceipt).toBe(false);
    expect(hashResult.errors).toContain('decision receipt decisionHash must be sha256');

    const overlongHead = { ...receipt, expectedHeadSha: `${SHA}a` };
    overlongHead.decisionHash = v10DecisionReceiptHash(overlongHead);
    const headResult = evaluateV10DecisionAuthorityGate({
      decisionReceipt: overlongHead,
      promptOSDecisionHash: overlongHead.decisionHash,
      expectedProjectSlug: 'founder-control-room',
      currentHeadSha: SHA,
      requireExactHead: true,
      founderApproved: true,
    });
    expect(headResult.validDecisionReceipt).toBe(false);
    expect(headResult.errors).toContain('decision receipt expectedHeadSha must be a full Git SHA when present');
  });
});
