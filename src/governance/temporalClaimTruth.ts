import { createHash } from 'node:crypto';

export const TEMPORAL_CLAIM_TRUTH_CONTRACT = 'fcr/temporal-public-claim-truth@v1' as const;

export type TemporalClaimClass =
  | 'historical_version'
  | 'current_repo_state'
  | 'current_runtime'
  | 'metric';

export type TemporalClaimState =
  | 'HISTORICAL_VERIFIED'
  | 'CURRENT_VERIFIED'
  | 'SUPERSEDED'
  | 'REVALIDATION_REQUIRED'
  | 'INVALID';

export interface TemporalClaimDeclaration {
  claimId: string;
  claimClass: TemporalClaimClass;
  evidenceRef: string;
  evidenceScope: string;
  exactVersion?: string | null;
}

export interface TemporalClaimTruthContext {
  contract: typeof TEMPORAL_CLAIM_TRUTH_CONTRACT;
  proposalHash: string;
  publicPayloadHash: string;
  claims: TemporalClaimDeclaration[];
}

export interface CanonicalPublicClaim {
  claimId: string;
  evidenceRef: string;
  evidenceScope: string;
}

export interface TemporalClaimTruthReceiptItem {
  claimId: string;
  claimClass: TemporalClaimClass;
  state: TemporalClaimState;
  publishSafe: boolean;
  exactVersion: string | null;
  currentVersion: string | null;
  worldValidAt: string | null;
  recordedAt: string;
  displayLabel: string;
}

export interface TemporalClaimTruthReceipt {
  contract: typeof TEMPORAL_CLAIM_TRUTH_CONTRACT;
  truthContextHash: string;
  proposalHash: string;
  publicPayloadHash: string;
  checkedAt: string;
  publishSafe: boolean;
  historicalCount: number;
  currentCount: number;
  supersededCount: number;
  blockedCount: number;
  claims: TemporalClaimTruthReceiptItem[];
}

export interface RepositoryTruthResolver {
  currentVersion(sourceRepo: string): Promise<string>;
}

const HASH = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalDeclaration(input: TemporalClaimDeclaration): TemporalClaimDeclaration {
  return {
    claimId: text(input.claimId).toLowerCase(),
    claimClass: input.claimClass,
    evidenceRef: text(input.evidenceRef),
    evidenceScope: text(input.evidenceScope),
    exactVersion: text(input.exactVersion).toLowerCase() || null,
  };
}

export function canonicalTemporalClaimTruthContext(
  input: TemporalClaimTruthContext,
): TemporalClaimTruthContext {
  return {
    contract: TEMPORAL_CLAIM_TRUTH_CONTRACT,
    proposalHash: text(input.proposalHash).toLowerCase(),
    publicPayloadHash: text(input.publicPayloadHash).toLowerCase(),
    claims: (input.claims ?? []).map(canonicalDeclaration),
  };
}

export function temporalClaimTruthContextHash(input: TemporalClaimTruthContext): string {
  return stableHash(canonicalTemporalClaimTruthContext(input));
}

function invalidReceipt(
  context: TemporalClaimTruthContext,
  checkedAt: string,
  reason: string,
): TemporalClaimTruthReceipt {
  return {
    contract: TEMPORAL_CLAIM_TRUTH_CONTRACT,
    truthContextHash: temporalClaimTruthContextHash(context),
    proposalHash: text(context.proposalHash).toLowerCase(),
    publicPayloadHash: text(context.publicPayloadHash).toLowerCase(),
    checkedAt,
    publishSafe: false,
    historicalCount: 0,
    currentCount: 0,
    supersededCount: 0,
    blockedCount: 1,
    claims: [{
      claimId: 'contract',
      claimClass: 'current_runtime',
      state: 'INVALID',
      publishSafe: false,
      exactVersion: null,
      currentVersion: null,
      worldValidAt: null,
      recordedAt: checkedAt,
      displayLabel: reason,
    }],
  };
}

export async function revalidateTemporalPublicClaims(input: {
  context: TemporalClaimTruthContext;
  canonicalClaims: CanonicalPublicClaim[];
  sourceRepo: string;
  sourceCommitSha: string;
  expectedProposalHash: string;
  expectedPublicPayloadHash: string;
  confirmationTruthContextHash: string;
  resolver: RepositoryTruthResolver;
  now?: Date;
}): Promise<TemporalClaimTruthReceipt> {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const context = canonicalTemporalClaimTruthContext(input.context);
  const expectedTruthHash = temporalClaimTruthContextHash(context);
  const sourceRepo = text(input.sourceRepo);
  const sourceSha = text(input.sourceCommitSha).toLowerCase();
  const errors: string[] = [];

  if (context.contract !== TEMPORAL_CLAIM_TRUTH_CONTRACT) errors.push('temporal truth contract is invalid');
  if (!HASH.test(context.proposalHash) || context.proposalHash !== text(input.expectedProposalHash).toLowerCase()) {
    errors.push('temporal truth proposal hash does not match the exact approved proposal');
  }
  if (!HASH.test(context.publicPayloadHash) || context.publicPayloadHash !== text(input.expectedPublicPayloadHash).toLowerCase()) {
    errors.push('temporal truth public payload hash does not match the exact approved copy');
  }
  if (!HASH.test(text(input.confirmationTruthContextHash)) || text(input.confirmationTruthContextHash).toLowerCase() !== expectedTruthHash) {
    errors.push('temporal truth confirmation hash does not bind the exact claim classification');
  }
  if (!OWNED_REPO.test(sourceRepo) || !FULL_SHA.test(sourceSha)) errors.push('temporal truth source repo/version is invalid');
  if (context.claims.length !== input.canonicalClaims.length || context.claims.length === 0) {
    errors.push('every public claim requires exactly one temporal classification');
  }

  const canonicalById = new Map(input.canonicalClaims.map((claim) => [text(claim.claimId).toLowerCase(), claim]));
  const seen = new Set<string>();
  for (const claim of context.claims) {
    const canonical = canonicalById.get(claim.claimId);
    if (!canonical) errors.push(`temporal claim ${claim.claimId || '<missing>'} is not in the approved public payload`);
    if (seen.has(claim.claimId)) errors.push(`temporal claim ${claim.claimId} is duplicated`);
    seen.add(claim.claimId);
    if (canonical) {
      if (text(canonical.evidenceRef) !== claim.evidenceRef) errors.push(`temporal claim ${claim.claimId} evidence ref changed`);
      if (text(canonical.evidenceScope) !== claim.evidenceScope) errors.push(`temporal claim ${claim.claimId} evidence scope changed`);
    }
    if ((claim.claimClass === 'historical_version' || claim.claimClass === 'current_repo_state') && claim.exactVersion !== sourceSha) {
      errors.push(`temporal claim ${claim.claimId} must bind the exact source commit`);
    }
  }

  if (errors.length > 0) return invalidReceipt(context, checkedAt, errors.join('; '));

  let currentVersion: string | null = null;
  if (context.claims.some((claim) => claim.claimClass === 'current_repo_state')) {
    try {
      currentVersion = text(await input.resolver.currentVersion(sourceRepo)).toLowerCase();
      if (!FULL_SHA.test(currentVersion)) currentVersion = null;
    } catch {
      currentVersion = null;
    }
  }

  const claims = context.claims.map<TemporalClaimTruthReceiptItem>((claim) => {
    if (claim.claimClass === 'historical_version') {
      return {
        claimId: claim.claimId,
        claimClass: claim.claimClass,
        state: 'HISTORICAL_VERIFIED',
        publishSafe: true,
        exactVersion: claim.exactVersion ?? null,
        currentVersion,
        worldValidAt: null,
        recordedAt: checkedAt,
        displayLabel: `Historical · verified at ${String(claim.exactVersion).slice(0, 7)}`,
      };
    }
    if (claim.claimClass === 'current_repo_state') {
      const matches = Boolean(currentVersion && claim.exactVersion === currentVersion);
      return {
        claimId: claim.claimId,
        claimClass: claim.claimClass,
        state: matches ? 'CURRENT_VERIFIED' : 'SUPERSEDED',
        publishSafe: matches,
        exactVersion: claim.exactVersion ?? null,
        currentVersion,
        worldValidAt: matches ? checkedAt : null,
        recordedAt: checkedAt,
        displayLabel: matches
          ? `Current · verified as of ${checkedAt}`
          : `Superseded · current version is ${currentVersion?.slice(0, 7) ?? 'unknown'}`,
      };
    }
    return {
      claimId: claim.claimId,
      claimClass: claim.claimClass,
      state: 'REVALIDATION_REQUIRED',
      publishSafe: false,
      exactVersion: claim.exactVersion ?? null,
      currentVersion,
      worldValidAt: null,
      recordedAt: checkedAt,
      displayLabel: claim.claimClass === 'metric'
        ? 'Metric · fresh analytics read required'
        : 'Current runtime · live provider read required',
    };
  });

  return {
    contract: TEMPORAL_CLAIM_TRUTH_CONTRACT,
    truthContextHash: expectedTruthHash,
    proposalHash: context.proposalHash,
    publicPayloadHash: context.publicPayloadHash,
    checkedAt,
    publishSafe: claims.every((claim) => claim.publishSafe),
    historicalCount: claims.filter((claim) => claim.state === 'HISTORICAL_VERIFIED').length,
    currentCount: claims.filter((claim) => claim.state === 'CURRENT_VERIFIED').length,
    supersededCount: claims.filter((claim) => claim.state === 'SUPERSEDED').length,
    blockedCount: claims.filter((claim) => !claim.publishSafe).length,
    claims,
  };
}

export function temporalTruthAnalytics(receipt: TemporalClaimTruthReceipt) {
  return {
    checkedAt: receipt.checkedAt,
    claimCount: receipt.claims.length,
    historicalCount: receipt.historicalCount,
    currentCount: receipt.currentCount,
    supersededCount: receipt.supersededCount,
    blockedCount: receipt.blockedCount,
    publishSafe: receipt.publishSafe,
    staleTruthPrevented: receipt.supersededCount > 0,
  };
}
