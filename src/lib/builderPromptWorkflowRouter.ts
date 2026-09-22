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
  authorityChanged: false;
  executionAuthorized: false;
}

/**
 * Deterministically maps trusted controller intent to reasoning/evidence modes.
 * This function deliberately cannot execute a workflow or mint authority.
 */
export function selectBuilderPromptWorkflow(intent: BuilderPromptIntent): BuilderPromptWorkflowSelection {
  const modes = BUILDER_PROMPT_WORKFLOW_STACKS[intent];
  if (!modes) throw new Error('unsupported builder prompt intent');
  return {
    contract: BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
    intent,
    modes,
    authorityChanged: false,
    executionAuthorized: false,
  };
}
