import { createHash } from 'node:crypto';

export const TRUTH_LEASE_CONTRACT = 'fcr/truth-lease@v1' as const;

const HASH = /^[0-9a-f]{64}$/i;
const MAX_LEASE_TTL_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type TruthDependencyAuthority = 'repository' | 'provider' | 'runtime' | 'human-outcome';
export type TruthUseBoundary = 'merge' | 'deploy' | 'schedule' | 'publish' | 'completion-claim';
export type TruthLeaseState = 'current' | 'stale' | 'invalidated' | 'unknown';

export interface TruthDependencyExpectation {
  key: string;
  authority: TruthDependencyAuthority;
  expectedDigest: string;
  maxObservationAgeMs: number;
}

export interface TruthLease {
  version: 1;
  kind: typeof TRUTH_LEASE_CONTRACT;
  claimHash: string;
  claimClass: string;
  verifiedAt: string;
  validUntil: string;
  dependencies: TruthDependencyExpectation[];
  leaseHash: string;
}

export interface TruthDependencyObservation {
  key: string;
  authority: TruthDependencyAuthority;
  digest: string;
  observedAt: string;
}

export interface TruthLeaseEvaluation {
  state: TruthLeaseState;
  mayUseClaim: boolean;
  useBoundary: TruthUseBoundary;
  observedAt: string;
  reasons: string[];
  dependencyCount: number;
  staleDependencyCount: number;
  invalidatedDependencyCount: number;
  unknownDependencyCount: number;
}

export interface TruthLeaseTelemetry {
  event: 'fcr:truth-lease-evaluated';
  claimClass: string;
  state: TruthLeaseState;
  useBoundary: TruthUseBoundary;
  dependencyCount: number;
  staleDependencyCount: number;
  invalidatedDependencyCount: number;
  unknownDependencyCount: number;
  mayUseClaim: boolean;
}

export interface TruthLeaseViewModel {
  state: TruthLeaseState;
  label: 'Current proof' | 'Re-check required' | 'Truth changed' | 'Proof missing';
  nextGate: 'use-claim' | 'revalidate-proof' | 'rebuild-claim' | 'collect-proof';
  mayUseClaim: boolean;
}

interface CreateTruthLeaseInput {
  claimHash: string;
  claimClass: string;
  verifiedAt: string;
  validUntil: string;
  dependencies: TruthDependencyExpectation[];
}

function text(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`TRUTH_LEASE_INVALID: ${label} must be RFC3339`);
  return parsed;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalLeaseIdentity(input: Omit<TruthLease, 'leaseHash'>): Omit<TruthLease, 'leaseHash'> {
  return {
    version: 1,
    kind: TRUTH_LEASE_CONTRACT,
    claimHash: input.claimHash.toLowerCase(),
    claimClass: input.claimClass,
    verifiedAt: input.verifiedAt,
    validUntil: input.validUntil,
    dependencies: input.dependencies.map((dependency) => ({
      key: dependency.key,
      authority: dependency.authority,
      expectedDigest: dependency.expectedDigest.toLowerCase(),
      maxObservationAgeMs: dependency.maxObservationAgeMs,
    })),
  };
}

export function hashTruthClaim(publicClaim: string): string {
  const claim = text(publicClaim, 5000);
  if (!claim) throw new Error('TRUTH_LEASE_INVALID: public claim is required');
  return stableHash({ kind: 'fcr/public-claim@v1', claim });
}

export function createTruthLease(input: CreateTruthLeaseInput): TruthLease {
  const claimHash = text(input.claimHash, 64).toLowerCase();
  const claimClass = text(input.claimClass, 120).toLowerCase();
  const verifiedAtMs = parseTime(input.verifiedAt, 'verifiedAt');
  const validUntilMs = parseTime(input.validUntil, 'validUntil');

  if (!HASH.test(claimHash)) throw new Error('TRUTH_LEASE_INVALID: claimHash must be sha256');
  if (!claimClass) throw new Error('TRUTH_LEASE_INVALID: claimClass is required');
  if (validUntilMs <= verifiedAtMs) throw new Error('TRUTH_LEASE_INVALID: validUntil must follow verifiedAt');
  if (validUntilMs - verifiedAtMs > MAX_LEASE_TTL_MS) {
    throw new Error('TRUTH_LEASE_INVALID: lease lifetime may not exceed 60 minutes');
  }
  if (!Array.isArray(input.dependencies) || input.dependencies.length === 0) {
    throw new Error('TRUTH_LEASE_INVALID: at least one authoritative dependency is required');
  }

  const seen = new Set<string>();
  const dependencies = input.dependencies.map((dependency) => {
    const key = text(dependency.key, 160).toLowerCase();
    const expectedDigest = text(dependency.expectedDigest, 64).toLowerCase();
    const maxObservationAgeMs = dependency.maxObservationAgeMs;

    if (!key) throw new Error('TRUTH_LEASE_INVALID: dependency key is required');
    if (seen.has(key)) throw new Error(`TRUTH_LEASE_INVALID: duplicate dependency ${key}`);
    seen.add(key);
    if (!['repository', 'provider', 'runtime', 'human-outcome'].includes(dependency.authority)) {
      throw new Error(`TRUTH_LEASE_INVALID: dependency ${key} authority is invalid`);
    }
    if (!HASH.test(expectedDigest)) {
      throw new Error(`TRUTH_LEASE_INVALID: dependency ${key} expectedDigest must be sha256`);
    }
    if (!Number.isInteger(maxObservationAgeMs) || maxObservationAgeMs <= 0 || maxObservationAgeMs > MAX_LEASE_TTL_MS) {
      throw new Error(`TRUTH_LEASE_INVALID: dependency ${key} maxObservationAgeMs is invalid`);
    }

    return Object.freeze({
      key,
      authority: dependency.authority,
      expectedDigest,
      maxObservationAgeMs,
    });
  });

  const identity = canonicalLeaseIdentity({
    version: 1,
    kind: TRUTH_LEASE_CONTRACT,
    claimHash,
    claimClass,
    verifiedAt: new Date(verifiedAtMs).toISOString(),
    validUntil: new Date(validUntilMs).toISOString(),
    dependencies,
  });

  return Object.freeze({
    ...identity,
    dependencies: Object.freeze([...dependencies]) as unknown as TruthDependencyExpectation[],
    leaseHash: stableHash(identity),
  });
}

export function evaluateTruthLeaseAtUse({
  lease,
  observations,
  useBoundary,
  now,
}: {
  lease: TruthLease;
  observations: TruthDependencyObservation[];
  useBoundary: TruthUseBoundary;
  now: string;
}): TruthLeaseEvaluation {
  const nowMs = parseTime(now, 'now');
  const reasons: string[] = [];
  let staleDependencyCount = 0;
  let invalidatedDependencyCount = 0;
  let unknownDependencyCount = 0;

  if (lease.version !== 1 || lease.kind !== TRUTH_LEASE_CONTRACT) {
    return {
      state: 'invalidated',
      mayUseClaim: false,
      useBoundary,
      observedAt: new Date(nowMs).toISOString(),
      reasons: ['truth lease contract identity is invalid'],
      dependencyCount: Array.isArray(lease.dependencies) ? lease.dependencies.length : 0,
      staleDependencyCount,
      invalidatedDependencyCount: 1,
      unknownDependencyCount,
    };
  }

  const expectedLeaseHash = stableHash(canonicalLeaseIdentity(lease));
  if (!HASH.test(lease.leaseHash) || expectedLeaseHash !== lease.leaseHash.toLowerCase()) {
    return {
      state: 'invalidated',
      mayUseClaim: false,
      useBoundary,
      observedAt: new Date(nowMs).toISOString(),
      reasons: ['truth lease identity has been mutated'],
      dependencyCount: lease.dependencies.length,
      staleDependencyCount,
      invalidatedDependencyCount: 1,
      unknownDependencyCount,
    };
  }

  const verifiedAtMs = parseTime(lease.verifiedAt, 'lease.verifiedAt');
  const validUntilMs = parseTime(lease.validUntil, 'lease.validUntil');
  if (nowMs < verifiedAtMs - MAX_CLOCK_SKEW_MS) {
    unknownDependencyCount += lease.dependencies.length;
    reasons.push('truth lease verification is future-dated');
  }
  if (nowMs >= validUntilMs) reasons.push('truth lease expired before use');

  const observationsByKey = new Map<string, TruthDependencyObservation[]>();
  for (const observation of Array.isArray(observations) ? observations : []) {
    const key = text(observation?.key, 160).toLowerCase();
    if (!key) continue;
    const existing = observationsByKey.get(key) ?? [];
    existing.push(observation);
    observationsByKey.set(key, existing);
  }

  for (const dependency of lease.dependencies) {
    const matches = observationsByKey.get(dependency.key) ?? [];
    if (matches.length === 0) {
      unknownDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} has no at-use observation`);
      continue;
    }
    if (matches.length !== 1) {
      unknownDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} has ambiguous duplicate at-use observations`);
      continue;
    }

    const observation = matches[0];
    const digest = text(observation.digest, 64).toLowerCase();
    if (observation.authority !== dependency.authority) {
      invalidatedDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} authority changed`);
      continue;
    }
    if (!HASH.test(digest)) {
      unknownDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} observation digest is invalid`);
      continue;
    }
    if (digest !== dependency.expectedDigest) {
      invalidatedDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} no longer matches verified truth`);
      continue;
    }

    const observedAtRaw = text(observation.observedAt, 64);
    const observedAtMs = Date.parse(observedAtRaw);
    if (!observedAtRaw || Number.isNaN(observedAtMs)) {
      unknownDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} observation time is invalid`);
      continue;
    }
    if (observedAtMs > nowMs + MAX_CLOCK_SKEW_MS) {
      unknownDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} observation is future-dated`);
      continue;
    }
    if (observedAtMs < verifiedAtMs) {
      staleDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} was not re-observed after the lease verification point`);
      continue;
    }
    if (nowMs - observedAtMs > dependency.maxObservationAgeMs) {
      staleDependencyCount += 1;
      reasons.push(`dependency ${dependency.key} observation is stale at use time`);
    }
  }

  let state: TruthLeaseState = 'current';
  if (invalidatedDependencyCount > 0) state = 'invalidated';
  else if (unknownDependencyCount > 0) state = 'unknown';
  else if (nowMs >= validUntilMs || staleDependencyCount > 0) state = 'stale';

  return {
    state,
    mayUseClaim: state === 'current',
    useBoundary,
    observedAt: new Date(nowMs).toISOString(),
    reasons: [...new Set(reasons)],
    dependencyCount: lease.dependencies.length,
    staleDependencyCount,
    invalidatedDependencyCount,
    unknownDependencyCount,
  };
}

export function buildTruthLeaseTelemetry(evaluation: TruthLeaseEvaluation, claimClass: string): TruthLeaseTelemetry {
  return Object.freeze({
    event: 'fcr:truth-lease-evaluated',
    claimClass: text(claimClass, 120).toLowerCase() || 'unknown',
    state: evaluation.state,
    useBoundary: evaluation.useBoundary,
    dependencyCount: evaluation.dependencyCount,
    staleDependencyCount: evaluation.staleDependencyCount,
    invalidatedDependencyCount: evaluation.invalidatedDependencyCount,
    unknownDependencyCount: evaluation.unknownDependencyCount,
    mayUseClaim: evaluation.mayUseClaim,
  });
}

export function toTruthLeaseViewModel(evaluation: TruthLeaseEvaluation): TruthLeaseViewModel {
  if (evaluation.state === 'current') {
    return { state: 'current', label: 'Current proof', nextGate: 'use-claim', mayUseClaim: true };
  }
  if (evaluation.state === 'stale') {
    return { state: 'stale', label: 'Re-check required', nextGate: 'revalidate-proof', mayUseClaim: false };
  }
  if (evaluation.state === 'invalidated') {
    return { state: 'invalidated', label: 'Truth changed', nextGate: 'rebuild-claim', mayUseClaim: false };
  }
  return { state: 'unknown', label: 'Proof missing', nextGate: 'collect-proof', mayUseClaim: false };
}
