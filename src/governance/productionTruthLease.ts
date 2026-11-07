import { createHash } from 'node:crypto';
import {
  createTruthLease,
  evaluateTruthLeaseAtUse,
  type TruthDependencyObservation,
  type TruthLease,
  type TruthLeaseEvaluation,
  type TruthUseBoundary,
} from '../lib/truthLease.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const HASH64 = /^[0-9a-f]{64}$/i;

export interface ProductionTruthEvidence {
  repository: { sha: string };
  cloudflare: {
    workerSha: string;
    pagesSha: string;
    routesDigest: string;
  };
  supabase: {
    projectRef: string;
    migrationHead: string;
    advisorDigest: string;
  };
  playwright: {
    testedSha: string;
    runtimeSha: string;
    artifactDigest: string;
  };
  review: {
    exactHeadSha: string;
    receiptDigest: string;
  };
}

export interface ProductionTruthLeaseBundle {
  claimHash: string;
  lease: TruthLease;
  evidence: ProductionTruthEvidence;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA40.test(normalized)) {
    throw new Error(`PRODUCTION_TRUTH_INVALID: ${label} must be a 40-character commit SHA`);
  }
  return normalized;
}

function hash(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HASH64.test(normalized)) {
    throw new Error(`PRODUCTION_TRUTH_INVALID: ${label} must be sha256`);
  }
  return normalized;
}

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`PRODUCTION_TRUTH_INVALID: ${label} is required`);
  return normalized;
}

function canonicalEvidence(input: ProductionTruthEvidence): ProductionTruthEvidence {
  const repositorySha = sha(input.repository.sha, 'repository.sha');
  const workerSha = sha(input.cloudflare.workerSha, 'cloudflare.workerSha');
  const pagesSha = sha(input.cloudflare.pagesSha, 'cloudflare.pagesSha');
  const testedSha = sha(input.playwright.testedSha, 'playwright.testedSha');
  const runtimeSha = sha(input.playwright.runtimeSha, 'playwright.runtimeSha');
  const reviewSha = sha(input.review.exactHeadSha, 'review.exactHeadSha');

  if (workerSha !== repositorySha || pagesSha !== repositorySha) {
    throw new Error('PRODUCTION_TRUTH_INVALID: Cloudflare runtime identity must match repository SHA');
  }
  if (testedSha !== repositorySha || runtimeSha !== repositorySha) {
    throw new Error('PRODUCTION_TRUTH_INVALID: Playwright must prove the exact repository/runtime SHA');
  }
  if (reviewSha !== repositorySha) {
    throw new Error('PRODUCTION_TRUTH_INVALID: review receipt must bind the exact repository SHA');
  }

  return {
    repository: { sha: repositorySha },
    cloudflare: {
      workerSha,
      pagesSha,
      routesDigest: hash(input.cloudflare.routesDigest, 'cloudflare.routesDigest'),
    },
    supabase: {
      projectRef: text(input.supabase.projectRef, 'supabase.projectRef'),
      migrationHead: text(input.supabase.migrationHead, 'supabase.migrationHead'),
      advisorDigest: hash(input.supabase.advisorDigest, 'supabase.advisorDigest'),
    },
    playwright: {
      testedSha,
      runtimeSha,
      artifactDigest: hash(input.playwright.artifactDigest, 'playwright.artifactDigest'),
    },
    review: {
      exactHeadSha: reviewSha,
      receiptDigest: hash(input.review.receiptDigest, 'review.receiptDigest'),
    },
  };
}

export function createProductionTruthLease({
  evidence: rawEvidence,
  verifiedAt,
  validUntil,
  maxObservationAgeMs = 15 * 60 * 1000,
}: {
  evidence: ProductionTruthEvidence;
  verifiedAt: string;
  validUntil: string;
  maxObservationAgeMs?: number;
}): ProductionTruthLeaseBundle {
  const evidence = canonicalEvidence(rawEvidence);
  const claimHash = digest({ kind: 'fcr/production-truth@v1', evidence });
  const lease = createTruthLease({
    claimHash,
    claimClass: 'production-truth',
    verifiedAt,
    validUntil,
    dependencies: [
      {
        key: 'repository:main-head',
        authority: 'repository',
        expectedDigest: digest(evidence.repository),
        maxObservationAgeMs,
      },
      {
        key: 'cloudflare:production-runtime',
        authority: 'runtime',
        expectedDigest: digest(evidence.cloudflare),
        maxObservationAgeMs,
      },
      {
        key: 'supabase:production-state',
        authority: 'provider',
        expectedDigest: digest(evidence.supabase),
        maxObservationAgeMs,
      },
      {
        key: 'playwright:production-journey',
        authority: 'runtime',
        expectedDigest: digest(evidence.playwright),
        maxObservationAgeMs,
      },
      {
        key: 'review:exact-head-receipt',
        authority: 'human-outcome',
        expectedDigest: digest(evidence.review),
        maxObservationAgeMs,
      },
    ],
  });

  return Object.freeze({ claimHash, lease, evidence: Object.freeze(evidence) });
}

export function observeProductionTruthEvidence(
  evidence: ProductionTruthEvidence,
  observedAt: string,
): TruthDependencyObservation[] {
  const canonical = canonicalEvidence(evidence);
  return [
    { key: 'repository:main-head', authority: 'repository', digest: digest(canonical.repository), observedAt },
    { key: 'cloudflare:production-runtime', authority: 'runtime', digest: digest(canonical.cloudflare), observedAt },
    { key: 'supabase:production-state', authority: 'provider', digest: digest(canonical.supabase), observedAt },
    { key: 'playwright:production-journey', authority: 'runtime', digest: digest(canonical.playwright), observedAt },
    { key: 'review:exact-head-receipt', authority: 'human-outcome', digest: digest(canonical.review), observedAt },
  ];
}

export function evaluateProductionTruthLeaseAtUse({
  bundle,
  evidence,
  observedAt,
  useBoundary,
  now,
}: {
  bundle: ProductionTruthLeaseBundle;
  evidence: ProductionTruthEvidence;
  observedAt: string;
  useBoundary: TruthUseBoundary;
  now: string;
}): TruthLeaseEvaluation {
  return evaluateTruthLeaseAtUse({
    lease: bundle.lease,
    observations: observeProductionTruthEvidence(evidence, observedAt),
    useBoundary,
    now,
  });
}
