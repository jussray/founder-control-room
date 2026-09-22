export const BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT = 'juss/builder-prompt-workflow-router@v1' as const;

export type BuilderPromptIntent =
  | 'focused-repair'
  | 'complex-architecture'
  | 'investment-business'
  | 'launch-readiness'
  | 'legal-analysis'
  | 'durable-architecture'
  | 'adversarial-audit'
  | 'video-story';

export const BUILDER_ATTACK_SCALES = [10, 100, 200, 1_000, 5_000, 48_000] as const;
export type BuilderAttackScale = (typeof BUILDER_ATTACK_SCALES)[number];
export type BuilderAttackFlow = `attack${BuilderAttackScale}`;

export const BUILDER_ATTACK_FAMILIES = Object.freeze([
  'authority-escalation',
  'stale-evidence-replay',
  'subject-identity-drift',
  'prompt-and-data-injection',
  'tool-permission-creep',
  'network-egress',
  'credential-and-secret-boundary',
  'provider-and-supply-chain',
  'runtime-and-browser-divergence',
  'rollback-and-recovery',
  'duplicate-or-replayed-mutation',
  'cost-rate-and-resource-abuse',
] as const);

export interface BuilderAttackProfile {
  flow: BuilderAttackFlow;
  scale: BuilderAttackScale;
  coverageBudget: BuilderAttackScale;
  materialFindingCap: number;
  families: typeof BUILDER_ATTACK_FAMILIES;
  deduplicate: true;
  stopOnCriticalFinding: true;
  parallelReasoningAllowed: true;
  mutationsRemainSerialized: true;
  authorityChanged: false;
  executionAuthorized: false;
}

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

const ATTACK_SCALE_SET = new Set<number>(BUILDER_ATTACK_SCALES);

export interface BuilderPromptWorkflowSelection {
  contract: typeof BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT;
  intent: BuilderPromptIntent;
  modes: readonly string[];
  attackProfile?: BuilderAttackProfile;
  authorityChanged: false;
  executionAuthorized: false;
}

export function isBuilderPromptIntent(value: unknown): value is BuilderPromptIntent {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(BUILDER_PROMPT_WORKFLOW_STACKS, value);
}

export function parseBuilderAttackScale(value: unknown): BuilderAttackScale {
  if (typeof value !== 'number' || !Number.isInteger(value) || !ATTACK_SCALE_SET.has(value)) {
    throw new Error(`unsupported attack scale; expected one of ${BUILDER_ATTACK_SCALES.join(', ')}`);
  }
  return value as BuilderAttackScale;
}

export function buildBuilderAttackProfile(scale: BuilderAttackScale): BuilderAttackProfile {
  parseBuilderAttackScale(scale);
  return {
    flow: `attack${scale}` as BuilderAttackFlow,
    scale,
    coverageBudget: scale,
    materialFindingCap: Math.min(scale, 48),
    families: BUILDER_ATTACK_FAMILIES,
    deduplicate: true,
    stopOnCriticalFinding: true,
    parallelReasoningAllowed: true,
    mutationsRemainSerialized: true,
    authorityChanged: false,
    executionAuthorized: false,
  };
}

export function builderAttackAuditInstruction(profile: BuilderAttackProfile): string {
  return [
    `Run ${profile.flow} as a bounded adversarial coverage profile with a ${profile.coverageBudget}-case coverage budget.`,
    `Distribute attacks across these families: ${profile.families.join(', ')}.`,
    'Reasoning may run in parallel, but mutations remain serialized behind existing authority gates.',
    `Deduplicate overlapping attacks, stop early on a critical invariant break, and return no more than ${profile.materialFindingCap} material findings.`,
    `The attack budget is coverage pressure, not a requirement to emit ${profile.coverageBudget} findings or spend tokens after evidence saturates.`,
    'Attack profiles never grant execution authority or widen permissions.',
  ].join(' ');
}

/**
 * Deterministically maps trusted controller intent to reasoning/evidence modes.
 * Progressive attack scales are coverage profiles inside adversarial-audit; they
 * are not new executable control modes and cannot mint authority.
 */
export function selectBuilderPromptWorkflow(
  intent: BuilderPromptIntent,
  options: { attackScale?: BuilderAttackScale } = {},
): BuilderPromptWorkflowSelection {
  if (!isBuilderPromptIntent(intent)) throw new Error('unsupported builder prompt intent');
  if (options.attackScale !== undefined && intent !== 'adversarial-audit') {
    throw new Error('attack scale is only valid for adversarial-audit');
  }

  const modes = BUILDER_PROMPT_WORKFLOW_STACKS[intent];
  const attackProfile = intent === 'adversarial-audit'
    ? buildBuilderAttackProfile(options.attackScale ?? 10)
    : undefined;

  return {
    contract: BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
    intent,
    modes,
    ...(attackProfile ? { attackProfile } : {}),
    authorityChanged: false,
    executionAuthorized: false,
  };
}
