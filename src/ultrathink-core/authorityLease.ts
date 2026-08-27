export type AuthorityConsequence =
  | 'observe'
  | 'suggest'
  | 'draft'
  | 'execute'
  | 'publish'
  | 'merge'
  | 'deploy';

export type AuthorityInvalidationReason =
  | 'revoked'
  | 'expired'
  | 'missing_evidence'
  | 'repository_drift'
  | 'base_drift'
  | 'head_drift'
  | 'diff_drift'
  | 'policy_drift'
  | 'actor_drift';

export interface AuthorityBinding {
  repository?: string;
  baseSha?: string;
  headSha?: string;
  diffHash?: string;
  policyHash?: string;
  actor?: string;
}

export interface AuthorityLease {
  id: string;
  subject: string;
  consequence: AuthorityConsequence;
  evidenceIds: readonly string[];
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  binding: AuthorityBinding;
}

export interface AuthorityWorldState extends AuthorityBinding {
  now?: string | Date;
}

export interface AuthorityLeaseEvaluation {
  valid: boolean;
  reasons: readonly AuthorityInvalidationReason[];
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sameBoundValue(
  expected: string | undefined,
  actual: string | undefined,
): boolean {
  const bound = normalized(expected);
  if (!bound) return true;
  return normalized(actual) === bound;
}

function parsedTime(value: string | Date | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value);
  return Date.now();
}

/**
 * Evaluate whether an authority lease is still valid for the supplied world state.
 *
 * A lease is intentionally fail-closed: evidence must exist, revocation/expiry wins,
 * and every bound identity must still match the world state exactly.
 */
export function evaluateAuthorityLease(
  lease: AuthorityLease,
  world: AuthorityWorldState,
): AuthorityLeaseEvaluation {
  const reasons: AuthorityInvalidationReason[] = [];
  const now = parsedTime(world.now);

  if (lease.evidenceIds.length === 0) reasons.push('missing_evidence');

  if (normalized(lease.revokedAt)) reasons.push('revoked');

  if (lease.expiresAt) {
    const expiry = Date.parse(lease.expiresAt);
    if (!Number.isFinite(expiry) || !Number.isFinite(now) || expiry <= now) {
      reasons.push('expired');
    }
  }

  if (!sameBoundValue(lease.binding.repository, world.repository)) {
    reasons.push('repository_drift');
  }
  if (!sameBoundValue(lease.binding.baseSha, world.baseSha)) {
    reasons.push('base_drift');
  }
  if (!sameBoundValue(lease.binding.headSha, world.headSha)) {
    reasons.push('head_drift');
  }
  if (!sameBoundValue(lease.binding.diffHash, world.diffHash)) {
    reasons.push('diff_drift');
  }
  if (!sameBoundValue(lease.binding.policyHash, world.policyHash)) {
    reasons.push('policy_drift');
  }
  if (!sameBoundValue(lease.binding.actor, world.actor)) {
    reasons.push('actor_drift');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}
