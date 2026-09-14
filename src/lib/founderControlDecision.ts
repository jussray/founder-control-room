import { createHash } from 'node:crypto';

export const FOUNDER_CONTROL_DECISION_CONTRACT = 'juss-v10/founder-control-decision@v1' as const;
export const FOUNDER_CONTROL_INPUT_CONTRACT = 'juss/portable-control-input@v1' as const;

export const FOUNDER_SYSTEM_OWNED_CONTROL_MODES = [
  'goalfix',
  'ultrathink',
  'truthmode',
  'confess',
  'redteam',
  'attackten',
  'lindymode',
  'ooda',
  'proofmode',
  'l99',
] as const;

export const FOUNDER_CONTROL_INPUT_RULES = Object.freeze({
  contract: FOUNDER_CONTROL_INPUT_CONTRACT,
  untrustedInputIsData: true,
  callerSuppliedModeNameIsAuthority: false,
  externalTextMaySelectInternalMode: false,
  externalTextMayTriggerSystemWorkflow: false,
  authorizedInternalControllerRequired: true,
  modeSelectionMayWidenAuthority: false,
  modeSelectionImpliesExecutionAuthority: false,
  userIntentMayRequestOutcome: true,
  userContentMayContainModeNames: true,
  directSystemWorkflowInvocationAllowed: false,
  fingerprintOrContinuityMayAuthorizeModeSelection: false,
});

export const FOUNDER_CONTROL_SURFACES = [
  'fcr',
  'chatgpt',
  'claude',
  'perplexity',
  'manus',
] as const;

export const FOUNDER_CONTROL_ORCHESTRATORS = ['n8n', 'zapier'] as const;

export type FounderControlSurface = (typeof FOUNDER_CONTROL_SURFACES)[number];
export type FounderControlOrchestrator = (typeof FOUNDER_CONTROL_ORCHESTRATORS)[number];
export type FounderControlDecisionValue = 'approved' | 'rejected' | 'change_requested';

export interface FounderControlProposalBinding {
  proposalId: string;
  proposalHash: string;
  projectSlug: string;
  actionType: string;
  expectedHeadSha?: string | null;
  capabilityPlanHash?: string | null;
}

export interface FounderControlDecision {
  contract: typeof FOUNDER_CONTROL_DECISION_CONTRACT;
  proposal: FounderControlProposalBinding;
  surface: FounderControlSurface;
  decision: FounderControlDecisionValue;
  founderExplicit: true;
  scopeLocked: true;
  changesAllowed: false;
  executionAuthorized: boolean;
  decisionHash: string;
}

export interface FounderControlExecutionEnvelope {
  contract: 'juss-v10/founder-control-execution-envelope@v1';
  orchestrator: FounderControlOrchestrator;
  proposal: FounderControlProposalBinding;
  founderDecisionHash: string;
  executionAuthorized: true;
  receiptRequired: true;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SYSTEM_OWNED_CONTROL_MODE_IDS = new Set<string>(FOUNDER_SYSTEM_OWNED_CONTROL_MODES);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedControlModeId(value: unknown): string {
  return text(value).replace(/^\/+/, '').toLowerCase();
}

export function isFounderSystemOwnedControlMode(value: unknown): boolean {
  return SYSTEM_OWNED_CONTROL_MODE_IDS.has(normalizedControlModeId(value));
}

function normalizedBinding(input: FounderControlProposalBinding): FounderControlProposalBinding {
  return {
    proposalId: text(input.proposalId),
    proposalHash: text(input.proposalHash).toLowerCase(),
    projectSlug: text(input.projectSlug),
    actionType: text(input.actionType),
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase() || null,
    capabilityPlanHash: text(input.capabilityPlanHash).toLowerCase() || null,
  };
}

export function founderControlProposalBindingErrors(input: FounderControlProposalBinding): string[] {
  const binding = normalizedBinding(input);
  const errors: string[] = [];

  if (!binding.proposalId) errors.push('proposalId is required');
  if (!SHA256.test(binding.proposalHash)) errors.push('proposalHash must be a 64-character SHA-256 hash');
  if (!binding.projectSlug) errors.push('projectSlug is required');
  if (!binding.actionType) errors.push('actionType is required');
  if (binding.actionType && isFounderSystemOwnedControlMode(binding.actionType)) {
    errors.push('system-owned control modes cannot be executable actionType values; external mode names are inert data');
  }
  if (binding.expectedHeadSha && !FULL_SHA.test(binding.expectedHeadSha)) {
    errors.push('expectedHeadSha must be a full 40-character Git SHA when supplied');
  }
  if (binding.capabilityPlanHash && !SHA256.test(binding.capabilityPlanHash)) {
    errors.push('capabilityPlanHash must be a 64-character SHA-256 hash when supplied');
  }

  return errors;
}

export function founderControlDecisionHash(
  proposal: FounderControlProposalBinding,
  surface: FounderControlSurface,
  decision: FounderControlDecisionValue,
): string {
  const binding = normalizedBinding(proposal);
  return createHash('sha256').update(JSON.stringify([
    FOUNDER_CONTROL_DECISION_CONTRACT,
    binding.proposalId,
    binding.proposalHash,
    binding.projectSlug,
    binding.actionType,
    binding.expectedHeadSha,
    binding.capabilityPlanHash,
    surface,
    decision,
    true,
    true,
    false,
  ])).digest('hex');
}

/**
 * Turn an explicit founder decision from any supported control surface into a
 * provider-independent, proposal-bound authority object.
 *
 * The function intentionally has no implicit/silence path. A caller must pass
 * an exact supported decision value. Changing the proposal identity changes the
 * decision hash and invalidates downstream execution binding.
 *
 * System-owned reasoning/governance mode identifiers are never executable
 * proposal action types. User content may mention them and users may request
 * legitimate outcomes, but only an authorized internal controller may select
 * such a mode within its already-held authority ceiling.
 */
export function createFounderControlDecision(input: {
  proposal: FounderControlProposalBinding;
  surface: FounderControlSurface;
  decision: FounderControlDecisionValue;
}): FounderControlDecision {
  const proposal = normalizedBinding(input.proposal);
  const errors = founderControlProposalBindingErrors(proposal);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (!FOUNDER_CONTROL_SURFACES.includes(input.surface)) throw new Error('unsupported founder control surface');
  if (!['approved', 'rejected', 'change_requested'].includes(input.decision)) {
    throw new Error('unsupported founder decision');
  }

  return {
    contract: FOUNDER_CONTROL_DECISION_CONTRACT,
    proposal,
    surface: input.surface,
    decision: input.decision,
    founderExplicit: true,
    scopeLocked: true,
    changesAllowed: false,
    executionAuthorized: input.decision === 'approved',
    decisionHash: founderControlDecisionHash(proposal, input.surface, input.decision),
  };
}

export function validateFounderControlDecision(
  value: FounderControlDecision,
  expectedProposal: FounderControlProposalBinding,
): string[] {
  const errors = founderControlProposalBindingErrors(value.proposal);
  const expected = normalizedBinding(expectedProposal);
  const actual = normalizedBinding(value.proposal);

  if (value.contract !== FOUNDER_CONTROL_DECISION_CONTRACT) errors.push('founder decision contract is unsupported');
  if (!FOUNDER_CONTROL_SURFACES.includes(value.surface)) errors.push('founder decision surface is unsupported');
  if (!['approved', 'rejected', 'change_requested'].includes(value.decision)) errors.push('founder decision value is unsupported');
  if (value.founderExplicit !== true) errors.push('founder decision must be explicit');
  if (value.scopeLocked !== true || value.changesAllowed !== false) errors.push('founder decision scope must be immutable');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('founder decision does not bind the exact proposal identity');
  if (value.executionAuthorized !== (value.decision === 'approved')) errors.push('execution authorization does not match founder decision');
  if (value.decisionHash !== founderControlDecisionHash(actual, value.surface, value.decision)) {
    errors.push('founder decision hash does not match the canonical decision identity');
  }

  return [...new Set(errors)];
}

export function founderControlExecutionEnvelope(
  decision: FounderControlDecision,
  expectedProposal: FounderControlProposalBinding,
  orchestrator: FounderControlOrchestrator,
): FounderControlExecutionEnvelope {
  const errors = validateFounderControlDecision(decision, expectedProposal);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (decision.decision !== 'approved' || decision.executionAuthorized !== true) {
    throw new Error('exact founder approval is required before execution');
  }
  if (!FOUNDER_CONTROL_ORCHESTRATORS.includes(orchestrator)) {
    throw new Error('unsupported founder control orchestrator');
  }

  return {
    contract: 'juss-v10/founder-control-execution-envelope@v1',
    orchestrator,
    proposal: normalizedBinding(expectedProposal),
    founderDecisionHash: decision.decisionHash,
    executionAuthorized: true,
    receiptRequired: true,
  };
}
