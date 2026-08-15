import type { AuthorityLevel } from './authorityLevels.js';

export type StandingFounderAction =
  | 'inspect_project'
  | 'analyze'
  | 'sandbox'
  | 'create_branch'
  | 'edit_branch'
  | 'run_tests'
  | 'open_pr'
  | 'integrate_main'
  | 'deploy'
  | 'provider_mutation'
  | 'external_communication'
  | 'spend'
  | 'destructive_change'
  | 'authority_change';

export type StandingFounderMode = 'autonomous' | 'proof-gated' | 'founder-required';

export interface StandingFounderRule {
  action: StandingFounderAction;
  minimumAuthority: AuthorityLevel;
  mode: StandingFounderMode;
  reversible: boolean;
  requiresExactHead: boolean;
  requiresEvidence: boolean;
  requiresRollback: boolean;
  requiresProviderReadback: boolean;
  providerTypes: readonly string[];
  capabilityIds: readonly string[];
  reason: string;
}

const RULES: Readonly<Record<StandingFounderAction, StandingFounderRule>> = Object.freeze({
  inspect_project: {
    action: 'inspect_project', minimumAuthority: 'L1', mode: 'autonomous', reversible: true,
    requiresExactHead: false, requiresEvidence: false, requiresRollback: false, requiresProviderReadback: false,
    providerTypes: [], capabilityIds: [],
    reason: 'Read-only inspection is reversible and should not require founder interruption.',
  },
  analyze: {
    action: 'analyze', minimumAuthority: 'L2', mode: 'autonomous', reversible: true,
    requiresExactHead: false, requiresEvidence: true, requiresRollback: false, requiresProviderReadback: false,
    providerTypes: [], capabilityIds: [],
    reason: 'Analysis may proceed automatically when claims remain evidence-bound and non-mutating.',
  },
  sandbox: {
    action: 'sandbox', minimumAuthority: 'L3', mode: 'autonomous', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: false, requiresProviderReadback: false,
    providerTypes: [], capabilityIds: [],
    reason: 'Isolated sandbox work is the default autonomous execution lane.',
  },
  create_branch: {
    action: 'create_branch', minimumAuthority: 'L4', mode: 'autonomous', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: ['github'], capabilityIds: ['create_branch'],
    reason: 'A scoped branch is reversible and may be created under standing founder policy when exact-head and project authority are known.',
  },
  edit_branch: {
    action: 'edit_branch', minimumAuthority: 'L4', mode: 'autonomous', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: ['github'], capabilityIds: ['create_branch'],
    reason: 'Focused branch edits are autonomous when they preserve unrelated work and remain exact-head verifiable.',
  },
  run_tests: {
    action: 'run_tests', minimumAuthority: 'L4', mode: 'autonomous', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: false, requiresProviderReadback: false,
    providerTypes: [], capabilityIds: [],
    reason: 'Tests and proof collection should run without founder interruption.',
  },
  open_pr: {
    action: 'open_pr', minimumAuthority: 'L4', mode: 'autonomous', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: ['github'], capabilityIds: ['create_branch'],
    reason: 'Opening a focused change proposal is reversible and should be autonomous under standing policy.',
  },
  integrate_main: {
    action: 'integrate_main', minimumAuthority: 'L5', mode: 'proof-gated', reversible: true,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: ['github'], capabilityIds: ['integrate_main'],
    reason: 'Integration may be autonomous only after the standing proof gate and exact-head policy are satisfied.',
  },
  deploy: {
    action: 'deploy', minimumAuthority: 'L6', mode: 'proof-gated', reversible: false,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: ['deploy'],
    reason: 'Production release requires proof, rollback readiness, project-scoped authority, and post-change read-back.',
  },
  provider_mutation: {
    action: 'provider_mutation', minimumAuthority: 'L6', mode: 'proof-gated', reversible: false,
    requiresExactHead: false, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: ['deploy'],
    reason: 'Provider state changes require a bounded capability, rollback path, and verified read-back.',
  },
  external_communication: {
    action: 'external_communication', minimumAuthority: 'L6', mode: 'founder-required', reversible: false,
    requiresExactHead: false, requiresEvidence: true, requiresRollback: false, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: ['send_external_message'],
    reason: 'External communication remains a founder-controlled act unless a separate explicit communication policy exists.',
  },
  spend: {
    action: 'spend', minimumAuthority: 'L6', mode: 'founder-required', reversible: false,
    requiresExactHead: false, requiresEvidence: true, requiresRollback: false, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: [],
    reason: 'Financial commitment remains founder-controlled unless a separate amount-bounded policy exists.',
  },
  destructive_change: {
    action: 'destructive_change', minimumAuthority: 'L6', mode: 'founder-required', reversible: false,
    requiresExactHead: true, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: [],
    reason: 'Destructive actions remain founder-controlled because recovery may be incomplete or impossible.',
  },
  authority_change: {
    action: 'authority_change', minimumAuthority: 'L6', mode: 'founder-required', reversible: false,
    requiresExactHead: false, requiresEvidence: true, requiresRollback: true, requiresProviderReadback: true,
    providerTypes: [], capabilityIds: [],
    reason: 'The system may exercise granted authority but may never expand its own authority.',
  },
});

const AUTHORITY_INDEX: Record<AuthorityLevel, number> = {
  L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6,
};

export const STANDING_FOUNDER_POLICY = Object.freeze({
  version: 'standing-founder-policy-v1',
  principle: 'Autonomous to founder standing policy; never autonomous from founder authority.',
  selfExpansionAllowed: false,
  rules: RULES,
});

export function standingFounderRule(action: StandingFounderAction): StandingFounderRule {
  return RULES[action];
}

export function connectionCanSupportStandingAction(input: {
  action: StandingFounderAction;
  authorityLevel: AuthorityLevel | null;
  status: string;
  type?: string | null;
  capabilities?: readonly string[];
  secretRef?: string | null;
}): boolean {
  const rule = standingFounderRule(input.action);
  if (input.status !== 'active' || !input.authorityLevel) return false;
  if (AUTHORITY_INDEX[input.authorityLevel] < AUTHORITY_INDEX[rule.minimumAuthority]) return false;
  if (AUTHORITY_INDEX[rule.minimumAuthority] >= AUTHORITY_INDEX.L4 && !input.secretRef) return false;
  if (rule.providerTypes.length > 0 && (!input.type || !rule.providerTypes.includes(input.type))) return false;
  const capabilities = input.capabilities ?? [];
  if (rule.capabilityIds.some((capability) => !capabilities.includes(capability))) return false;
  return true;
}
