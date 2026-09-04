import { resolveGoalfixIntent, type GoalfixIntent, type ResolveGoalfixIntentInput } from './intent.js';
import {
  detectGoalfixStagnation,
  type GoalfixAttempt,
  type GoalfixStagnationResult,
} from './stagnation.js';
import {
  assessArtOfWar,
  type ArtOfWarAssessment,
  type ArtOfWarAssessmentInput,
} from './artOfWar.js';

export interface GoalfixScopeBudget {
  firstFilesOrLogs: string[];
  maxInitialReads: number;
  stopCondition: string;
}

export interface BuildGoalfixSkillRuntimeInput {
  intent: ResolveGoalfixIntentInput;
  attempts?: GoalfixAttempt[];
  scope: GoalfixScopeBudget;
  strategy?: ArtOfWarAssessmentInput;
  provenance?: {
    artifactSha256?: string;
    sourceName?: string;
  };
}

export interface GoalfixSkillRuntimeDecision {
  version: 'goalfix-skill-runtime-v1';
  intent: GoalfixIntent;
  stagnation: GoalfixStagnationResult;
  scope: GoalfixScopeBudget;
  artOfWar: ArtOfWarAssessment | null;
  provenance: {
    artifactSha256?: string;
    sourceName?: string;
  };
  mayProceed: boolean;
  nextAction: string;
}

function normalizeScope(scope: GoalfixScopeBudget): GoalfixScopeBudget {
  const maxInitialReads = Math.max(1, Math.floor(scope.maxInitialReads));
  const uniqueFirstFilesOrLogs = [
    ...new Set(scope.firstFilesOrLogs.map(value => value.trim()).filter(Boolean)),
  ];

  return {
    firstFilesOrLogs: uniqueFirstFilesOrLogs.slice(0, maxInitialReads),
    maxInitialReads,
    stopCondition: scope.stopCondition.trim(),
  };
}

export function buildGoalfixSkillRuntimeDecision(
  input: BuildGoalfixSkillRuntimeInput,
): GoalfixSkillRuntimeDecision {
  const intent = resolveGoalfixIntent(input.intent);
  const stagnation = detectGoalfixStagnation(input.attempts ?? []);
  const scope = normalizeScope(input.scope);
  const artOfWar = input.strategy ? assessArtOfWar(input.strategy) : null;

  let mayProceed = true;
  let nextAction = artOfWar?.nextAction ?? 'Inspect only the scoped first files or logs, then re-observe.';

  if (intent.confidence === 'low') {
    mayProceed = false;
    nextAction = 'Resolve the founder intent before repository mutation.';
  } else if (!scope.stopCondition) {
    mayProceed = false;
    nextAction = 'Define a concrete stop condition before repository mutation.';
  } else if (stagnation.stagnant) {
    mayProceed = false;
    nextAction = stagnation.nextAction;
  } else if (artOfWar && !artOfWar.mayProceed) {
    mayProceed = false;
    nextAction = artOfWar.nextAction;
  }

  return {
    version: 'goalfix-skill-runtime-v1',
    intent,
    stagnation,
    scope,
    artOfWar,
    provenance: input.provenance ?? {},
    mayProceed,
    nextAction,
  };
}
