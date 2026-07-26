import type { CapabilityContract } from './score.js';

export interface ExternalProof {
  id: string;
  status: 'verified' | 'stale' | 'missing' | 'failed';
  source: string;
  commit_sha: string;
  scope: string[];
  verified_at: string;
}

export interface ExternalCapabilityContract extends CapabilityContract {
  schema_version: string;
  repository: string;
  blockers: string[];
  health: { overall: string };
  proof: ExternalProof[];
}

export interface AuthenticatedSource {
  repository: string;
  commitSha: string;
  fetchedAt: Date;
  maxEvidenceAgeMs: number;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const IMMUTABLE_SOURCE = /\/(?:actions\/runs\/\d+|commit\/[0-9a-f]{40}|deployments\/\d+|artifacts\/\d+)(?:$|[/?#])/;

export function validateExternalContract(
  contract: ExternalCapabilityContract,
  source: AuthenticatedSource,
): string[] {
  const errors: string[] = [];

  if (contract.schema_version !== '1.0') errors.push('unsupported schema version');
  if (contract.repository !== source.repository) errors.push('repository identity mismatch');
  if (contract.blockers.length > 0 && contract.health.overall === 'green') {
    errors.push('overall health cannot be green while blockers exist');
  }

  const proofs = new Map(contract.proof.map((proof) => [proof.id, proof]));
  for (const proof of contract.proof) {
    if (proof.status !== 'verified') continue;
    if (!FULL_SHA.test(proof.commit_sha)) errors.push(`proof ${proof.id} has invalid commit SHA`);
    if (proof.commit_sha !== source.commitSha) errors.push(`proof ${proof.id} is not bound to exact head`);
    if (!IMMUTABLE_SOURCE.test(proof.source)) errors.push(`proof ${proof.id} source is mutable`);
    if (!Array.isArray(proof.scope) || proof.scope.length === 0) errors.push(`proof ${proof.id} has empty scope`);

    const verifiedAt = new Date(proof.verified_at);
    if (Number.isNaN(verifiedAt.getTime())) {
      errors.push(`proof ${proof.id} has invalid verified_at`);
    } else if (source.fetchedAt.getTime() - verifiedAt.getTime() > source.maxEvidenceAgeMs) {
      errors.push(`proof ${proof.id} is stale`);
    }
  }

  for (const capability of contract.capabilities) {
    const refs = capability.evidence_ids ?? [];
    if ((capability.status === 'verified' || capability.status === 'partial') && refs.length === 0) {
      errors.push(`${capability.id} has ${capability.status} status without evidence`);
    }
    for (const ref of refs) {
      const proof = proofs.get(ref);
      if (!proof) {
        errors.push(`${capability.id} references unknown proof ${ref}`);
        continue;
      }
      if (proof.status !== 'verified') errors.push(`${capability.id} references non-verified proof ${ref}`);
      if (!proof.scope.includes(capability.id)) errors.push(`${capability.id} is outside proof ${ref} scope`);
    }
  }

  return errors;
}
