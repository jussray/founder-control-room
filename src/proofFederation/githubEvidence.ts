import { randomUUID } from 'node:crypto';
import type { RepositoryProvider, VerificationSignal } from '../providers/RepositoryProvider.js';
import { providerForProject, type ProviderProjectConfig } from '../providers/providerFactory.js';
import {
  FEDERATED_PROOF_CONTRACT,
  type FederatedProofReceipt,
  type FederatedProofState,
  validateFederatedProofReceipt,
} from './contract.js';

const JUSS_REPOSITORY = /^jussray\/[A-Za-z0-9._-]{1,100}$/;

export interface CollectFcrGitHubProofInput {
  repository: string;
  ref?: string;
  acknowledges?: string[];
  dependsOn?: string[];
  supersedes?: string[];
  nextAuthority?: string;
}

export interface FcrGitHubProofDependencies {
  providerForProject(config: ProviderProjectConfig): RepositoryProvider;
  createReceiptId(): string;
  now(): Date;
}

const defaultDependencies: FcrGitHubProofDependencies = {
  providerForProject,
  createReceiptId: randomUUID,
  now: () => new Date(),
};

function signalState(signal: VerificationSignal): FederatedProofState {
  switch (signal.status) {
    case 'passed':
      return 'verified';
    case 'failed':
      return 'failed';
    case 'queued':
    case 'running':
    case 'unknown':
      return 'unknown';
    case 'cancelled':
      return 'blocked';
    case 'skipped':
      return 'inferred';
    default:
      return 'unknown';
  }
}

function overallState(signals: VerificationSignal[]): FederatedProofState {
  if (signals.some((signal) => signal.status === 'failed')) return 'failed';
  if (signals.some((signal) => signal.status === 'queued' || signal.status === 'running')) return 'unknown';
  if (signals.some((signal) => signal.status === 'unknown' || signal.status === 'cancelled')) return 'unknown';
  if (signals.some((signal) => signal.status === 'passed')) return 'verified';
  return 'unknown';
}

export async function collectFcrGitHubProof(
  input: CollectFcrGitHubProofInput,
  deps: FcrGitHubProofDependencies = defaultDependencies,
): Promise<FederatedProofReceipt> {
  if (!JUSS_REPOSITORY.test(input.repository)) throw new Error('unsupported_repository');

  const ref = input.ref?.trim() || 'main';
  const project: ProviderProjectConfig = {
    repo_provider: 'github',
    slug: input.repository,
    repo_identifier: input.repository,
  };
  const provider = deps.providerForProject(project);
  const resolved = await provider.getRef(project.slug, ref);
  const signals = await provider.listVerificationSignals(project.slug, resolved.commitSha);

  const receipt: FederatedProofReceipt = {
    schema: FEDERATED_PROOF_CONTRACT,
    receiptId: deps.createReceiptId(),
    project: input.repository,
    actor: 'fcr-github-provider',
    authority: {
      provider: 'github',
      scope: 'repository',
      target: input.repository,
      mode: 'verify',
    },
    exactTarget: {
      repository: input.repository,
      branch: ref,
      sha: resolved.commitSha,
    },
    operation: 'repository_verification_snapshot',
    state: overallState(signals),
    evidence: signals.map((signal) => ({
      type: 'check_run',
      name: signal.name,
      state: signalState(signal),
      ref: signal.detailsUrl,
    })),
    acknowledges: input.acknowledges ?? [],
    dependsOn: input.dependsOn ?? [],
    supersedes: input.supersedes ?? [],
    nextAuthority: input.nextAuthority,
    issuedAt: deps.now().toISOString(),
  };

  return validateFederatedProofReceipt(receipt);
}
