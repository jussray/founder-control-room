import { inspectAuthorityBoundary, runCompanySandbox } from './sandbox.mjs';

export { inspectAuthorityBoundary };

const MUTATING_MODES = new Set(['queue', 'publish']);
const INJECTION_PATTERNS = [
  /ignore\s+(all|any|previous)\s+instructions/i,
  /executionAllowed\s*[:=]\s*true/i,
  /bypass\s+(the\s+)?approval/i,
  /reveal\s+(a\s+)?secret/i,
  /use\s+(a\s+)?live\s+adapter/i,
];

export const DEFAULT_ADVERSARIAL_LIMITS = Object.freeze({
  maxDelegationDepth: 4,
  maxSteps: 12,
  maxCostUnits: 100,
  maxElapsedMs: 5_000,
  maxProofAgeMs: 86_400_000,
});

function unique(values) {
  return [...new Set(values)];
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function campaignKey(companyInput) {
  const platforms = [...(companyInput?.platforms ?? [])].sort().join(',');
  return [
    companyInput?.projectSlug ?? '',
    companyInput?.eventId ?? '',
    companyInput?.requestedMode ?? '',
    platforms,
  ].join(':');
}

function inspectClaimedReceipt(receipt, expectedEventId) {
  const violations = [];
  if (receipt?.provider !== 'fake-buffer') violations.push('receipt_provider_not_fake');
  if (receipt?.simulation !== true) violations.push('receipt_not_simulation');
  if (receipt?.executionAllowed !== false) violations.push('receipt_claims_execution');
  if (receipt?.liveSideEffects !== false) violations.push('receipt_claims_live_side_effects');
  if (receipt?.publicUrl !== null) violations.push('receipt_claims_public_url');
  if (receipt?.eventId !== expectedEventId) violations.push('receipt_event_mismatch');
  if (!['simulated_draft', 'simulated_queue', 'simulated_publish'].includes(receipt?.status)) {
    violations.push('receipt_status_invalid');
  }
  return violations;
}

export function evaluateAdversarialEnvelope(envelope) {
  const blockers = [];
  const signals = [];
  const limits = {
    ...DEFAULT_ADVERSARIAL_LIMITS,
    ...(envelope?.limits ?? {}),
  };
  const companyInput = envelope?.companyInput;
  const requestedMode = companyInput?.requestedMode;
  const key = campaignKey(companyInput);

  if (envelope?.dataClassification !== 'synthetic') blockers.push('non_synthetic_envelope');
  if (!companyInput || companyInput.dataClassification !== 'synthetic') {
    blockers.push('non_synthetic_company_input');
  }
  if (envelope?.killSwitch === true) blockers.push('kill_switch_active');

  const requestedAuthority = envelope?.requestedAuthority;
  if (
    requestedAuthority?.level !== 'L0'
    || requestedAuthority?.mode !== 'simulation'
    || requestedAuthority?.executionAllowed !== false
  ) {
    blockers.push('authority_escalation_attempt');
  }

  if (MUTATING_MODES.has(requestedMode)) {
    const approval = envelope?.approvalScope;
    if (!approval?.id?.trim()) {
      blockers.push('approval_missing');
    } else {
      if (approval.id !== companyInput?.founderApprovalId) blockers.push('approval_id_mismatch');
      if (approval.projectSlug !== companyInput?.projectSlug) blockers.push('approval_project_mismatch');
      if (approval.eventId !== companyInput?.eventId) blockers.push('approval_event_mismatch');
      if (approval.mode !== requestedMode) blockers.push('approval_mode_mismatch');
      if ((envelope?.consumedApprovalIds ?? []).includes(approval.id)) {
        blockers.push('approval_reuse_detected');
      }
    }
  }

  const observedAt = Date.parse(envelope?.observedAt ?? '');
  const proofObservedAt = Date.parse(envelope?.proofObservedAt ?? '');
  if (!Number.isFinite(observedAt) || !Number.isFinite(proofObservedAt)) {
    blockers.push('proof_time_invalid');
  } else {
    const proofAgeMs = observedAt - proofObservedAt;
    if (proofAgeMs < 0) blockers.push('proof_timestamp_in_future');
    if (proofAgeMs > limits.maxProofAgeMs) blockers.push('proof_stale');
  }

  if ((envelope?.seenCampaignKeys ?? []).includes(key)) blockers.push('duplicate_campaign');

  const delegationChain = envelope?.delegationChain ?? [];
  if (delegationChain.length > limits.maxDelegationDepth) blockers.push('delegation_depth_exceeded');
  if (new Set(delegationChain).size !== delegationChain.length) blockers.push('delegation_loop_detected');

  const budget = envelope?.budget ?? {};
  if (!isFiniteNonNegative(budget.steps) || budget.steps > limits.maxSteps) {
    blockers.push('step_budget_exceeded');
  }
  if (!isFiniteNonNegative(budget.costUnits) || budget.costUnits > limits.maxCostUnits) {
    blockers.push('cost_budget_exceeded');
  }
  if (!isFiniteNonNegative(budget.elapsedMs) || budget.elapsedMs > limits.maxElapsedMs) {
    blockers.push('runtime_timeout');
  }

  const prompt = String(envelope?.prompt ?? '');
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    blockers.push('prompt_injection_detected');
  }

  const decisions = unique((envelope?.agentVotes ?? []).map((vote) => vote?.decision).filter(Boolean));
  if (decisions.length > 1) blockers.push('agent_disagreement_unresolved');
  if (decisions.length === 1 && decisions[0] === 'block') blockers.push('agent_consensus_block');

  if (blockers.length === 0) signals.push('preflight_clear');

  return {
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    status: blockers.length > 0 ? 'blocked' : 'clear',
    campaignKey: key,
    blockers: unique(blockers),
    signals,
    limits,
    budget: {
      steps: budget.steps,
      costUnits: budget.costUnits,
      elapsedMs: budget.elapsedMs,
    },
  };
}

function inspectClaimedReceipts(claimedReceipts, actualReceipts, expectedEventId) {
  if (!Array.isArray(claimedReceipts)) return [];

  const violations = [];
  for (const receipt of claimedReceipts) {
    violations.push(...inspectClaimedReceipt(receipt, expectedEventId));
  }
  if (claimedReceipts.length !== actualReceipts.length) {
    violations.push('receipt_claim_count_mismatch');
  } else if (stableStringify(claimedReceipts) !== stableStringify(actualReceipts)) {
    violations.push('receipt_claim_mismatch');
  }
  return unique(violations);
}

export function runAdversarialSimulation(envelope) {
  const preflight = evaluateAdversarialEnvelope(envelope);
  if (preflight.status === 'blocked') {
    return {
      status: 'blocked',
      phase: 'preflight',
      simulatorInvoked: false,
      authority: preflight.authority,
      blockers: preflight.blockers,
      campaignKey: preflight.campaignKey,
      sandbox: null,
      result: null,
      receipts: [],
    };
  }

  const sandboxRun = runCompanySandbox(envelope.companyInput, {
    expectedInputFingerprint: envelope.expectedInputFingerprint,
  });
  if (sandboxRun.status !== 'simulated' || !sandboxRun.result) {
    return {
      status: sandboxRun.status,
      phase: 'sandbox',
      simulatorInvoked: sandboxRun.simulatorInvoked,
      authority: preflight.authority,
      blockers: sandboxRun.violations,
      campaignKey: preflight.campaignKey,
      sandbox: sandboxRun.sandbox,
      result: sandboxRun.result,
      receipts: sandboxRun.result?.receipts ?? [],
    };
  }

  const result = sandboxRun.result;
  const postflightBlockers = [
    ...inspectAuthorityBoundary(result),
    ...inspectClaimedReceipts(
      envelope.claimedReceipts,
      result.receipts,
      result.campaign?.eventId ?? envelope.companyInput?.eventId,
    ),
  ];

  return {
    status: postflightBlockers.length > 0 ? 'quarantined' : 'simulated',
    phase: postflightBlockers.length > 0 ? 'postflight' : 'complete',
    simulatorInvoked: true,
    authority: preflight.authority,
    blockers: unique(postflightBlockers),
    campaignKey: preflight.campaignKey,
    sandbox: sandboxRun.sandbox,
    result,
    receipts: result.receipts,
  };
}
