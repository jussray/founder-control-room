import type { RepositoryProvider } from './RepositoryProvider.js';
import {
  validateAuthorityEnvelope,
  type AuthorityEnvelopeV1,
} from '../founder-os-lab/authorityKernel.js';

export interface AuthorizedCreateBranchInput {
  projectId: string;
  baseRef: string;
  branchName: string;
  envelope: AuthorityEnvelopeV1;
  context: {
    now: string;
    proposalHash: string;
    argumentsHash: string;
    stateFingerprint: string;
    toolCallId: string;
  };
}

/**
 * Consequential repository mutation membrane.
 *
 * The provider call is unreachable unless the exact FCR-issued authority
 * envelope still matches the capability, proposal, arguments, observed state,
 * tool call, and expiry at the last possible moment before mutation.
 */
export async function executeAuthorizedCreateBranch(
  provider: RepositoryProvider,
  input: AuthorizedCreateBranchInput,
): Promise<string> {
  const errors = validateAuthorityEnvelope(input.envelope, {
    ...input.context,
    capabilityId: 'github.repository.create_branch',
  });

  if (errors.length > 0) {
    throw new Error(`AUTHORITY_ENVELOPE_REJECTED: ${errors.join('; ')}`);
  }

  return provider.createBranch(input.projectId, input.baseRef, input.branchName);
}
