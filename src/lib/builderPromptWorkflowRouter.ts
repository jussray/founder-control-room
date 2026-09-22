import { createHash } from 'node:crypto';
import {
  validateFounderControlDecision,
  type FounderControlDecision,
  type FounderControlProposalBinding,
} from './founderControlDecision.js';

export const BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT = 'juss/builder-prompt-workflow-router@v1' as const;
export const BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT = 'juss/builder-prompt-authority-escalation@v1' as const;

export type BuilderPromptIntent =
  | 'focused-repair'
  | 'complex-architecture'
  | 'investment-business'
  | 'launch-readiness'
  | 'legal-analysis'
  | 'durable-architecture'
  | 'adversarial-audit'
  | 'video-story';

export type BuilderPromptIntensity = 1 | 2 | 3 | 4 | 5;

export const BUILDER_PROMPT_INTENSITY_POLICY = Object.freeze({
  min: 1 as BuilderPromptIntensity,
  max: 5 as BuilderPromptIntensity,
  default: 3 as BuilderPromptIntensity,
  adaptive: true,
  changesMethod: false,
  changesAuthorityByItself: false,
  deeperEffortMayIncrease: Object.freeze([
    'analysis-depth',
    'hypothesis-breadth',
    'adversarial-passes',
    'evidence-reacquisition',
    'verification-effort',
  ]),
});

export const BUILDER_PROMPT_KILL_SWITCHES = Object.freeze([
  'proof-reached',
  'material-blocker',
  'authority-boundary',
  'subject-stale',
  'containment-violation',
  'receipt-mismatch',
  'budget-ceiling',
  'founder-stop',
  'safety-critical-unknown',
  'diminishing-information-gain',
] as const);

export type BuilderPromptKillSwitch = (typeof BUILDER_PROMPT_KILL_SWITCHES)[number];

export const BUILDER_PROMPT_WORKFLOW_STACKS = Object.freeze({
  'focused-repair': ['goalfix', 'truthmode', 'confess'],
  'complex-architecture': ['ultrathink', 'l99', 'redteam', 'redteam2'],
  'investment-business': ['investor-redteam', 'money-path', '10truth'],
  'launch-readiness': ['launch', 'proofmode', 'confess'],
  'legal-analysis': ['law', 'truthmode', 'confess'],
  'durable-architecture': ['lindymode', 'localfirst', 'redteam'],
  'adversarial-audit': ['attack10', 'redteam', 'redteam2'],
  'video-story': ['leevize', 'proofmode'],
} satisfies Record<BuilderPromptIntent, readonly string[]>);

export interface BuilderPromptWorkflowSelection {
  contract: typeof BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT;
  intent: BuilderPromptIntent;
  modes: readonly string[];
  intensity: BuilderPromptIntensity;
  killSwitches: readonly BuilderPromptKillSwitch[];
  authorityChanged: false;
  executionAuthorized: false;
  authorityEscalation: {
    mayRequest: true;
    founderApprovalRequired: true;
    exactScopeBindingRequired: true;
    approvalMayWidenAuthority: true;
    selectionAloneMayWidenAuthority: false;
    expiresOnSubjectOrScopeChange: true;
  };
}

export interface BuilderPromptAuthorityScope {
  subject: string;
  capabilities: readonly string[];
  providers: readonly string[];
  operations: readonly string[];
  environment: string;
  intensity: BuilderPromptIntensity;
}

export interface BuilderPromptAuthorityEscalation {
  contract: typeof BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT;
  intent: BuilderPromptIntent;
  scope: BuilderPromptAuthorityScope;
  scopeHash: string;
  founderDecisionHash: string;
  authorityChanged: true;
  executionAuthorized: true;
}

function boundedIntensity(value: unknown): BuilderPromptIntensity {
  const parsed = Number(value ?? BUILDER_PROMPT_INTENSITY_POLICY.default);
  if (!Number.isInteger(parsed) || parsed < BUILDER_PROMPT_INTENSITY_POLICY.min || parsed > BUILDER_PROMPT_INTENSITY_POLICY.max) {
    throw new Error('intensity must be an integer from 1 through 5');
  }
  return parsed as BuilderPromptIntensity;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedAuthorityScope(scope: BuilderPromptAuthorityScope): BuilderPromptAuthorityScope {
  return {
    subject: scope.subject.trim(),
    capabilities: sortedUnique(scope.capabilities),
    providers: sortedUnique(scope.providers),
    operations: sortedUnique(scope.operations),
    environment: scope.environment.trim(),
    intensity: boundedIntensity(scope.intensity),
  };
}

export function builderPromptAuthorityScopeHash(scope: BuilderPromptAuthorityScope): string {
  const normalized = normalizedAuthorityScope(scope);
  if (!normalized.subject || !normalized.environment) throw new Error('authority scope requires subject and environment');
  if (normalized.capabilities.length < 1 && normalized.operations.length < 1) {
    throw new Error('authority scope requires at least one capability or operation');
  }
  return createHash('sha256').update(JSON.stringify([
    BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
    normalized.subject,
    normalized.capabilities,
    normalized.providers,
    normalized.operations,
    normalized.environment,
    normalized.intensity,
  ])).digest('hex');
}

/**
 * Deterministically maps trusted controller intent to reasoning/evidence modes.
 * Selection itself cannot execute or widen authority. It may request a separately
 * founder-approved escalation whose approval is bound to an exact scope hash.
 */
export function selectBuilderPromptWorkflow(
  intent: BuilderPromptIntent,
  intensity: BuilderPromptIntensity = BUILDER_PROMPT_INTENSITY_POLICY.default,
): BuilderPromptWorkflowSelection {
  const modes = BUILDER_PROMPT_WORKFLOW_STACKS[intent];
  if (!modes) throw new Error('unsupported builder prompt intent');
  return {
    contract: BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
    intent,
    modes,
    intensity: boundedIntensity(intensity),
    killSwitches: BUILDER_PROMPT_KILL_SWITCHES,
    authorityChanged: false,
    executionAuthorized: false,
    authorityEscalation: {
      mayRequest: true,
      founderApprovalRequired: true,
      exactScopeBindingRequired: true,
      approvalMayWidenAuthority: true,
      selectionAloneMayWidenAuthority: false,
      expiresOnSubjectOrScopeChange: true,
    },
  };
}

/**
 * Converts an already-selected workflow into a wider execution envelope only
 * after an exact founder decision validates against the exact requested scope.
 * Changing the scope changes its hash and invalidates predecessor approval.
 */
export function founderApprovedBuilderPromptAuthorityEscalation(input: {
  selection: BuilderPromptWorkflowSelection;
  scope: BuilderPromptAuthorityScope;
  decision: FounderControlDecision;
  expectedProposal: FounderControlProposalBinding;
}): BuilderPromptAuthorityEscalation {
  const scope = normalizedAuthorityScope(input.scope);
  const scopeHash = builderPromptAuthorityScopeHash(scope);
  const errors = validateFounderControlDecision(input.decision, input.expectedProposal);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (input.decision.decision !== 'approved' || input.decision.executionAuthorized !== true) {
    throw new Error('explicit founder approval is required before authority escalation');
  }
  if (input.expectedProposal.actionType !== 'builder-workflow-authority-escalation') {
    throw new Error('founder approval actionType does not authorize builder workflow authority escalation');
  }
  if (input.expectedProposal.proposalHash.toLowerCase() !== scopeHash) {
    throw new Error('founder approval is not bound to the exact requested authority scope');
  }
  if (scope.intensity !== input.selection.intensity) {
    throw new Error('authority scope intensity must match the selected workflow intensity');
  }

  return {
    contract: BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
    intent: input.selection.intent,
    scope,
    scopeHash,
    founderDecisionHash: input.decision.decisionHash,
    authorityChanged: true,
    executionAuthorized: true,
  };
}
