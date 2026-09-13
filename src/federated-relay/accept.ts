import { randomUUID } from 'node:crypto';
import { canonicalizeRelayJcsV31 } from './federatedRelay/jcs.js';
import { relayDeliveryFingerprintV31, relayEvidenceDigestV31, relaySemanticFingerprintV31, relaySuccessorProofCookieV31, sha256HexV31, verifyRelaySignatureV31 } from './federatedRelay/crypto.js';
import { FEDERATED_AGENT_RELAY_RECEIPT_V31, type FederatedAgentRelayEnvelopeV31, type FederatedAgentRelayReceiptV31, type FederatedAgentRelayReceiptV31Unsigned, type RelayAcceptDepsV31, type RelayLedgerAcceptResultV31, RelayV31Error } from './federatedRelay/v31-types.js';
import { assertFederatedRelayEnvelopeV31, validateRelayFreshnessV31 } from './federatedRelay/validation.js';

function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new RelayV31Error(code); }

export async function validateRelayEndpointBindingsV31(input: { envelope: FederatedAgentRelayEnvelopeV31; deps: RelayAcceptDepsV31 }): Promise<{ sourceCurrentHeadSha: string; targetCurrentHeadSha: string }> {
  const { envelope, deps } = input;
  const local = deps.localIdentity;
  assert(local.member === envelope.target.member, 'relay_target_member_mismatch');
  assert(local.repository === envelope.target.repository, 'relay_target_repository_mismatch');
  assert(local.branch === envelope.target.branch, 'relay_target_branch_mismatch');
  assert(local.currentHeadSha === envelope.target.headSha, 'relay_target_runtime_stale');

  const [sourceCurrentHeadSha, targetCurrentHeadSha] = await Promise.all([
    deps.sourceEvidence.currentBranchHeadSha({ repository: envelope.source.repository, branch: envelope.source.branch }),
    deps.sourceEvidence.currentBranchHeadSha({ repository: envelope.target.repository, branch: envelope.target.branch }),
  ]);
  assert(sourceCurrentHeadSha !== null, 'relay_source_branch_unknown');
  assert(targetCurrentHeadSha !== null, 'relay_target_branch_unknown');
  assert(sourceCurrentHeadSha === envelope.source.headSha, 'relay_source_head_stale');
  assert(targetCurrentHeadSha === envelope.target.headSha, 'relay_target_head_stale');
  assert(targetCurrentHeadSha === local.currentHeadSha, 'relay_target_runtime_not_current_head');
  return { sourceCurrentHeadSha, targetCurrentHeadSha };
}

export async function acceptFederatedRelayV31(input: unknown, deps: RelayAcceptDepsV31): Promise<RelayLedgerAcceptResultV31> {
  assertFederatedRelayEnvelopeV31(input);
  const envelope = input;
  const now = deps.now ?? Date.now();
  const semanticFingerprint = relaySemanticFingerprintV31(envelope);
  const deliveryFingerprint = relayDeliveryFingerprintV31(envelope);
  const verifiedKey = await verifyRelaySignatureV31(envelope, deps.signatureVerifier);

  // Exact retries authenticate first, then return immutable historical acceptance
  // plus mutable current state. They intentionally do not reacquire freshness/head
  // evidence because retry delivery is not a new acceptance event.
  const existing = await deps.ledger.findByMessageId(envelope.messageId);
  if (existing) {
    assert(existing.semanticFingerprint === semanticFingerprint, 'relay_message_id_collision');
    assert(existing.deliveryFingerprint === deliveryFingerprint, 'relay_delivery_fingerprint_collision');
    return { outcome: 'duplicate', receipt: existing.receipt, currentState: existing.currentState, supersededByMessageId: existing.supersededByMessageId };
  }

  validateRelayFreshnessV31(envelope, now);
  assert(sha256HexV31(envelope.payload.body) === envelope.payload.sha256, 'relay_payload_digest_mismatch');
  await validateRelayEndpointBindingsV31({ envelope, deps });
  const evidenceDigest = relayEvidenceDigestV31(envelope.evidence);
  const successorProofCookie = relaySuccessorProofCookieV31({ chainId: envelope.ordering.chainId, predecessorProofCookie: envelope.predecessorProofCookie, deliveryFingerprint, nonce: envelope.nonce, sourceMember: envelope.source.member, targetMember: envelope.target.member });
  const unsignedReceipt: FederatedAgentRelayReceiptV31Unsigned = {
    contract: FEDERATED_AGENT_RELAY_RECEIPT_V31, status: 'accepted', receiptId: randomUUID(), messageId: envelope.messageId, semanticFingerprint, deliveryFingerprint, chainId: envelope.ordering.chainId, chainPosition: envelope.ordering.chainPosition,
    receiver: { member: deps.localIdentity.member, repository: deps.localIdentity.repository, branch: deps.localIdentity.branch, headSha: deps.localIdentity.currentHeadSha }, sourceHeadSha: envelope.source.headSha, targetObservedHeadSha: deps.localIdentity.currentHeadSha,
    sourceCommitEvidence: { repository: envelope.source.repository, branch: envelope.source.branch, headSha: envelope.source.headSha, state: 'current_head_at_acceptance', checkedAt: new Date(now).toISOString() },
    predecessorProofCookie: envelope.predecessorProofCookie, successorProofCookie, evidenceDigest,
    acceptedKeyState: { member: verifiedKey.member, keyId: verifiedKey.keyId, state: verifiedKey.state, validFrom: verifiedKey.validFrom, validUntil: verifiedKey.validUntil }, acceptedAt: new Date(now).toISOString(),
    executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
    nextGate: 'Relay acceptance records signed evidence only. The receiver must independently validate local policy, evidence, current target state, and local authorization before any mutation.',
  };
  const signature = await deps.receiptSigner.sign({ receiver: deps.localIdentity.member, canonicalReceiptBytes: new TextEncoder().encode(canonicalizeRelayJcsV31(unsignedReceipt)) });
  const receipt: FederatedAgentRelayReceiptV31 = { ...unsignedReceipt, signature };
  return deps.ledger.accept({ envelope, semanticFingerprint, deliveryFingerprint, successorProofCookie, evidenceDigest, receipt });
}
