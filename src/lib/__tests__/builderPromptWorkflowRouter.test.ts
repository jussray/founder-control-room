import { describe, expect, it } from 'vitest';
import {
  BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
  BUILDER_PROMPT_FOUNDER_AUTHORITY_POLICY,
  BUILDER_PROMPT_KILL_SWITCHES,
  BUILDER_PROMPT_WORKFLOW_ROUTER_CONTRACT,
  BUILDER_PROMPT_WORKFLOW_STACKS,
  builderPromptAuthorityScopeHash,
  founderApprovedBuilderPromptAuthorityEscalation,
  resolveBuilderPromptKillSwitch,
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

function approvedEscalation() {
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
  const escalation = founderApprovedBuilderPromptAuthorityEscalation({
    selection,
    scope,
    decision,
    expectedProposal: proposal,
  });
  return { selection, scope, proposal, decision, escalation };
}

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
          founderAuthorityPrecedence: true,
        },
      });
      expect(selected.killSwitches).toEqual(BUILDER_PROMPT_KILL_SWITCHES);
      for (const mode of selected.modes) expect(isFounderSystemOwnedControlMode(mode)).toBe(true);
    },
  );

  it('keeps founder approval as the final in-system authority', () => {
    expect(BUILDER_PROMPT_FOUNDER_AUTHORITY_POLICY).toMatchObject({
      precedence: 'founder-final-in-system-authority',
      killSwitchesBeforeApproval: 'fail-closed',
      killSwitchesAfterApproval: 'advisory-except-founder-stop',
      founderMayContinueThroughSystemKillSwitch: true,
      founderMayRevokeAtAnyTime: true,
      approvalTransfersAcrossScope: false,
    });
  });

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
    const { selection, scope, proposal, decision, escalation } = approvedEscalation();

    expect(escalation).toMatchObject({
      contract: BUILDER_PROMPT_AUTHORITY_ESCALATION_CONTRACT,
      intent: 'complex-architecture',
      authorityChanged: true,
      executionAuthorized: true,
      authorityPrecedence: 'founder-final-in-system-authority',
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

  it.each(BUILDER_PROMPT_KILL_SWITCHES.filter((item) => item !== 'founder-stop'))(
    'treats %s as advisory after exact founder approval',
    (killSwitch) => {
      const { escalation } = approvedEscalation();
      expect(resolveBuilderPromptKillSwitch({ killSwitch, escalation })).toEqual({
        killSwitch,
        founderApprovalActive: true,
        advisoryOnly: true,
        terminateExecution: false,
        authorityRemainsActive: true,
        requiresFounderAttention: true,
        reason: 'founder-authority-precedence',
      });
    },
  );

  it('keeps founder STOP authoritative even after prior founder approval', () => {
    const { escalation } = approvedEscalation();
    expect(resolveBuilderPromptKillSwitch({ killSwitch: 'founder-stop', escalation })).toEqual({
      killSwitch: 'founder-stop',
      founderApprovalActive: true,
      advisoryOnly: false,
      terminateExecution: true,
      authorityRemainsActive: false,
      requiresFounderAttention: false,
      reason: 'founder-stop',
    });
  });

  it('keeps system kill switches fail-closed until founder approval exists', () => {
    expect(resolveBuilderPromptKillSwitch({ killSwitch: 'containment-violation' })).toEqual({
      killSwitch: 'containment-violation',
      founderApprovalActive: false,
      advisoryOnly: false,
      terminateExecution: true,
      authorityRemainsActive: false,
      requiresFounderAttention: true,
      reason: 'pre-approval-fail-closed',
    });
  });
});
