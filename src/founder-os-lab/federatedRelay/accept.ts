import { randomUUID } from 'node:crypto';
import { canonicalizeRelayJcsV31 } from './jcs.js';
import {
  relayDeliveryFingerprintV31,
  relayEvidenceDigestV31,
  relaySemanticFingerprintV31,
  relaySuccessorProofCookieV31,
  sha256HexV31,
  verifyRelaySignatureV31,
} from './crypto.js';
import {
  FEDERATED_AGENT_RELAY_RECEIPT_V31,
  type FederatedAgentRelayEnvelopeV31,
  type FederatedAgentRelayReceiptV31,
  type FederatedAgentRelayReceiptV31Unsigned,
  type RelayAcceptDepsV31,
  type RelayLedgerAcceptResultV31,
  RelayV31Error,
} from './v31-types.js';
import { assertFederatedRelayEnvelopeV31, validateRelayFreshnessV31 } from './validation.js';

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RelayV31Error(code);
}

export async function validateRelayEndpointBindingsV31(input: {
  envelope: FederatedAgentRelayEnvelopeV31;
  deps: RelayAcceptDepsV31;
}): Promise<{ sourceReachableFromClaimedBranch: boolean }> {
  const { envelope, deps } = input;
  const local = deps.localIdentity;

  assert(local.member === envelope.target.member, 'relay_target_member_mismatch');
  assert(local.repository === envelope.target.repository, 'relay_target_repository_mismatch');
  assert(local.branch === envelope.target.branch, 'relay_target_branch_mismatch');
  assert(local.currentHeadSha.toLowerCase() === envelope.target.headSha.toLowerCase(), 'relay_target_head_stale');

  const sourceExists = await deps.sourceEvidence.commitExists({
    repository: envelope.source.repository,
    sha: envelope.source.headSha,
  });
  assert(sourceExists, 'relay_source_commit_unknown');

  const sourceReachableFromClaimedBranch = await deps.sourceEvidence.isCommitReachableFromBranch({
    repository: envelope.source.repository,
    branch: envelope.source.branch,
    sha: envelope.source.headSha,
  });

  return { sourceReachableFromClaimedBranch };
}

export async function acceptFederatedRelayV31(
  input: unknown,
  deps: RelayAcceptDepsV31,
): Promise<RelayLedgerAcceptResultV31> {
  assertFederatedRelayEnvelopeV31(input);
  const envelope = input;
  const now = deps.now ?? Date.now();

  const semanticFingerprint = relaySemanticFingerprintV31(envelope);
  const deliveryFingerprint = relayDeliveryFingerprintV31(envelope);

  // Every presented delivery is authenticated. Exact retries then reuse the
  // one immutable receipt already persisted for this message ID.
  const verifiedKey = await verifyRelaySignatureV31(envelope, deps.signatureVerifier);
  const existing = await deps.ledger.findByMessageId(envelope.messageId);
  if (existing) {
    assert(existing.semanticFingerprint === semanticFingerprint, 'relay_message_id_collision');
    assert(existing.deliveryFingerprint === deliveryFingerprint, 'relay_delivery_fingerprint_collision');
    return {
      outcome: 'duplicate',
      receipt: existing.receipt,
      currentState: existing.currentState,
      supersededByMessageId: existing.supersededByMessageId,
    };
  }

  validateRelayFreshnessV31(envelope, now);
  assert(sha256HexV31(envelope.payload.body) === envelope.payload.sha256, 'relay_payload_digest_mismatch');
  const binding = await validateRelayEndpointBindingsV31({ envelope, deps });

  const evidenceDigest = relayEvidenceDigestV31(envelope.evidence);
  const successorProofCookie = relaySuccessorProofCookieV31({
    chainId: envelope.ordering.chainId,
    predecessorProofCookie: envelope.predecessorProofCookie,
    deliveryFingerprint,
    nonce: envelope.nonce,
    sourceMember: envelope.source.member,
    targetMember: envelope.target.member,
  });

  const unsignedReceipt: FederatedAgentRelayReceiptV31Unsigned = {
    contract: FEDERATED_AGENT_RELAY_RECEIPT_V31,
    status: 'accepted',
    receiptId: randomUUID(),
    messageId: envelope.messageId,
    semanticFingerprint,
    deliveryFingerprint,
    chainId: envelope.ordering.chainId,
    chainPosition: envelope.ordering.chainPosition,
    receiver: {
      member: deps.localIdentity.member,
      repository: deps.localIdentity.repository,
      branch: deps.localIdentity.branch,
      headSha: deps.localIdentity.currentHeadSha,
    },
    sourceHeadSha: envelope.source.headSha,
    targetObservedHeadSha: deps.localIdentity.currentHeadSha,
    sourceCommitEvidence: {
      repository: envelope.source.repository,
      branch: envelope.source.branch,
      headSha: envelope.source.headSha,
      state: binding.sourceReachableFromClaimedBranch
        ? 'reachable_at_acceptance'
        : 'exists_not_currently_reachable',
      checkedAt: new Date(now).toISOString(),
    },
    predecessorProofCookie: envelope.predecessorProofCookie,
    successorProofCookie,
    evidenceDigest,
    acceptedKeyState: {
      member: verifiedKey.member,
      keyId: verifiedKey.keyId,
      state: verifiedKey.state,
      validFrom: verifiedKey.validFrom,
      validUntil: verifiedKey.validUntil,
    },
    acceptedAt: new Date(now).toISOString(),
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
    nextGate: 'Relay acceptance records signed evidence only. The receiver must independently validate local policy, evidence, current target state, and local authorization before any mutation.',
  };

  const signature = await deps.receiptSigner.sign({
    receiver: deps.localIdentity.member,
    canonicalReceiptBytes: new TextEncoder().encode(canonicalizeRelayJcsV31(unsignedReceipt)),
  });
  const receipt: FederatedAgentRelayReceiptV31 = { ...unsignedReceipt, signature };

  return deps.ledger.accept({
    envelope,
    semanticFingerprint,
    deliveryFingerprint,
    successorProofCookie,
    evidenceDigest,
    receipt,
  });
}
