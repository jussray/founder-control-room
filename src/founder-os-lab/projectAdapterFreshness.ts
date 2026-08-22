import type {
  RepositoryTruthFreshness,
  RepositoryTruthRecommendation,
  RepositoryTruthState,
} from '../lib/repositoryTruthAssessment.js';

export interface ProjectAdapterFreshnessInput {
  repository: string;
  auditedHead: string;
  currentHead: string | null;
  auditedContractBlobs: Readonly<Record<string, string>>;
  observedContractBlobs: Readonly<Record<string, string>>;
}

export interface ProjectAdapterFreshnessAssessment {
  state: RepositoryTruthState;
  freshness: RepositoryTruthFreshness;
  recommendation: RepositoryTruthRecommendation;
  repository: string;
  auditedHead: string;
  currentHead: string | null;
  sourceHeadMatchesAudited: boolean;
  contractPathsRequired: string[];
  contractPathsMissing: string[];
  contractPathsDrifted: string[];
  founderReviewRequired: true;
  promotionAllowed: false;
  mutationAuthorized: false;
  blocker: string | null;
  nextAction: string;
  reasons: string[];
}

const EXACT_GIT_OBJECT_SHA = /^[0-9a-f]{40}$/i;

function base(
  input: ProjectAdapterFreshnessInput,
  contractPathsRequired: string[],
) {
  return {
    repository: input.repository,
    auditedHead: input.auditedHead,
    currentHead: input.currentHead,
    contractPathsRequired,
    founderReviewRequired: true as const,
    promotionAllowed: false as const,
    mutationAuthorized: false as const,
  };
}

export function assessProjectAdapterFreshness(
  input: ProjectAdapterFreshnessInput,
): ProjectAdapterFreshnessAssessment {
  const contractPathsRequired = Object.keys(input.auditedContractBlobs);
  const shared = base(input, contractPathsRequired);

  if (!EXACT_GIT_OBJECT_SHA.test(input.auditedHead)) {
    return {
      ...shared,
      state: 'unknown',
      freshness: 'invalid',
      recommendation: 'hold',
      sourceHeadMatchesAudited: false,
      contractPathsMissing: [],
      contractPathsDrifted: [],
      blocker: 'The checked-in project adapter audit head is invalid.',
      nextAction: 'Repair the adapter audit manifest before using project preview evidence.',
      reasons: ['A malformed audited head cannot establish source truth.'],
    };
  }

  if (!input.currentHead) {
    return {
      ...shared,
      state: 'unknown',
      freshness: 'missing',
      recommendation: 'hold',
      sourceHeadMatchesAudited: false,
      contractPathsMissing: contractPathsRequired,
      contractPathsDrifted: [],
      blocker: 'No current repository head was observed.',
      nextAction: 'Read the authoritative repository main head and rerun the freshness check.',
      reasons: ['Project adapter freshness cannot be inferred from its own checked-in snapshot.'],
    };
  }

  if (!EXACT_GIT_OBJECT_SHA.test(input.currentHead)) {
    return {
      ...shared,
      state: 'unknown',
      freshness: 'invalid',
      recommendation: 'hold',
      sourceHeadMatchesAudited: false,
      contractPathsMissing: [],
      contractPathsDrifted: [],
      blocker: 'The observed current repository head is invalid.',
      nextAction: 'Re-read the authoritative repository head and rerun the freshness check.',
      reasons: ['Malformed current-head evidence cannot establish freshness.'],
    };
  }

  const sourceHeadMatchesAudited =
    input.currentHead.toLowerCase() === input.auditedHead.toLowerCase();
  const missing: string[] = [];
  const drifted: string[] = [];

  for (const path of contractPathsRequired) {
    const expected = input.auditedContractBlobs[path];
    const observed = input.observedContractBlobs[path];
    if (!observed) {
      missing.push(path);
      continue;
    }
    if (!EXACT_GIT_OBJECT_SHA.test(expected) || !EXACT_GIT_OBJECT_SHA.test(observed)) {
      return {
        ...shared,
        state: 'unknown',
        freshness: 'invalid',
        recommendation: 'hold',
        sourceHeadMatchesAudited,
        contractPathsMissing: [],
        contractPathsDrifted: [],
        blocker: `Contract blob evidence is invalid for ${path}.`,
        nextAction: 'Re-read the exact contract blob and repair the adapter manifest if required.',
        reasons: ['Malformed blob evidence cannot establish project-contract freshness.'],
      };
    }
    if (expected.toLowerCase() !== observed.toLowerCase()) drifted.push(path);
  }

  if (missing.length > 0) {
    return {
      ...shared,
      state: 'unknown',
      freshness: 'missing',
      recommendation: 'hold',
      sourceHeadMatchesAudited,
      contractPathsMissing: missing,
      contractPathsDrifted: [],
      blocker: `Current-head project-contract evidence is missing for: ${missing.join(', ')}.`,
      nextAction: 'Read every required contract blob from the exact current head before using the adapter.',
      reasons: ['Incomplete contract evidence cannot establish project adapter freshness.'],
    };
  }

  if (drifted.length > 0) {
    return {
      ...shared,
      state: 'attention',
      freshness: sourceHeadMatchesAudited ? 'fresh' : 'stale',
      recommendation: 'review',
      sourceHeadMatchesAudited,
      contractPathsMissing: [],
      contractPathsDrifted: drifted,
      blocker: sourceHeadMatchesAudited
        ? `Required project contract blobs drifted at the audited head: ${drifted.join(', ')}.`
        : `Repository main advanced and required project contract blobs drifted: ${drifted.join(', ')}.`,
      nextAction: 'Perform a semantic project-contract review before updating the checked-in adapter evidence.',
      reasons: [
        sourceHeadMatchesAudited
          ? 'Exact-head identity alone is insufficient when a required project contract blob differs from the audited manifest.'
          : 'Repository main advanced and at least one required project contract blob no longer matches the audited manifest.',
      ],
    };
  }

  if (!sourceHeadMatchesAudited) {
    return {
      ...shared,
      state: 'verified',
      freshness: 'fresh',
      recommendation: 'hold',
      sourceHeadMatchesAudited: false,
      contractPathsMissing: [],
      contractPathsDrifted: [],
      blocker: null,
      nextAction: 'Keep the adapter read-only and refresh the audited head only when intentionally updating the provenance snapshot.',
      reasons: ['Repository main advanced, but every required project contract blob still matches the audited adapter snapshot.'],
    };
  }

  return {
    ...shared,
    state: 'verified',
    freshness: 'fresh',
    recommendation: 'hold',
    sourceHeadMatchesAudited: true,
    contractPathsMissing: [],
    contractPathsDrifted: [],
    blocker: null,
    nextAction: 'Keep the adapter read-only and repeat this check whenever authoritative main or a required project contract changes.',
    reasons: ['Authoritative main and every required project contract blob match the checked-in audited adapter snapshot.'],
  };
}
