import {
  inspectAuthorityBoundary,
  runCompanySandbox,
  sealSandboxValue,
} from './sandbox.mjs';

export { inspectAuthorityBoundary };

const MUTATING_MODES = new Set(['queue', 'publish']);
const ALLOWED_DELEGATES = new Set([
  'juss-chief-ai',
  'reality-agent',
  'governance-agent',
  'redteam-agent',
  'story-agent',
  'campaign-agent',
  'learning-agent',
]);
const REQUIRED_VOTERS = ['reality-agent', 'governance-agent'];
const ALLOWED_VOTERS = new Set([...REQUIRED_VOTERS, 'redteam-agent']);
const VALID_VOTE_DECISIONS = new Set(['allow', 'block']);
const INJECTION_PATTERNS = [
  /ignore\s+(all|any|previous)\s+instructions/i,
  /executionAllowed\s*[:=]\s*true/i,
  /bypass\s+(the\s+)?approval/i,
  /reveal\s+(a\s+)?secret/i,
  /use\s+(a\s+)?live\s+adapter/i,
];
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

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

function resolveLimits(overrides) {
  const limits = { ...DEFAULT_ADVERSARIAL_LIMITS };
  const blockers = [];

  if (overrides === undefined) return { limits, blockers };
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { limits, blockers: ['invalid_limit_override'] };
  }

  const allowedKeys = new Set(Object.keys(DEFAULT_ADVERSARIAL_LIMITS));
  for (const key of Object.keys(overrides)) {
    if (!allowedKeys.has(key)) blockers.push('invalid_limit_override');
  }

  for (const [key, ceiling] of Object.entries(DEFAULT_ADVERSARIAL_LIMITS)) {
    if (!(key in overrides)) continue;
    const value = overrides[key];
    if (!Number.isInteger(value) || !isFiniteNonNegative(value)) {
      blockers.push('invalid_limit_override');
      continue;
    }
    limits[key] = Math.min(ceiling, value);
  }

  return { limits, blockers: unique(blockers) };
}

function campaignKey(companyInput) {
  const platforms = Array.isArray(companyInput?.platforms)
    ? [...companyInput.platforms].sort().join(',')
    : '';
  return [
    companyInput?.projectSlug ?? '',
    companyInput?.eventId ?? '',
    companyInput?.requestedMode ?? '',
    platforms,
  ].join(':');
}

function parseSyntheticTimestamp(value) {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) return Number.NaN;
  return Date.parse(value);
}

function invalidEnvelopeVerdict() {
  return {
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    status: 'blocked',
    campaignKey: '',
    blockers: ['invalid_adversarial_envelope'],
    signals: [],
    limits: { ...DEFAULT_ADVERSARIAL_LIMITS },
    budget: {
      steps: undefined,
      costUnits: undefined,
      elapsedMs: undefined,
    },
  };
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

function evaluateSealedEnvelope(envelope) {
  const blockers = [];
  const signals = [];
  const resolvedLimits = resolveLimits(envelope?.limits);
  const limits = resolvedLimits.limits;
  blockers.push(...resolvedLimits.blockers);

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

      const consumedApprovalIds = Array.isArray(envelope?.consumedApprovalIds)
        ? envelope.consumedApprovalIds
        : [];
      if (!Array.isArray(envelope?.consumedApprovalIds)) blockers.push('invalid_consumed_approvals');
      if (consumedApprovalIds.includes(approval.id)) blockers.push('approval_reuse_detected');
    }
  }

  const observedAt = parseSyntheticTimestamp(envelope?.observedAt);
  const proofObservedAt = parseSyntheticTimestamp(envelope?.proofObservedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(proofObservedAt)) {
    blockers.push('proof_time_invalid');
  } else {
    const proofAgeMs = observedAt - proofObservedAt;
    if (proofAgeMs < 0) blockers.push('proof_timestamp_in_future');
    if (proofAgeMs > limits.maxProofAgeMs) blockers.push('proof_stale');
  }

  const seenCampaignKeys = Array.isArray(envelope?.seenCampaignKeys)
    ? envelope.seenCampaignKeys
    : [];
  if (!Array.isArray(envelope?.seenCampaignKeys)) blockers.push('invalid_campaign_history');
  if (seenCampaignKeys.includes(key)) blockers.push('duplicate_campaign');

  const delegationChain = Array.isArray(envelope?.delegationChain)
    ? envelope.delegationChain
    : [];
  if (!Array.isArray(envelope?.delegationChain)) blockers.push('invalid_delegation_chain');
  if (delegationChain.length === 0 || delegationChain[0] !== 'juss-chief-ai') {
    blockers.push('delegation_root_invalid');
  }
  if (delegationChain.some((agent) => typeof agent !== 'string' || !ALLOWED_DELEGATES.has(agent))) {
    blockers.push('delegation_agent_invalid');
  }
  if (delegationChain.length > limits.maxDelegationDepth) blockers.push('delegation_depth_exceeded');
  if (new Set(delegationChain).size !== delegationChain.length) blockers.push('delegation_loop_detected');

  const budget = envelope?.budget;
  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
    blockers.push('invalid_budget');
  }
  if (!Number.isInteger(budget?.steps) || !isFiniteNonNegative(budget?.steps) || budget.steps > limits.maxSteps) {
    blockers.push('step_budget_exceeded');
  }
  if (!Number.isInteger(budget?.costUnits) || !isFiniteNonNegative(budget?.costUnits) || budget.costUnits > limits.maxCostUnits) {
    blockers.push('cost_budget_exceeded');
  }
  if (!Number.isInteger(budget?.elapsedMs) || !isFiniteNonNegative(budget?.elapsedMs) || budget.elapsedMs > limits.maxElapsedMs) {
    blockers.push('runtime_timeout');
  }

  const prompt = String(envelope?.prompt ?? '');
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    blockers.push('prompt_injection_detected');
  }

  const agentVotes = Array.isArray(envelope?.agentVotes) ? envelope.agentVotes : [];
  if (!Array.isArray(envelope?.agentVotes)) blockers.push('invalid_agent_votes');
  const voterIds = new Set();
  const decisions = [];
  for (const vote of agentVotes) {
    if (
      !vote
      || typeof vote !== 'object'
      || !ALLOWED_VOTERS.has(vote.agent)
      || !VALID_VOTE_DECISIONS.has(vote.decision)
    ) {
      blockers.push('invalid_agent_vote');
      continue;
    }
    if (voterIds.has(vote.agent)) blockers.push('duplicate_agent_vote');
    voterIds.add(vote.agent);
    decisions.push(vote.decision);
  }
  if (REQUIRED_VOTERS.some((agent) => !voterIds.has(agent))) {
    blockers.push('agent_votes_incomplete');
  }
  const uniqueDecisions = unique(decisions);
  if (uniqueDecisions.length > 1) blockers.push('agent_disagreement_unresolved');
  if (uniqueDecisions.length === 1 && uniqueDecisions[0] === 'block') {
    blockers.push('agent_consensus_block');
  }

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
      steps: budget?.steps,
      costUnits: budget?.costUnits,
      elapsedMs: budget?.elapsedMs,
    },
  };
}

export function evaluateAdversarialEnvelope(envelope) {
  try {
    return evaluateSealedEnvelope(sealSandboxValue(envelope));
  } catch {
    return invalidEnvelopeVerdict();
  }
}

function inspectClaimedReceipts(claimedReceipts, actualReceipts, expectedEventId) {
  if (claimedReceipts === undefined) return [];
  if (!Array.isArray(claimedReceipts)) return ['receipt_claim_invalid'];

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
  let sealedEnvelope;
  try {
    sealedEnvelope = sealSandboxValue(envelope);
  } catch {
    const verdict = invalidEnvelopeVerdict();
    return {
      status: 'blocked',
      phase: 'preflight',
      simulatorInvoked: false,
      authority: verdict.authority,
      blockers: verdict.blockers,
      campaignKey: verdict.campaignKey,
      sandbox: null,
      result: null,
      receipts: [],
    };
  }

  const preflight = evaluateSealedEnvelope(sealedEnvelope);
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

  const sandboxRun = runCompanySandbox(sealedEnvelope.companyInput, {
    expectedInputFingerprint: sealedEnvelope.expectedInputFingerprint,
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
      sealedEnvelope.claimedReceipts,
      result.receipts,
      result.campaign?.eventId ?? sealedEnvelope.companyInput?.eventId,
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
