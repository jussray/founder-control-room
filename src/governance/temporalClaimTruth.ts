import { createHash } from 'node:crypto';

export const TEMPORAL_CLAIM_TRUTH_CONTRACT = 'fcr/temporal-public-claim-truth@v1' as const;

export const TEMPORAL_CLAIM_CLASSES = [
  'historical_version',
  'current_repo_state',
  'current_runtime',
  'metric',
] as const;

export type TemporalClaimClass = (typeof TEMPORAL_CLAIM_CLASSES)[number];

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
  text: string;
  evidenceRef: string;
  evidenceScope: string;
  temporalClass: TemporalClaimClass;
  temporalVersion: string | null;
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

export interface TemporalClaimTextDomainInput {
  label: string;
  text: string;
  temporalClass: TemporalClaimClass;
}

const HASH = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const CURRENT_LANGUAGE = /\b(currently|right now|is live|are live|is green|are green|remains|still (?:is|are|has|have)|now (?:is|are|has|have))\b/i;
const CURRENT_STATE_GRAMMAR = /\b(?:is|are|has|have|does|supports|works|exists|runs|uses|includes|provides|allows|can|will)\b/i;
const HISTORICAL_LANGUAGE = /\b(built|shipped|implemented|added|merged|completed|released|tested|verified|fixed|created|introduced|deployed|reached|grew|was|were|did)\b/i;
const CURRENT_RUNTIME_TOKEN = /\b(?:production|runtime|site|app|api|service|endpoint|deployment|live|healthy|up|reachable|serving|available)\b/gi;
const CURRENT_RUNTIME_SUBJECTS = new Set(['production', 'runtime', 'site', 'app', 'api', 'service', 'endpoint', 'deployment']);
const CURRENT_RUNTIME_STATES = new Set(['live', 'healthy', 'up', 'reachable', 'serving', 'available']);
const CURRENT_RUNTIME_MAX_GAP = 80;
const METRIC_LANGUAGE = /(?:\b\d[\d,.]*\s*(?:followers?|impressions?|users?|downloads?|signups?|customers?|sales|engagements?|views?|reactions?|comments?|shares?|clicks?|likes?|members?\s+reached|people\s+reached)\b)|(?:\breached\s+\d[\d,.]*\s+(?:members?|people)\b)|(?:\b(?:revenue|mrr|arr|gmv|conversion|engagement rate)\b.{0,30}(?:\$\s?\d|\d[\d,.]*|\d+(?:\.\d+)?%))|(?:\d+(?:\.\d+)?%)/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isTemporalClaimClass(value: unknown): value is TemporalClaimClass {
  return typeof value === 'string' && TEMPORAL_CLAIM_CLASSES.includes(value as TemporalClaimClass);
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function runtimeGapWithinBound(value: string, from: number, to: number): boolean {
  if (to < from || to - from > CURRENT_RUNTIME_MAX_GAP) return false;
  for (let index = from; index < to; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

function hasCurrentRuntimeLanguage(value: string): boolean {
  let lastSubjectEnd: number | null = null;
  let lastStateEnd: number | null = null;

  for (const match of value.matchAll(CURRENT_RUNTIME_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const token = match[0].toLowerCase();

    if (CURRENT_RUNTIME_SUBJECTS.has(token)) {
      if (lastStateEnd !== null && runtimeGapWithinBound(value, lastStateEnd, start)) return true;
      lastSubjectEnd = end;
      continue;
    }

    if (CURRENT_RUNTIME_STATES.has(token)) {
      if (lastSubjectEnd !== null && runtimeGapWithinBound(value, lastSubjectEnd, start)) return true;
      lastStateEnd = end;
    }
  }

  return false;
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

export function buildTemporalClaimTruthContextFromCanonical(input: {
  proposalHash: string;
  publicPayloadHash: string;
  claims: CanonicalPublicClaim[];
}): TemporalClaimTruthContext {
  return canonicalTemporalClaimTruthContext({
    contract: TEMPORAL_CLAIM_TRUTH_CONTRACT,
    proposalHash: input.proposalHash,
    publicPayloadHash: input.publicPayloadHash,
    claims: input.claims.map((claim) => ({
      claimId: claim.claimId,
      claimClass: claim.temporalClass,
      evidenceRef: claim.evidenceRef,
      evidenceScope: claim.evidenceScope,
      exactVersion: claim.temporalVersion,
    })),
  });
}

export function temporalClaimTextDomainErrors(input: TemporalClaimTextDomainInput): string[] {
  const errors: string[] = [];
  const candidate = text(input.text);
  const label = text(input.label) || 'claim';

  if (input.temporalClass === 'historical_version') {
    if (CURRENT_LANGUAGE.test(candidate) || CURRENT_STATE_GRAMMAR.test(candidate)) {
      errors.push(`${label} uses current-state language`);
    }
    if (!HISTORICAL_LANGUAGE.test(candidate)) {
      errors.push(`${label} must use explicit historical framing`);
    }
  }

  if (input.temporalClass === 'current_repo_state' && hasCurrentRuntimeLanguage(candidate)) {
    errors.push(`${label} uses runtime-state language and requires current_runtime evidence`);
  }

  if (input.temporalClass !== 'metric' && METRIC_LANGUAGE.test(candidate)) {
    errors.push(`metric language in ${label} requires metric evidence; non-metric evidence cannot establish analytics truth`);
  }

  return errors;
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

function semanticDomainErrors(claim: CanonicalPublicClaim): string[] {
  return temporalClaimTextDomainErrors({
    label: `claim ${claim.claimId}`,
    text: claim.text,
    temporalClass: claim.temporalClass,
  });
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
    errors.push('temporal truth confirmation hash does not bind the exact canonical claim classification');
  }
  if (!OWNED_REPO.test(sourceRepo) || !FULL_SHA.test(sourceSha)) errors.push('temporal truth source repo/version is invalid');
  if (context.claims.length !== input.canonicalClaims.length || context.claims.length === 0) {
    errors.push('every public claim requires exactly one canonical temporal classification');
  }

  const canonicalById = new Map(input.canonicalClaims.map((claim) => [text(claim.claimId).toLowerCase(), claim]));
  const seen = new Set<string>();
  for (const claim of context.claims) {
    const canonical = canonicalById.get(claim.claimId);
    if (!isTemporalClaimClass(claim.claimClass)) errors.push(`temporal claim ${claim.claimId || '<missing>'} class is invalid`);
    if (!canonical) errors.push(`temporal claim ${claim.claimId || '<missing>'} is not in the approved public payload`);
    if (seen.has(claim.claimId)) errors.push(`temporal claim ${claim.claimId} is duplicated`);
    seen.add(claim.claimId);
    if (canonical) {
      if (claim.claimClass !== canonical.temporalClass) errors.push(`temporal claim ${claim.claimId} class changed after proposal approval`);
      if ((claim.exactVersion ?? null) !== (canonical.temporalVersion ?? null)) errors.push(`temporal claim ${claim.claimId} version changed after proposal approval`);
      if (text(canonical.evidenceRef) !== claim.evidenceRef) errors.push(`temporal claim ${claim.claimId} evidence ref changed`);
      if (text(canonical.evidenceScope) !== claim.evidenceScope) errors.push(`temporal claim ${claim.claimId} evidence scope changed`);
      errors.push(...semanticDomainErrors(canonical));
    }
    if ((claim.claimClass === 'historical_version' || claim.claimClass === 'current_repo_state') && claim.exactVersion !== sourceSha) {
      errors.push(`temporal claim ${claim.claimId} must bind the exact source commit`);
    }
    if ((claim.claimClass === 'current_runtime' || claim.claimClass === 'metric') && claim.exactVersion !== null) {
      errors.push(`temporal claim ${claim.claimId} may not bind repository version for ${claim.claimClass}`);
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
