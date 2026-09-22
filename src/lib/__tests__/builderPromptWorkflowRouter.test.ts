import { describe, expect, it } from 'vitest';
import {
  BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
  BUILDER_PROMPT_KILL_SWITCHES,
  BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
  BUILDER_PROMPT_WORKFLOW_STACKS,
  builderPromptAuthorityScopeHash,
  founderApprovedBuilderPromptAuthorityEscalation,
  selectBuilderPromptWorkflow,
  type BuilderPromptAuthorityScope,
  type BuilderPromptIntent,
} from '../builderPromptWorkflowRouter.js';
import {
  createFounderControlDecision,
  isFounderSystemOwnedControlMode,
  type FounderControlProposalBinding,
} from '../founderControlDecision.js';

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
    'routes %s deterministically without silently minting authority',
    (intent, modes) => {
      const selected = selectBuilderPromptWorkflow(intent);
      expect(selected).toMatchObject({
        contract: BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
        intent,
        modes,
        intensity: 3,
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
      });
      expect(selected.killSwitches).toEqual(BUILDER_PROMPT_KILL_SWITCHES);
      for (const mode of selected.modes) expect(isFounderSystemOwnedControlMode(mode)).toBe(true);
    },
  );

  it('keeps the exported stack registry aligned with the deterministic contract', () => {
    expect(BUILDER_PROMPT_WORKFLOW_STACKS).toEqual(expected);
  });

  it('keeps intensity independent from flow identity and bounded to 1..5', () => {
    expect(selectBuilderPromptWorkflow('adversarial-audit', 5).intensity).toBe(5);
    expect(selectBuilderPromptWorkflow('focused-repair', 1).modes).toEqual(expected['focused-repair']);
    expect(() => selectBuilderPromptWorkflow('focused-repair', 6 as never)).toThrow('intensity must be an integer from 1 through 5');
  });

  it('fails closed for unsupported intent instead of guessing', () => {
    expect(() => selectBuilderPromptWorkflow('unknown' as BuilderPromptIntent)).toThrow('unsupported builder prompt intent');
  });

  it('widens authority only after exact founder approval binds the requested scope', () => {
    const selection = selectBuilderPromptWorkflow('complex-architecture', 4);
    const scope: BuilderPromptAuthorityScope = {
      subject: 'jussray/founder-control-room#860@exact-head',
      capabilities: ['repository-write', 'provider-read'],
      providers: ['github'],
      operations: ['focused-source-repair'],
      environment: 'review',
      intensity: 4,
    };
    const proposal: FounderControlProposalBinding = {
      proposalId: 'builder-escalation-860',
      proposalHash: builderPromptAuthorityScopeHash(scope),
      projectSlug: 'founder-control-room',
      actionType: 'builder-workflow-authority-escalation',
      expectedHeadSha: 'a'.repeat(40),
      capabilityPlanHash: null,
    };
    const decision = createFounderControlDecision({
      proposal,
      surface: 'fcr',
      decision: 'approved',
    });

    expect(founderApprovedBuilderPromptAuthorityEscalation({
      selection,
      scope,
      decision,
      expectedProposal: proposal,
    })).toMatchObject({
      contract: BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
      intent: 'complex-architecture',
      authorityChanged: true,
      executionAuthorized: true,
      scopeHash: proposal.proposalHash,
      founderDecisionHash: decision.decisionHash,
    });

    expect(() => founderApprovedBuilderPromptAuthorityEscalation({
      selection,
      scope: { ...scope, operations: [...scope.operations, 'deploy'] },
      decision,
      expectedProposal: proposal,
    })).toThrow('founder approval is not bound to the exact requested authority scope');
  });
});
