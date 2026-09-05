import {
  validateV10CapabilityPlanContext,
  type V10CapabilityPlan,
} from '../founder-os-lab/capabilityKernel.js';

export const FCR_SKILL_ROUTER_CONTRACT = 'juss/fcr-skill-router@v1' as const;
export const FCR_REQUIRED_PARALLEL_LENSES = [
  'product-design',
  'data-analytics',
  'deep-research',
] as const;

// Keep this tuple synchronized with .control-room/humanizer-donor.contract.json; mismatches fail closed below.
export const FCR_HUMANIZER_CAPABILITY = {
  id: 'humanizer',
  version: '2.11.2',
  origin: 'community',
  owner: 'blader/humanizer',
  sourceHash: 'e86e6c4897212837d0a2a9b966e50e2839eefc0358c5e110e48d494bf3d25186',
  authorityCeiling: 'draft',
} as const;

export type FcrSkillRouterAction =
  | 'inspect'
  | 'plan'
  | 'review'
  | 'draft'
  | 'write'
  | 'merge'
  | 'deploy'
  | 'migrate'
  | 'rollback'
  | 'publish'
  | 'send'
  | 'delete';

export interface FcrSkillRouterRepositoryContext {
  projectId: string;
  provider: string;
}

export interface RouteFcrSkillsInput {
  goal: string;
  action: FcrSkillRouterAction;
  projectSlug: string;
  expectedHeadSha: string;
  expectedRegistryHash: string;
  capabilityPlan?: V10CapabilityPlan;
  repository?: FcrSkillRouterRepositoryContext;
}

export interface FcrSkillRoutingDecision {
  contract: typeof FCR_SKILL_ROUTER_CONTRACT;
  status: 'blocked' | 'ready_for_runtime_discovery';
  goal: string;
  action: FcrSkillRouterAction;
  planHash: string | null;
  plannedCapabilityIds: string[];
  policyRequiredCapabilityIds: string[];
  missingPolicyCapabilityIds: string[];
  requiredParallelLenses: string[];
  missingParallelLenses: string[];
  requiredTools: string[];
  requiredProof: string[];
  mutationRequested: boolean;
  runtimeDiscoveryRequired: true;
  executionAllowed: false;
  errors: string[];
  nextGate: string;
}

const MUTATING_ACTIONS = new Set<FcrSkillRouterAction>([
  'write',
  'merge',
  'deploy',
  'migrate',
  'rollback',
  'publish',
  'send',
  'delete',
]);

const EXPLICIT_SKILL_ALIASES: Readonly<Record<string, string>> = {
  goalfix: 'goalfix',
  humanizer: 'humanizer',
  'repo-truth': 'repo-truth',
  'truth-decay': 'truth-decay-audit',
  'truth-decay-audit': 'truth-decay-audit',
  truthdecay: 'truth-decay-audit',
  'review-verify-merge': 'review-verify-merge',
  'proof-led-publishing': 'proof-led-publishing',
  'juss-chief-ai': 'juss-chief-ai',
  'control-room-agent-router': 'control-room-agent-router',
  'control-room-proof-ladder': 'control-room-proof-ladder',
  'control-room-incident-triage': 'control-room-incident-triage',
  'control-room-design-implementation': 'control-room-design-implementation',
  'control-room-skill-router': 'control-room-skill-router',
  sales: 'sales',
  devil: 'devil',
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function pushUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}

function canonicalCapabilityId(value: string): string {
  return normalize(value).replace(/^(skill|command):/, '');
}

function explicitSkillsFromGoal(goal: string): string[] {
  const required: string[] = [];
  for (const match of goal.matchAll(/\/([a-z0-9-]+)/g)) {
    const skill = EXPLICIT_SKILL_ALIASES[match[1]];
    if (skill) pushUnique(required, skill);
  }
  return required;
}

function isRepositoryGoal(goal: string): boolean {
  return /\b(repo|repository|github|git|branch|commit|pull request|\bpr\b|main|code|test|tests|ci|actions|workflow|merge)\b/.test(goal);
}

function isUiGoal(goal: string): boolean {
  return /\b(ui|screen|design|figma|layout|responsive|mobile|browser|playwright|frontend|visual)\b/.test(goal);
}

function isMessagingGoal(goal: string): boolean {
  return /\b(email|sms|call|calls|webchat|instagram|facebook|whatsapp|telegram|viber|message|messaging|outreach|unified inbox)\b/.test(goal);
}

function isCommercialGoal(goal: string): boolean {
  return /\b(sales|offer|pricing|discount|revenue|conversion|retention|checkout|commercial)\b/.test(goal);
}

function isHumanizerGoal(goal: string): boolean {
  return /\b(humanize|humanizer|de-ai|ai-sounding|sound human|sound more human|match my voice|match the voice|voice-match)\b/.test(goal);
}

function matchesApprovedHumanizerCapability(capability: V10CapabilityPlan['capabilities'][number]): boolean {
  return canonicalCapabilityId(capability.id) === FCR_HUMANIZER_CAPABILITY.id
    && capability.version === FCR_HUMANIZER_CAPABILITY.version
    && capability.origin === FCR_HUMANIZER_CAPABILITY.origin
    && capability.owner === FCR_HUMANIZER_CAPABILITY.owner
    && capability.sourceHash.toLowerCase() === FCR_HUMANIZER_CAPABILITY.sourceHash
    && capability.authorityCeiling === FCR_HUMANIZER_CAPABILITY.authorityCeiling;
}

export function routeFcrSkills(input: RouteFcrSkillsInput): FcrSkillRoutingDecision {
  const goal = normalize(input.goal);
  const errors: string[] = [];
  const requiredTools: string[] = [];
  const requiredProof: string[] = [];
  const policyRequiredCapabilityIds = explicitSkillsFromGoal(goal);
  const requiredParallelLenses = [...FCR_REQUIRED_PARALLEL_LENSES];
  const mutationRequested = MUTATING_ACTIONS.has(input.action);
  const repositoryGoal = isRepositoryGoal(goal) || Boolean(input.repository);
  const uiGoal = isUiGoal(goal);
  const messagingGoal = isMessagingGoal(goal);
  const commercialGoal = isCommercialGoal(goal);
  const humanizerGoal = isHumanizerGoal(goal);
  const mergeReviewGoal = repositoryGoal && (input.action === 'merge' || input.action === 'review');

  pushUnique(requiredProof, 'Product Design disposition recorded for the selected path; UI/runtime claims still require rendered browser evidence');
  pushUnique(requiredProof, 'Data Analytics outcome signals declared before execution and treated as observation-only evidence');
  pushUnique(requiredProof, 'Deep Research uses authoritative primary sources when research can change the decision; research never grants execution authority');

  if (commercialGoal) {
    pushUnique(policyRequiredCapabilityIds, 'sales');
    pushUnique(policyRequiredCapabilityIds, 'devil');
    pushUnique(requiredProof, 'truthful commercial claims and adversarial plan review');
  }

  if (humanizerGoal) {
    pushUnique(policyRequiredCapabilityIds, 'humanizer');
    pushUnique(requiredProof, 'Humanizer execution observes the founder-approved Blader donor pin and preserves claims without unsupported facts');
  }

  if (messagingGoal) {
    pushUnique(policyRequiredCapabilityIds, 'unified-growth-inbox');
    pushUnique(requiredProof, 'unified-growth-inbox consent/compliance gate with draft_only as the default mode');
  }

  if (repositoryGoal) {
    if (!input.repository?.projectId.trim() || !input.repository.provider.trim()) {
      errors.push('authoritative repository context is required for repository work');
    } else {
      pushUnique(requiredTools, input.repository.provider.trim());
      pushUnique(requiredProof, `repository evidence resolved through RepositoryProvider:${input.repository.provider.trim()}`);
    }
    pushUnique(requiredProof, 'authoritative project, branch/ref, and exact commit SHA');
  }

  if (mergeReviewGoal) {
    pushUnique(requiredProof, 'exact-head checks and unresolved review-thread state');
  }

  if (uiGoal) {
    pushUnique(requiredTools, 'playwright');
    pushUnique(requiredProof, 'exact-head Playwright evidence for UI/runtime claims');
  }

  if (mutationRequested) {
    pushUnique(requiredProof, 'action-specific authority, approval, rollback, and execution receipt');
  }

  if (!input.capabilityPlan) {
    errors.push('Chief AI capability plan is required before FCR may accept a skill route');
  } else {
    errors.push(...validateV10CapabilityPlanContext(input.capabilityPlan, {
      goal: input.goal,
      projectSlug: input.projectSlug,
      expectedHeadSha: input.expectedHeadSha,
    }));

    if (input.capabilityPlan.registryHash.toLowerCase() !== input.expectedRegistryHash.trim().toLowerCase()) {
      errors.push('capability plan registry hash does not match the authoritative registry');
    }

    const humanizerCapability = input.capabilityPlan.capabilities.find(
      (capability) => canonicalCapabilityId(capability.id) === FCR_HUMANIZER_CAPABILITY.id,
    );
    if (humanizerCapability) {
      if (!matchesApprovedHumanizerCapability(humanizerCapability)) {
        errors.push('Chief AI humanizer capability does not match the founder-approved Blader donor pin');
      }
      pushUnique(requiredProof, 'Humanizer capability provenance matches .control-room/humanizer-donor.contract.json');
    }
  }

  const plannedCapabilityIds = input.capabilityPlan
    ? input.capabilityPlan.capabilities.map((capability) => canonicalCapabilityId(capability.id))
    : [];
  const planned = new Set(plannedCapabilityIds);
  const missingPolicyCapabilityIds = policyRequiredCapabilityIds.filter((id) => !planned.has(canonicalCapabilityId(id)));
  const plannedLenses = new Set((input.capabilityPlan?.strategicLenses ?? []).map(normalize));
  const missingParallelLenses = requiredParallelLenses.filter((lens) => !plannedLenses.has(lens));

  for (const missing of missingPolicyCapabilityIds) {
    errors.push(`Chief AI capability plan is missing repository-required capability: ${missing}`);
  }
  for (const missing of missingParallelLenses) {
    errors.push(`Chief AI capability plan is missing required RayOS parallel lens: ${missing}`);
  }

  const status = errors.length === 0 ? 'ready_for_runtime_discovery' : 'blocked';
  const nextGate = status === 'blocked'
    ? 'Return the policy failures to Chief AI and require a corrected hash-bound capability plan before runtime discovery or mutation.'
    : 'Discover runtime availability for only the capabilities in the validated Chief AI plan; preserve Product Design, Data Analytics, Deep Research, provider, proof, approval, and execution boundaries.';

  return {
    contract: FCR_SKILL_ROUTER_CONTRACT,
    status,
    goal: input.goal.trim(),
    action: input.action,
    planHash: input.capabilityPlan?.planHash ?? null,
    plannedCapabilityIds,
    policyRequiredCapabilityIds,
    missingPolicyCapabilityIds,
    requiredParallelLenses,
    missingParallelLenses,
    requiredTools,
    requiredProof,
    mutationRequested,
    runtimeDiscoveryRequired: true,
    executionAllowed: false,
    errors,
    nextGate,
  };
}
