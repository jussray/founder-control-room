import { describe, expect, it } from 'vitest';
import {
  BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
  BUILDER_PROMPT_WORKFLOW_STACKS,
  selectBuilderPromptWorkflow,
  type BuilderPromptIntent,
} from '../builderPromptWorkflowRouter.js';
import { isFounderSystemOwnedControlMode } from '../founderControlDecision.js';

const expected: Record<BuilderPromptIntent, readonly string[]> = {
  'focused-repair': ['goalfix', 'truthmode', 'confess'],
  'complex-architecture': ['ultrathink', 'l99', 'redteam', 'redteam2'],
  'investment-business': ['investor-redteam', 'money-path', '10truth'],
  'launch-readiness': ['launch', 'proofmode', 'confess'],
  'legal-analysis': ['law', 'truthmode', 'confess'],
  'durable-architecture': ['lindymode', 'localfirst', 'redteam'],
  'adversarial-audit': ['attack10', 'redteam', 'redteam2'],
  'video-story': ['leevize', 'proofmode'],
};

describe('builder prompt workflow router', () => {
  it.each(Object.entries(expected) as [BuilderPromptIntent, readonly string[]][])(
    'routes %s deterministically without minting authority',
    (intent, modes) => {
      const selected = selectBuilderPromptWorkflow(intent);
      expect(selected).toEqual({
        contract: BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
        intent,
        modes,
        authorityChanged: false,
        executionAuthorized: false,
      });
      for (const mode of selected.modes) expect(isFounderSystemOwnedControlMode(mode)).toBe(true);
    },
  );

  it('keeps the exported stack registry aligned with the deterministic contract', () => {
    expect(BUILDER_PROMPT_WORKFLOW_STACKS).toEqual(expected);
  });

  it('fails closed for unsupported intent instead of guessing', () => {
    expect(() => selectBuilderPromptWorkflow('unknown' as BuilderPromptIntent)).toThrow('unsupported builder prompt intent');
  });
});
