import { getProjectShell, type ProjectShellDefinition } from '../config/projectShells.js';

export const CANONICAL_SHELL_CONTAINERS = [
  'founderIntent',
  'project',
  'mission',
  'capability',
  'authority',
  'action',
  'evidence',
  'truth',
  'outcome',
  'continuity',
  'decision',
  'resource',
  'recovery',
  'nextGate',
] as const;

export type CanonicalShellContainer = (typeof CANONICAL_SHELL_CONTAINERS)[number];
export type TruthClassification = 'verified' | 'inferred' | 'unknown' | 'blocked' | 'conflicted' | 'stale';
export type RealityPlane = 'intent' | 'authority' | 'state' | 'execution' | 'provider' | 'runtime' | 'outcome' | 'human';
export type RealityRelation = 'coherent' | 'temporal' | 'scoped' | 'evidence-conflict' | 'semantic-conflict' | 'contradiction';

export interface RealityClaim {
  id: string;
  subject: string;
  plane: RealityPlane;
  classification: TruthClassification;
  scope?: string;
  observer?: string;
  observedAt?: string;
  evidence?: readonly unknown[];
}

export interface ProjectShellTruth {
  classification: TruthClassification;
  observedAt?: string;
  expiresAt?: string;
  conflicts?: readonly string[];
  realities?: readonly RealityClaim[];
  relation?: RealityRelation;
  governingRealityId?: string;
}

export interface ProjectShellState {
  founderIntent?: unknown;
  project: { slug: string; name?: string; status?: string };
  mission?: unknown;
  capability?: unknown;
  authority?: unknown;
  action?: unknown;
  evidence?: unknown;
  truth?: ProjectShellTruth;
  outcome?: unknown;
  continuity?: unknown;
  decision?: unknown;
  resource?: unknown;
  recovery?: unknown;
  nextGate?: unknown;
}

export interface ProjectShellModel {
  definition: ProjectShellDefinition;
  state: ProjectShellState;
  visibleContainers: readonly CanonicalShellContainer[];
  projectSpecificViews: readonly string[];
  truthMode: {
    label: 'TRUTHMODE / CONFESS';
    classification: TruthClassification;
    realities: readonly RealityClaim[];
    relation: RealityRelation;
    governingRealityId?: string;
    hasUnresolvedContradiction: boolean;
    mayClaimVerifiedOutcome: boolean;
  };
}

export function buildProjectShellModel(projectSlug: string, state: ProjectShellState): ProjectShellModel {
  const definition = getProjectShell(projectSlug);
  if (!definition) throw new Error(`unknown_project_shell:${projectSlug}`);
  if (state.project.slug !== projectSlug) throw new Error(`project_shell_state_mismatch:${projectSlug}`);

  const classification = state.truth?.classification ?? 'unknown';
  const realities = state.truth?.realities ?? [];
  const relation = state.truth?.relation ?? 'coherent';
  const hasUnresolvedContradiction = relation === 'contradiction' || relation === 'evidence-conflict';
  const mayClaimVerifiedOutcome = classification === 'verified'
    && Boolean(state.outcome)
    && Boolean(state.evidence)
    && !hasUnresolvedContradiction;

  return {
    definition,
    state,
    visibleContainers: CANONICAL_SHELL_CONTAINERS,
    projectSpecificViews: definition.projectSpecificViews,
    truthMode: {
      label: 'TRUTHMODE / CONFESS',
      classification,
      realities,
      relation,
      governingRealityId: state.truth?.governingRealityId,
      hasUnresolvedContradiction,
      mayClaimVerifiedOutcome,
    },
  };
}
