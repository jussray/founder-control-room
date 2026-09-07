import { createHash } from 'node:crypto';

import type { RepositoryProvider } from '../providers/RepositoryProvider.js';
import {
  providerForProject,
  type ProviderProjectConfig,
} from '../providers/providerFactory.js';
import {
  evaluateGovernedExecutionOutcome,
  type GovernedExecutionDecision,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
  type GovernedExecutionWitness,
} from '../ultrathink-core/governedExecution.js';
import {
  runGovernedReadOnlyAttempt,
  runtimeIdentityForLease,
  type BrokerWorld,
  type GovernedAttemptProposal,
  type GovernedAttemptState,
} from './governedAttemptLoop.js';

export const REPOSITORY_READ_TOOL = 'repository.readFile' as const;
export const REPOSITORY_READ_CAPABILITY = 'repository.content.read' as const;
const MAX_CONTENT_BYTES = 256 * 1024;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type RepositoryReadBrokerWorld = Omit<BrokerWorld, 'authorityWorld' | 'subject'> & {
  authorityWorld: Omit<BrokerWorld['authorityWorld'], 'repository' | 'headSha'>;
};

export interface GovernedRepositoryReadInput {
  lease: GovernedExecutionLease | null | undefined;
  world: RepositoryReadBrokerWorld;
  proposal: GovernedAttemptProposal;
  repository: string;
  projectId: string;
  ref: string;
  path: string;
}

export interface VerifiedRepositoryReadOutput {
  repository: string;
  projectId: string;
  ref: string;
  commitSha: string;
  path: string;
  contentSha256: string;
  content: string;
}

export interface GovernedRepositoryReadResult {
  state: GovernedAttemptState;
  decision: GovernedExecutionDecision;
  receipt?: GovernedExecutionReceipt;
  witness?: GovernedExecutionWitness;
  output?: VerifiedRepositoryReadOutput;
  reason?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalize(value: string): string {
  return value.trim();
}

function safePath(value: string): string | null {
  const path = normalize(value);
  if (!path || path.startsWith('/') || path.includes('\\')) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return path;
}

export function repositoryReadSubjectLocator(repository: string, ref: string, path: string): string {
  return `repository://${normalize(repository)}/${encodeURIComponent(normalize(ref))}/${safePath(path) ?? ''}`;
}

export function repositoryReadSubjectFingerprint(repository: string, ref: string, path: string): string {
  return sha256(JSON.stringify({
    kind: 'fcr.repository-read-subject.v1',
    repository: normalize(repository).toLowerCase(),
    ref: normalize(ref),
    path: safePath(path) ?? '',
  }));
}

function externalRefs(
  repository: string,
  ref: string,
  commitSha: string,
  path: string,
  contentSha256: string,
): readonly string[] {
  return [
    `repository:${repository}`,
    `ref:${ref}`,
    `commit:${commitSha}`,
    `path:${path}`,
    `content-sha256:${contentSha256}`,
  ];
}

function witnessFingerprint(
  repository: string,
  ref: string,
  commitSha: string,
  path: string,
  contentSha256: string,
  receipt: GovernedExecutionReceipt,
): string {
  return sha256(JSON.stringify({
    kind: 'fcr.repository-provider-readback.v1',
    repository,
    ref,
    commitSha,
    path,
    contentSha256,
    receipt: {
      leaseId: receipt.leaseId,
      idempotencyKey: receipt.idempotencyKey,
      status: receipt.status,
      runtimeIdentity: receipt.runtimeIdentity,
      externalRefs: receipt.externalRefs,
      observedAt: receipt.observedAt,
    },
  }));
}

function receiptBinding(receipt: GovernedExecutionReceipt) {
  return {
    leaseId: receipt.leaseId,
    idempotencyKey: receipt.idempotencyKey,
    status: receipt.status,
    runtimeIdentity: receipt.runtimeIdentity,
    externalRefs: receipt.externalRefs,
    receiptObservedAt: receipt.observedAt,
  };
}

function denied(reason: string, code: string): GovernedRepositoryReadResult {
  return {
    state: 'DENIED',
    decision: { disposition: 'DENY', reasons: [code] },
    reason,
  };
}

/**
 * Executes one GitHub-backed repository file read through the existing
 * governed-runtime membrane, then independently re-reads provider state before
 * exposing content.
 *
 * The donor/runtime may propose the tool, but it cannot select or inject the
 * RepositoryProvider, forge the immutable ref, supply the verification witness,
 * or receive unverified content. Both provider instances are constructed by
 * FCR's server-owned provider factory. Only a stable ref plus identical content
 * can promote this bounded read to VERIFIED and release the output.
 *
 * This first vertical slice intentionally fixes the repository provider to the
 * current GitHub authority. Provider selection can move behind the project
 * registry later without making it runtime-authored.
 */
export async function runGovernedRepositoryRead(
  input: GovernedRepositoryReadInput,
): Promise<GovernedRepositoryReadResult> {
  const repository = normalize(input.repository);
  const projectId = normalize(input.projectId);
  const ref = normalize(input.ref);
  const path = safePath(input.path);

  if (!REPOSITORY.test(repository) || !projectId || !ref || !path) {
    return denied('Repository read target is malformed.', 'invalid_repository_read_target');
  }
  if (!input.lease) {
    return denied('A governed repository read requires an FCR lease.', 'missing_lease');
  }
  if (normalize(input.lease.principal.projectId ?? '') !== projectId) {
    return denied('Repository read project does not match the lease principal.', 'project_drift');
  }
  if (normalize(input.lease.authority.binding.repository ?? '').toLowerCase() !== repository.toLowerCase()) {
    return denied('Repository read target does not match the lease repository.', 'repository_drift');
  }
  if (
    input.proposal.toolName !== REPOSITORY_READ_TOOL
    || input.proposal.requestedCapabilities.length !== 1
    || input.proposal.requestedCapabilities[0] !== REPOSITORY_READ_CAPABILITY
  ) {
    return denied('Repository reads admit only the canonical read-only tool capability.', 'repository_read_proposal_mismatch');
  }

  const project: ProviderProjectConfig = {
    repo_provider: 'github',
    slug: projectId,
    repo_identifier: repository,
  };

  let executionProvider: RepositoryProvider;
  let resolvedSha: string;
  try {
    executionProvider = providerForProject(project);
    resolvedSha = normalize(await executionProvider.resolveRef(projectId, ref));
  } catch {
    return {
      state: 'ATTEMPT_FAILED',
      decision: { disposition: 'DENY', reasons: ['repository_ref_resolution_failed'] },
      reason: 'FCR could not resolve the repository ref before governed execution.',
    };
  }

  if (!FULL_SHA.test(resolvedSha)) {
    return denied('Repository provider returned a non-immutable ref identity.', 'invalid_repository_ref_identity');
  }

  const locator = repositoryReadSubjectLocator(repository, ref, path);
  const fingerprint = repositoryReadSubjectFingerprint(repository, ref, path);
  let capturedContent: string | undefined;
  let capturedHash: string | undefined;

  const attempt = await runGovernedReadOnlyAttempt({
    lease: input.lease,
    world: {
      ...input.world,
      authorityWorld: {
        ...input.world.authorityWorld,
        repository,
        headSha: resolvedSha,
      },
      subject: {
        locator,
        observedVersion: resolvedSha,
        fingerprint,
      },
    },
    proposal: input.proposal,
    adapter: {
      name: REPOSITORY_READ_TOOL,
      effect: 'read_only',
      capabilities: [REPOSITORY_READ_CAPABILITY],
      invoke: async () => {
        const content = await executionProvider.readFile(projectId, resolvedSha, path);
        if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
          throw new Error('repository_read_too_large');
        }
        const contentHash = sha256(content);
        capturedContent = content;
        capturedHash = contentHash;
        return {
          leaseId: input.lease!.authority.id,
          idempotencyKey: input.lease!.execution.idempotencyKey,
          status: 'succeeded',
          runtimeIdentity: runtimeIdentityForLease(input.lease!),
          externalRefs: externalRefs(repository, ref, resolvedSha, path, contentHash),
          observedAt: new Date().toISOString(),
        };
      },
    },
  });

  if (attempt.state !== 'EXECUTED_UNVERIFIED' || !attempt.receipt || capturedContent === undefined || !capturedHash) {
    return {
      state: attempt.state,
      decision: attempt.decision,
      receipt: attempt.receipt,
      reason: attempt.reason,
    };
  }

  let readbackSha: string;
  let readbackContent: string;
  try {
    const readbackProvider = providerForProject(project);
    readbackSha = normalize(await readbackProvider.resolveRef(projectId, ref));
    if (!FULL_SHA.test(readbackSha)) throw new Error('invalid_readback_sha');
    if (readbackSha !== resolvedSha) {
      const witness: GovernedExecutionWitness = {
        status: 'contradicted',
        strength: 'W1',
        evidenceFingerprint: witnessFingerprint(
          repository,
          ref,
          readbackSha,
          path,
          capturedHash,
          attempt.receipt,
        ),
        observedAt: new Date().toISOString(),
        receiptBinding: receiptBinding(attempt.receipt),
      };
      return {
        state: evaluateGovernedExecutionOutcome(attempt.receipt, witness, 'W1'),
        decision: attempt.decision,
        receipt: attempt.receipt,
        witness,
        reason: 'Repository ref moved during the verification window; content is withheld.',
      };
    }
    readbackContent = await readbackProvider.readFile(projectId, readbackSha, path);
    if (Buffer.byteLength(readbackContent, 'utf8') > MAX_CONTENT_BYTES) {
      throw new Error('repository_readback_too_large');
    }
  } catch {
    return {
      state: 'EXECUTED_UNVERIFIED',
      decision: attempt.decision,
      receipt: attempt.receipt,
      reason: 'FCR-owned provider readback failed; unverified repository content is withheld.',
    };
  }

  const readbackHash = sha256(readbackContent);
  const witness: GovernedExecutionWitness = {
    status: readbackHash === capturedHash ? 'verified' : 'contradicted',
    strength: 'W1',
    evidenceFingerprint: witnessFingerprint(
      repository,
      ref,
      readbackSha,
      path,
      readbackHash,
      attempt.receipt,
    ),
    observedAt: new Date().toISOString(),
    receiptBinding: receiptBinding(attempt.receipt),
  };
  const outcome = evaluateGovernedExecutionOutcome(attempt.receipt, witness, 'W1');

  if (outcome !== 'VERIFIED') {
    return {
      state: outcome,
      decision: attempt.decision,
      receipt: attempt.receipt,
      witness,
      reason: 'Independent repository readback contradicted the execution result; content is withheld.',
    };
  }

  return {
    state: 'VERIFIED',
    decision: attempt.decision,
    receipt: attempt.receipt,
    witness,
    output: {
      repository,
      projectId,
      ref,
      commitSha: resolvedSha,
      path,
      contentSha256: capturedHash,
      content: capturedContent,
    },
  };
}
