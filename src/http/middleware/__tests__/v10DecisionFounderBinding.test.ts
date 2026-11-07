import { describe, expect, it, vi } from 'vitest';
import {
  V10_DECISION_CYCLE_CONTRACT,
  V10_DECISION_LENSES,
  v10DecisionReceiptHash,
  type V10DecisionReceipt,
} from '../../../lib/v10DecisionAuthorityGate.js';
import {
  createFounderControlDecision,
} from '../../../lib/founderControlDecision.js';

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import {
  validateTrustedFounderApproval,
  validateV10DecisionFounderBinding,
  type TrustedFounderApproval,
} from '../v10DecisionFounderBinding.js';

const SHA = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);
const MISSION_ID = 'mission-v10-merge';
const PROJECT = 'founder-control-room';
const FOUNDER_EMAIL = 'founder@example.com';
const NOW_MS = Date.parse('2026-08-19T05:35:00.000Z');

function buildReceipt(overrides: Partial<V10DecisionReceipt> = {}): V10DecisionReceipt {
  const withoutHash: Omit<V10DecisionReceipt, 'decisionHash'> = {
    contract: V10_DECISION_CYCLE_CONTRACT,
    goal: 'Bind one exact founder-authorized merge decision into execution.',
    workspaceId: 'juss-portfolio',
    projectSlug: PROJECT,
    expectedHeadSha: SHA,
    customerOutcome: 'One decision identity survives Chief, PromptOS, founder approval, and FCR execution.',
    desiredState: 'The privileged merge ledger contains the exact reasoning and founder decision hashes.',
    currentState: 'Capability plan identity is enforced but decision and founder hashes are not yet in the execution ledger.',
    bottleneck: 'A valid plan can otherwise be executed without proving which exact Chief recommendation the founder approved.',
    decisionClass: 'high-consequence',
    reality: {
      verified: ['FCR owns execution authority.'],
      inferred: ['One portable decision identity reduces handoff drift.'],
      unknown: ['Long-run override rate is not measured yet.'],
      blocked: [],
    },
    lensReports: V10_DECISION_LENSES.map((lens) => ({
      lens,
      finding: `${lens} bounded finding`,
      recommendation: `${lens} bounded recommendation`,
      confidence: 0.8,
      evidenceRefs: [`evidence:${lens}`],
      assumptions: [`assumption:${lens}`],
      risks: [`risk:${lens}`],
      blockers: [],
      requestedEvidence: [`proof:${lens}`],
      metrics: [],
    })),
    dissent: ['Redteam requires exact-hash binding before mutation.'],
    candidateOptions: ['Bind one portable hash.', 'Keep approval identity implicit.'],
    recommendation: 'Bind the validated decision and explicit founder approval to the exact merge identity.',
    authorityCeiling: 'reason',
    proofRequirements: ['exact-head CI', 'founder decision hash', 'independent review'],
    outcomeSignals: ['decision-hash-on-execution-ledger'],
    rollback: 'Revert the isolated authorization-binding change if it blocks valid traffic.',
    stopConditions: ['decision hash mismatch', 'founder decision mismatch', 'head drift'],
    nextGate: 'Existing approvals route may execute only after the bound middleware succeeds.',
    requiresFounderApproval: true,
    executionAuthorized: false,
    ...overrides,
  };
  return { ...withoutHash, decisionHash: v10DecisionReceiptHash(withoutHash) };
}

function approvedFounderDecision(receipt: V10DecisionReceipt, capabilityPlanHash = PLAN_HASH) {
  return createFounderControlDecision({
    proposal: {
      proposalId: MISSION_ID,
      proposalHash: receipt.decisionHash,
      projectSlug: PROJECT,
      actionType: 'merge',
      expectedHeadSha: SHA,
      capabilityPlanHash,
    },
    surface: 'chatgpt',
    decision: 'approved',
  });
}

function trustedApproval(overrides: Partial<TrustedFounderApproval> = {}): TrustedFounderApproval {
  return {
    proofResultId: 'proof-result-001',
    missionId: MISSION_ID,
    gateId: 'merge',
    status: 'pass',
    approvedBy: FOUNDER_EMAIL,
    createdAt: '2026-08-19T05:30:00.000Z',
    ...overrides,
  };
}

function validate(
  receipt: V10DecisionReceipt,
  founderDecision = approvedFounderDecision(receipt),
  promptOSDecisionHash = receipt.decisionHash,
  approval: TrustedFounderApproval | null = trustedApproval(),
  founderEmail = FOUNDER_EMAIL,
) {
  return validateV10DecisionFounderBinding({
    decisionReceipt: receipt,
    promptOSDecisionHash,
    founderDecision,
    trustedFounderApproval: approval,
    founderEmail,
    missionId: MISSION_ID,
    projectSlug: PROJECT,
    expectedHeadSha: SHA,
    capabilityPlanHash: PLAN_HASH,
    currentHeadSha: SHA,
    nowMs: NOW_MS,
  });
}

describe('V10 decision + founder execution binding', () => {
  it('binds one Chief decision through PromptOS and trusted persisted founder approval to the exact merge identity', () => {
    const receipt = buildReceipt();
    const founderDecision = approvedFounderDecision(receipt);
    const result = validate(receipt, founderDecision);

    expect(result.errors).toEqual([]);
    expect(result.binding).toEqual({
      decisionHash: receipt.decisionHash,
      founderDecisionHash: founderDecision.decisionHash,
      founderControlSurface: 'chatgpt',
      founderApprovalProofId: 'proof-result-001',
      founderApprovedBy: FOUNDER_EMAIL,
    });
  });

  it('rejects a mathematically valid founder decision when no persisted founder proof exists', () => {
    const receipt = buildReceipt();
    const result = validate(receipt, approvedFounderDecision(receipt), receipt.decisionHash, null);

    expect(result.binding).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      'trusted persisted founder approval is required',
      'founder approval is required before authority resolution',
    ]));
  });

  it('rejects persisted approval created by a different founder identity', () => {
    const receipt = buildReceipt();
    const result = validate(
      receipt,
      approvedFounderDecision(receipt),
      receipt.decisionHash,
      trustedApproval({ approvedBy: 'someone-else@example.com' }),
    );

    expect(result.binding).toBeNull();
    expect(result.errors).toContain('trusted founder approval does not belong to the authenticated founder');
  });

  it('rejects a stale persisted approval even when all client-supplied hashes are valid', () => {
    const receipt = buildReceipt();
    const result = validate(
      receipt,
      approvedFounderDecision(receipt),
      receipt.decisionHash,
      trustedApproval({ createdAt: '2026-08-19T05:00:00.000Z' }),
    );

    expect(result.binding).toBeNull();
    expect(result.errors).toContain('trusted founder approval is stale');
  });

  it('validates trusted approval identity, scope, and freshness independently', () => {
    expect(validateTrustedFounderApproval(trustedApproval(), {
      missionId: MISSION_ID,
      founderEmail: FOUNDER_EMAIL,
      nowMs: NOW_MS,
    })).toEqual([]);

    expect(validateTrustedFounderApproval(trustedApproval({ missionId: 'other-mission' }), {
      missionId: MISSION_ID,
      founderEmail: FOUNDER_EMAIL,
      nowMs: NOW_MS,
    })).toContain('trusted founder approval belongs to a different mission');
  });

  it('rejects a PromptOS handoff that names a different Chief decision', () => {
    const receipt = buildReceipt();
    const result = validate(receipt, approvedFounderDecision(receipt), 'c'.repeat(64));

    expect(result.binding).toBeNull();
    expect(result.errors).toContain('PromptOS decision hash does not match the validated Chief decision receipt');
  });

  it('rejects founder approval bound to a different capability plan', () => {
    const receipt = buildReceipt();
    const founderDecision = approvedFounderDecision(receipt, 'd'.repeat(64));
    const result = validate(receipt, founderDecision);

    expect(result.binding).toBeNull();
    expect(result.errors).toContain('founder decision does not bind the exact proposal identity');
  });

  it('rejects a non-approval even when the Chief decision, trusted proof, and PromptOS hash are valid', () => {
    const receipt = buildReceipt();
    const founderDecision = createFounderControlDecision({
      proposal: {
        proposalId: MISSION_ID,
        proposalHash: receipt.decisionHash,
        projectSlug: PROJECT,
        actionType: 'merge',
        expectedHeadSha: SHA,
        capabilityPlanHash: PLAN_HASH,
      },
      surface: 'fcr',
      decision: 'rejected',
    });
    const result = validate(receipt, founderDecision);

    expect(result.binding).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      'founder approval is required before authority resolution',
      'founder decision must explicitly approve privileged merge execution',
    ]));
  });

  it('rejects a founder decision bound to a different decision hash', () => {
    const receipt = buildReceipt();
    const founderDecision = createFounderControlDecision({
      proposal: {
        proposalId: MISSION_ID,
        proposalHash: 'e'.repeat(64),
        projectSlug: PROJECT,
        actionType: 'merge',
        expectedHeadSha: SHA,
        capabilityPlanHash: PLAN_HASH,
      },
      surface: 'claude',
      decision: 'approved',
    });
    const result = validate(receipt, founderDecision);

    expect(result.binding).toBeNull();
    expect(result.errors).toContain('founder decision does not bind the exact proposal identity');
  });
});
