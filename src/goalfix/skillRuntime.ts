import { resolveGoalfixIntent, type GoalfixIntent, type ResolveGoalfixIntentInput } from './intent.js';
import {
  detectGoalfixStagnation,
  type GoalfixAttempt,
  type GoalfixStagnationResult,
} from './stagnation.js';

export type GoalfixOperation = 'inspect' | 'repair-base' | 'build' | 'merge';
export type GoalfixBaseHealthStatus = 'VERIFIED_CLEAN' | 'KNOWN_BAD' | 'REPAIRING' | 'UNVERIFIED';

export interface GoalfixScopeBudget {
  firstFilesOrLogs: string[];
  maxInitialReads: number;
  stopCondition: string;
}

export interface GoalfixBaseHealthEvidence {
  repository: string;
  branch: string;
  baseSha: string;
  status: GoalfixBaseHealthStatus;
  evidenceIds: string[];
  verifiedAt?: string;
  repairedFromSha?: string;
}

export interface GoalfixBaseGateDecision {
  status: 'NOT_REQUIRED' | 'PASS' | 'BLOCKED' | 'REPAIR_ONLY';
  mayProceed: boolean;
  reason: string;
}

export interface BuildGoalfixSkillRuntimeInput {
  intent: ResolveGoalfixIntentInput;
  attempts?: GoalfixAttempt[];
  scope: GoalfixScopeBudget;
  operation?: GoalfixOperation;
  baseHealth?: GoalfixBaseHealthEvidence;
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
  operation: GoalfixOperation;
  baseGate: GoalfixBaseGateDecision;
  provenance: {
    artifactSha256?: string;
    sourceName?: string;
  };
  mayProceed: boolean;
  nextAction: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

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

function validIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function uniqueEvidenceIds(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function evaluateBaseGate(
  operation: GoalfixOperation,
  baseHealth: GoalfixBaseHealthEvidence | undefined,
): GoalfixBaseGateDecision {
  if (operation === 'inspect') {
    return {
      status: 'NOT_REQUIRED',
      mayProceed: true,
      reason: 'Read-only inspection may establish base health without mutating the repository.',
    };
  }

  if (!baseHealth) {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'Exact base-health evidence is required before mutation. Inspect the authoritative branch and exact SHA first.',
    };
  }

  const evidenceIds = uniqueEvidenceIds(baseHealth.evidenceIds);
  if (
    !baseHealth.repository.includes('/')
    || !baseHealth.branch.trim()
    || !FULL_SHA.test(baseHealth.baseSha.trim())
  ) {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'Base-health evidence must bind an authoritative repository, branch, and exact 40-character SHA.',
    };
  }

  if (
    baseHealth.repairedFromSha !== undefined
    && (
      !FULL_SHA.test(baseHealth.repairedFromSha.trim())
      || baseHealth.repairedFromSha.toLowerCase() === baseHealth.baseSha.toLowerCase()
    )
  ) {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'A repaired successor must name a different exact predecessor SHA.',
    };
  }

  if (operation === 'repair-base') {
    if (baseHealth.status === 'KNOWN_BAD' || baseHealth.status === 'REPAIRING') {
      return {
        status: 'REPAIR_ONLY',
        mayProceed: true,
        reason: 'The base is not eligible for forward work; only the focused repair or revert path may proceed.',
      };
    }

    if (baseHealth.status === 'UNVERIFIED') {
      return {
        status: 'BLOCKED',
        mayProceed: false,
        reason: 'Do not mutate an unverified base. Establish the failure first, then enter the focused repair path only if the base is proven bad.',
      };
    }

    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'The base is currently verified clean. Do not perform a repair mutation without new evidence of a defect.',
    };
  }

  if (baseHealth.status === 'KNOWN_BAD' || baseHealth.status === 'REPAIRING') {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'Forward work is blocked on a bad base. Repair or revert it first, verify the successor exact SHA, then continue the queued task.',
    };
  }

  if (baseHealth.status !== 'VERIFIED_CLEAN') {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'Forward work requires a VERIFIED_CLEAN base. Acquire exact-head proof before building or merging.',
    };
  }

  if (evidenceIds.length === 0 || !validIsoTimestamp(baseHealth.verifiedAt)) {
    return {
      status: 'BLOCKED',
      mayProceed: false,
      reason: 'VERIFIED_CLEAN is not enough as a label; bind it to at least one evidence ID and a valid verification timestamp.',
    };
  }

  return {
    status: 'PASS',
    mayProceed: true,
    reason: baseHealth.repairedFromSha
      ? 'The bad predecessor was superseded by an evidence-backed VERIFIED_CLEAN successor; forward work may continue from the successor SHA.'
      : 'The exact base SHA is evidence-backed and VERIFIED_CLEAN; forward work may proceed.',
  };
}

export function buildGoalfixSkillRuntimeDecision(
  input: BuildGoalfixSkillRuntimeInput,
): GoalfixSkillRuntimeDecision {
  const intent = resolveGoalfixIntent(input.intent);
  const stagnation = detectGoalfixStagnation(input.attempts ?? []);
  const scope = normalizeScope(input.scope);
  const operation = input.operation ?? 'inspect';
  const baseGate = evaluateBaseGate(operation, input.baseHealth);

  let mayProceed = true;
  let nextAction = operation === 'inspect'
    ? 'Inspect only the scoped first files or logs, then re-observe.'
    : 'Perform only the bounded operation against the verified base.';

  if (intent.confidence === 'low') {
    mayProceed = false;
    nextAction = 'Resolve the founder intent before repository mutation.';
  } else if (!scope.stopCondition) {
    mayProceed = false;
    nextAction = 'Define a concrete stop condition before repository mutation.';
  } else if (!baseGate.mayProceed) {
    mayProceed = false;
    nextAction = baseGate.reason;
  } else if (stagnation.stagnant) {
    mayProceed = false;
    nextAction = stagnation.nextAction;
  } else if (baseGate.status === 'REPAIR_ONLY') {
    nextAction = 'Repair or revert only the verified base defect, preserve unrelated work, verify the successor exact SHA, then resume the queued task.';
  }

  return {
    version: 'goalfix-skill-runtime-v1',
    intent,
    stagnation,
    scope,
    operation,
    baseGate,
    provenance: input.provenance ?? {},
    mayProceed,
    nextAction,
  };
}
