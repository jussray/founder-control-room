import { canonicalizeRelayJcsV31 } from './federatedRelay/jcs.js';
import { decodeBase64UrlV31, relayDeliveryFingerprintV31, relaySemanticFingerprintV31, relaySuccessorProofCookieV31 } from './federatedRelay/crypto.js';
import {
  FEDERATED_AGENT_RELAY_RECEIPT_V31,
  type FederatedAgentRelayEnvelopeV31,
  type FederatedAgentRelayReceiptV31,
  type RelaySignatureVerifierV31,
  RelayV31Error,
} from './federatedRelay/v31-types.js';

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RelayV31Error(code);
}

const RECEIPT_KEYS = [
  'contract','status','receiptId','messageId','semanticFingerprint','deliveryFingerprint','chainId','chainPosition',
  'receiver','sourceHeadSha','targetObservedHeadSha','sourceCommitEvidence','predecessorProofCookie','successorProofCookie',
  'evidenceDigest','acceptedKeyState','acceptedAt','executionAuthorized','authorityTransferred','approvalCarriedForward','nextGate','signature',
] as const;

function exactKeys(value: unknown, allowed: readonly string[], code: string): asserts value is Record<string, unknown> {
  assert(Boolean(value) && typeof value === 'object' && !Array.isArray(value), code);
  const keys = Object.keys(value as Record<string, unknown>);
  assert(keys.every((key) => allowed.includes(key)), `${code}_field`);
}

export async function verifyFederatedRelayAcceptanceReceiptV31(input: {
  envelope: FederatedAgentRelayEnvelopeV31;
  receipt: FederatedAgentRelayReceiptV31;
  verifier: RelaySignatureVerifierV31;
}): Promise<FederatedAgentRelayReceiptV31> {
  const { envelope, receipt, verifier } = input;
  exactKeys(receipt, RECEIPT_KEYS, 'relay_receipt');
  assert(receipt.contract === FEDERATED_AGENT_RELAY_RECEIPT_V31, 'relay_receipt_contract');
  assert(receipt.status === 'accepted', 'relay_receipt_status');
  assert(receipt.messageId === envelope.messageId, 'relay_receipt_message_id');
  assert(receipt.semanticFingerprint === relaySemanticFingerprintV31(envelope), 'relay_receipt_semantic_fingerprint');
  const deliveryFingerprint = relayDeliveryFingerprintV31(envelope);
  assert(receipt.deliveryFingerprint === deliveryFingerprint, 'relay_receipt_delivery_fingerprint');
  assert(receipt.chainId === envelope.ordering.chainId, 'relay_receipt_chain_id');
  assert(receipt.chainPosition === envelope.ordering.chainPosition, 'relay_receipt_chain_position');
  assert(receipt.receiver.member === envelope.target.member, 'relay_receipt_receiver_member');
  assert(receipt.receiver.repository === envelope.target.repository, 'relay_receipt_receiver_repository');
  assert(receipt.receiver.branch === envelope.target.branch, 'relay_receipt_receiver_branch');
  assert(receipt.receiver.headSha === envelope.target.headSha, 'relay_receipt_receiver_head');
  assert(receipt.targetObservedHeadSha === envelope.target.headSha, 'relay_receipt_target_head');
  assert(receipt.sourceHeadSha === envelope.source.headSha, 'relay_receipt_source_head');
  assert(receipt.predecessorProofCookie === envelope.predecessorProofCookie, 'relay_receipt_predecessor_cookie');
  const expectedSuccessor = relaySuccessorProofCookieV31({
    chainId: envelope.ordering.chainId,
    predecessorProofCookie: envelope.predecessorProofCookie,
    deliveryFingerprint,
    nonce: envelope.nonce,
    sourceMember: envelope.source.member,
    targetMember: envelope.target.member,
  });
  assert(receipt.successorProofCookie === expectedSuccessor, 'relay_receipt_successor_cookie');
  assert(receipt.executionAuthorized === false, 'relay_receipt_execution_authority');
  assert(receipt.authorityTransferred === false, 'relay_receipt_authority_transfer');
  assert(receipt.approvalCarriedForward === false, 'relay_receipt_approval_carry');
  assert(receipt.signature.algorithm === 'Ed25519', 'relay_receipt_signature_algorithm');

  const { signature: _signature, ...unsignedReceipt } = receipt;
  const verified = await verifier.verify({
    member: receipt.receiver.member,
    keyId: receipt.signature.keyId,
    issuedAt: receipt.acceptedAt,
    canonicalUnsignedBytes: new TextEncoder().encode(canonicalizeRelayJcsV31(unsignedReceipt)),
    signature: decodeBase64UrlV31(receipt.signature.valueBase64Url),
  });
  assert(verified.member === receipt.receiver.member, 'relay_receipt_key_member_mismatch');
  assert(verified.keyId === receipt.signature.keyId, 'relay_receipt_key_id_mismatch');
  assert(verified.state !== 'revoked', 'relay_receipt_key_revoked');
  return receipt;
}
