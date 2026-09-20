import { resolveGoalfixIntent, type GoalfixIntent, type ResolveGoalfixIntentInput } from './intent.js';
import { GOALFIX_AUTO_STOP_CONDITION } from './contextResolution.js';
import {
  detectGoalfixStagnation,
  type GoalfixAttempt,
  type GoalfixStagnationResult,
} from './stagnation.js';

export interface GoalfixScopeBudget {
  firstFilesOrLogs: string[];
  maxInitialReads: number;
  stopCondition: string;
}

export interface BuildGoalfixSkillRuntimeInput {
  intent: ResolveGoalfixIntentInput;
  attempts?: GoalfixAttempt[];
  scope: GoalfixScopeBudget;
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

function normalizeIntentText(value: string | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function buildGoalfixSkillRuntimeDecision(
  input: BuildGoalfixSkillRuntimeInput,
): GoalfixSkillRuntimeDecision {
  const scope = normalizeScope(input.scope);
  let intent = resolveGoalfixIntent(input.intent);

  // Automatic context may confirm only an unchanged founder outcome. The
  // canonical automatic stop condition is how this runtime distinguishes that
  // lane from manual/explicit intent resolution without trusting caller-added
  // provider or repository metadata. A semantic rewrite remains unconfirmed
  // even if the automatic route supplied confirmed=true.
  if (
    scope.stopCondition === GOALFIX_AUTO_STOP_CONDITION
    && input.intent.resolved !== undefined
    && normalizeIntentText(input.intent.raw) !== normalizeIntentText(input.intent.resolved)
  ) {
    intent = {
      ...intent,
      confidence: 'low',
      confirmed: false,
    };
  }

  const stagnation = detectGoalfixStagnation(input.attempts ?? []);

  let mayProceed = true;
  let nextAction = 'Inspect only the scoped first files or logs, then re-observe.';

  if (intent.confidence === 'low') {
    mayProceed = false;
    nextAction = 'Resolve the founder intent before repository mutation.';
  } else if (!scope.stopCondition) {
    mayProceed = false;
    nextAction = 'Define a concrete stop condition before repository mutation.';
  } else if (stagnation.stagnant) {
    mayProceed = false;
    nextAction = stagnation.nextAction;
  }

  return {
    version: 'goalfix-skill-runtime-v1',
    intent,
    stagnation,
    scope,
    provenance: input.provenance ?? {},
    mayProceed,
    nextAction,
  };
}
