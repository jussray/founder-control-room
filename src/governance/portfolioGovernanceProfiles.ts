import {
  evaluateGovernedAction,
  type ActionRisk,
  type GovernedActionVerdict,
  type RecoveryLevel,
} from './governedIntelligence.js';
import {
  enforceConsequentialDecisionContext,
  type ContextBoundGovernedActionRequest,
} from './portfolioDecisionContext.js';

export type PortfolioImplementationState = 'active' | 'bounded' | 'foundation' | 'not_implemented';

export interface PortfolioGovernanceProfile {
  id: string;
  repositories: string[];
  implementationState: PortfolioImplementationState;
  humanAuthority: string;
  objectiveTruthSources: Array<'provider_evidence' | 'system_observation'>;
  minimumRecoveryLevel: RecoveryLevel;
  hardConstraints: string[];
  blockedActions: string[];
  requiredClaims: Record<string, string[]>;
  actionRiskFloors: Partial<Record<string, ActionRisk>>;
}

const DAY = 24 * 60 * 60 * 1000;
const RECOVERY_RANK: Record<RecoveryLevel, number> = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 };
const ACTION_RISK_RANK: Record<ActionRisk, number> = { observe: 0, reversible: 1, consequential: 2, irreversible: 3 };

function maxRisk(requested: ActionRisk, floor?: ActionRisk): ActionRisk {
  if (!floor) return requested;
  return ACTION_RISK_RANK[requested] >= ACTION_RISK_RANK[floor] ? requested : floor;
}

function portfolioActionRegistered(profile: PortfolioGovernanceProfile, action: string): boolean {
  return profile.blockedActions.includes(action)
    || Object.prototype.hasOwnProperty.call(profile.requiredClaims, action)
    || Object.prototype.hasOwnProperty.call(profile.actionRiskFloors, action);
}

export const PORTFOLIO_GOVERNANCE_PROFILES: readonly PortfolioGovernanceProfile[] = [
  {
    id: 'founder-control-room', repositories: ['jussray/founder-control-room'], implementationState: 'active',
    humanAuthority: 'founder', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: [
      'privileged repository actions remain exact-head and founder-approval bound',
      'provider truth cannot be replaced by repository or memory claims',
      'unresolved deployment-authority conflicts block production promotion',
    ],
    blockedActions: [],
    requiredClaims: { merge: ['repository_head_matches_plan', 'approved_capability_registry_matches'], deploy: ['repository_head_matches_plan', 'production_authority_is_singular'] },
    actionRiskFloors: { merge: 'consequential', deploy: 'consequential' },
  },
  {
    id: 'chief-ai-machine', repositories: ['jussray/chief-ai-machine'], implementationState: 'active',
    humanAuthority: 'founder', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R1',
    hardConstraints: ['company intelligence must preserve source and confidence boundaries', 'saved intelligence cannot self-promote into execution authority'],
    blockedActions: [], requiredClaims: { production_claim: ['exact_production_version_verified'] },
    actionRiskFloors: { production_claim: 'observe' },
  },
  {
    id: 'promptos', repositories: ['jussray/promptos'], implementationState: 'active',
    humanAuthority: 'founder', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R1',
    hardConstraints: ['compiled intent remains below deployment or provider authority', 'submitted decision receipts remain unverified until independently proven'],
    blockedActions: [], requiredClaims: { execute: ['current_intent_verified', 'execution_authority_verified'] },
    actionRiskFloors: { execute: 'consequential' },
  },
  {
    id: 'sekret-bip', repositories: ['jussray/Sekret-Bip'], implementationState: 'active',
    humanAuthority: 'account actor within server-enforced teen/parent scope', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['privacy and safety constraints outrank remembered preferences', 'rendered or launch claims require exact runtime and device evidence', 'a FutureYou projection cannot override current authenticated user choice'],
    blockedActions: [], requiredClaims: { production_claim: ['exact_production_version_verified'], account_authority_change: ['server_authority_verified'] },
    actionRiskFloors: { production_claim: 'observe', account_authority_change: 'consequential' },
  },
  {
    id: 'sekret-bip-jr', repositories: ['jussray/Se-kretBip'], implementationState: 'bounded',
    humanAuthority: 'adult authority with child input inside age-banded scope', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['adult setup and server-enforced authority remain mandatory', 'child input cannot expand adult-granted permissions', 'public social feed, peer search, followers, DMs, peer voice/video, and child-created groups remain prohibited'],
    blockedActions: ['enable-public-social', 'enable-child-dm', 'expand-child-permissions-without-adult'], requiredClaims: { authority_change: ['adult_authority_verified', 'server_authority_verified'] },
    actionRiskFloors: { authority_change: 'consequential' },
  },
  {
    id: 'jussbeautifulhair', repositories: ['jussray/jussbeautifulhair-site', 'jussray/jbh-private'], implementationState: 'active',
    humanAuthority: 'founder for operations; customer intent for customer choices', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['private admin, vendor, customer, and order authority remains separated from the public storefront', 'commerce completion requires provider-backed order or checkout evidence rather than UI success alone'],
    blockedActions: [], requiredClaims: { commerce_completion: ['commerce_provider_receipt_verified'], production_claim: ['exact_production_version_verified'] },
    actionRiskFloors: { commerce_completion: 'observe', production_claim: 'observe' },
  },
  {
    id: 'storyengine', repositories: ['jussray/StoryEngine'], implementationState: 'bounded',
    humanAuthority: 'creator', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['source analysis may propose canon but cannot promote canon without explicit creator approval', 'semantic similarity is not authorization', 'revocation beats cache TTL'],
    blockedActions: ['auto-promote-canon'], requiredClaims: { canonize: ['creator_approval_verified', 'source_lineage_verified'] },
    actionRiskFloors: { canonize: 'consequential' },
  },
  {
    id: 'solcontinuity', repositories: ['jussray/solcontinuity'], implementationState: 'active',
    humanAuthority: 'founder', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['application-layer evidence must not be promoted into a claim about Solana consensus or universal inclusion', 'private keys must not become runtime inputs to the governed broadcast examples', 'registry publication, deployment, spending, grants, live transaction tests, and merge remain explicit founder decisions'],
    blockedActions: ['load-private-key'], requiredClaims: { broadcast_claim: ['signed_transaction_supplied', 'independent_confirmation_observed'] },
    actionRiskFloors: { broadcast_claim: 'observe' },
  },
  {
    id: 'sleepwealth-agent', repositories: ['jussray/SleepWealth-Agent'], implementationState: 'bounded',
    humanAuthority: 'human approval inside simulation only', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['live execution is disabled', 'paper or mock results are not investment-performance claims', 'the project does not claim trading alpha'],
    blockedActions: ['live-trade', 'enable-live-broker', 'auto-increase-ceiling'], requiredClaims: { paper_execution: ['approval_verified', 'risk_gate_verified', 'mock_execution_receipt_verified'] },
    actionRiskFloors: { paper_execution: 'consequential' },
  },
  {
    id: 'untold-stories-storefront', repositories: ['jussray/untold-stories-storefront'], implementationState: 'foundation',
    humanAuthority: 'founder for release; customer for checkout intent', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R2',
    hardConstraints: ['repository proof is not production storefront proof', 'production release claims require exact deployed SHA plus real catalog/cart/checkout validation'],
    blockedActions: [], requiredClaims: { production_claim: ['exact_production_version_verified', 'commerce_path_verified'] },
    actionRiskFloors: { production_claim: 'observe' },
  },
  {
    id: 'sweats', repositories: ['jussray/Sweats'], implementationState: 'not_implemented',
    humanAuthority: 'founder', objectiveTruthSources: ['provider_evidence', 'system_observation'], minimumRecoveryLevel: 'R0',
    hardConstraints: ['do not promote a brand concept or initial repository into an implemented runtime claim'],
    blockedActions: ['runtime-claim', 'production-claim', 'autonomous-action'], requiredClaims: {}, actionRiskFloors: {},
  },
] as const;

export function portfolioGovernanceProfile(repository: string): PortfolioGovernanceProfile | null {
  const normalized = repository.trim().toLowerCase();
  return PORTFOLIO_GOVERNANCE_PROFILES.find((profile) =>
    profile.repositories.some((candidate) => candidate.toLowerCase() === normalized)) ?? null;
}

export function portfolioHardConstraintViolations(
  repository: string,
  action: string,
  recoveryLevel?: RecoveryLevel | null,
  effectiveRisk?: ActionRisk,
): string[] {
  const profile = portfolioGovernanceProfile(repository);
  if (!profile) return ['repository has no governed portfolio profile'];
  const reasons: string[] = [];
  if (profile.implementationState === 'not_implemented' && action !== 'observe') {
    reasons.push('project has no implemented runtime authority');
  }
  if (profile.blockedActions.includes(action)) reasons.push(`project profile explicitly blocks action: ${action}`);
  if (effectiveRisk && effectiveRisk !== 'observe' && !portfolioActionRegistered(profile, action)) {
    reasons.push(`effectful action must be explicitly registered in project profile: ${action}`);
  }
  if (recoveryLevel && RECOVERY_RANK[recoveryLevel] < RECOVERY_RANK[profile.minimumRecoveryLevel]) {
    reasons.push(`project requires recovery ${profile.minimumRecoveryLevel} or stronger; received ${recoveryLevel}`);
  }
  return reasons;
}

export function evaluatePortfolioGovernedAction(
  repository: string,
  action: string,
  request: ContextBoundGovernedActionRequest,
): GovernedActionVerdict {
  const profile = portfolioGovernanceProfile(repository);
  const requiredClaims = profile?.requiredClaims[action] ?? [];
  const explicitClaims = request.requiredClaims ?? [];
  const mergedClaims = [
    ...explicitClaims,
    ...requiredClaims
      .filter((claim) => !explicitClaims.some((candidate) => candidate.claim === claim))
      .map((claim) => ({ claim })),
  ];
  const effectiveRisk = maxRisk(request.risk, profile?.actionRiskFloors[action]);
  const evaluatedRequest: ContextBoundGovernedActionRequest = {
    ...request,
    risk: effectiveRisk,
    requiredClaims: mergedClaims,
    hardConstraintViolations: [
      ...(request.hardConstraintViolations ?? []),
      ...portfolioHardConstraintViolations(repository, action, request.recoveryPlan?.level, effectiveRisk),
    ],
  };

  const verdict = evaluateGovernedAction(evaluatedRequest);
  return enforceConsequentialDecisionContext(evaluatedRequest, verdict, effectiveRisk);
}

export const PORTFOLIO_CONSEQUENTIAL_MEMORY_MAX_AGE_MS = DAY;