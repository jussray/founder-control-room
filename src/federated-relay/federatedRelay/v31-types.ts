export const FEDERATED_AGENT_RELAY_V31 = 'juss/federated-agent-relay@v3.1' as const;
export const FEDERATED_AGENT_RELAY_RECEIPT_V31 = 'juss/federated-agent-relay-receipt@v3.1' as const;
export const GENESIS_PROOF_COOKIE_V31 = 'Q4R:v3.1:genesis' as const;

export const RELAY_V31_LIMITS = {
  maxEnvelopeBytes: 512 * 1024,
  maxPayloadBytes: 256 * 1024,
  maxPayloadJsonDepth: 32,
  maxJcsDepth: 64,
  maxSubjectChars: 512,
  maxEvidence: 64,
  maxSupersedes: 64,
  maxTtlMs: 5 * 60 * 1000,
  clockSkewMs: 30 * 1000,
} as const;

export const FEDERATED_AGENT_MEMBERS_V31 = ['founder-control-room','chief-ai-machine','solcontinuity','promptos'] as const;
export type FederatedAgentMemberV31 = typeof FEDERATED_AGENT_MEMBERS_V31[number];
export type RelayDispositionV31 = 'observe' | 'reconcile' | 'propose';
export type RelayTruthStateV31 = 'verified' | 'inferred' | 'unknown' | 'stale' | 'blocked' | 'failed';
export type RelayContentTypeV31 = 'text/plain' | 'application/json';
export type RelayKeyStateV31 = 'active' | 'retiring' | 'revoked';
export type RelayRelationTypeV31 = 'root' | 'reply' | 'revision' | 'reconcile';
export type RelayCurrentStateV31 = 'accepted' | 'superseded' | 'revoked';

export class RelayV31Error extends Error { constructor(public readonly code: string) { super(code); this.name = 'RelayV31Error'; } }
export interface RelayMemberIdentityV31 { member: FederatedAgentMemberV31; repository: string; branch: string; headSha: string; }
export interface RelayEvidenceLocatorV31 { provider: 'github' | 'cloudflare' | 'supabase' | 'juss-proof'; ref: string; }
export interface RelayEvidenceV31 { locator: RelayEvidenceLocatorV31; state: RelayTruthStateV31; sha256?: string; proofReceiptId?: string; }
export type RelayRelationV31 = { type: 'root' } | { type: 'reply' | 'revision' | 'reconcile'; parentMessageId: string };
export interface RelayOrderingV31 { chainId: string; sourceSequence: number; chainPosition: number; logicalOperationId: string; relation: RelayRelationV31; }
export interface RelaySignatureV31 { algorithm: 'Ed25519'; keyId: string; valueBase64Url: string; }
export interface FederatedAgentRelayEnvelopeV31 { contract: typeof FEDERATED_AGENT_RELAY_V31; messageId: string; replyToMessageId?: string; ordering: RelayOrderingV31; source: RelayMemberIdentityV31; target: RelayMemberIdentityV31; issuedAt: string; expiresAt: string; nonce: string; disposition: RelayDispositionV31; subject: string; payload: { contentType: RelayContentTypeV31; body: string; sha256: string }; contextFingerprint: string; predecessorProofCookie: string; evidence: RelayEvidenceV31[]; supersedesMessageIds: string[]; signature: RelaySignatureV31; }
export interface AcceptedKeyStateV31 { member: FederatedAgentMemberV31; keyId: string; state: Exclude<RelayKeyStateV31,'revoked'>; validFrom: string; validUntil: string | null; }
export interface SourceCommitEvidenceV31 { repository: string; branch: string; headSha: string; state: 'current_head_at_acceptance' | 'reachable_at_acceptance' | 'exists_not_currently_reachable'; checkedAt: string; }
export interface FederatedAgentRelayReceiptV31Unsigned { contract: typeof FEDERATED_AGENT_RELAY_RECEIPT_V31; status: 'accepted'; receiptId: string; messageId: string; semanticFingerprint: string; deliveryFingerprint: string; chainId: string; chainPosition: number; receiver: RelayMemberIdentityV31; sourceHeadSha: string; targetObservedHeadSha: string; sourceCommitEvidence: SourceCommitEvidenceV31; predecessorProofCookie: string; successorProofCookie: string; evidenceDigest: string; acceptedKeyState: AcceptedKeyStateV31; acceptedAt: string; executionAuthorized: false; authorityTransferred: false; approvalCarriedForward: false; nextGate: string; }
export interface FederatedAgentRelayReceiptV31 extends FederatedAgentRelayReceiptV31Unsigned { signature: RelaySignatureV31; }
export interface RelayVerifiedKeyV31 { member: FederatedAgentMemberV31; keyId: string; state: RelayKeyStateV31; validFrom: string; validUntil: string | null; }
export interface RelaySignatureVerifierV31 { verify(input: { member: FederatedAgentMemberV31; keyId: string; issuedAt: string; canonicalUnsignedBytes: Uint8Array; signature: Uint8Array }): Promise<RelayVerifiedKeyV31>; }
export interface RelayReceiptSignerV31 { sign(input: { receiver: FederatedAgentMemberV31; canonicalReceiptBytes: Uint8Array }): Promise<RelaySignatureV31>; }
export interface RelaySourceEvidenceResolverV31 { commitExists(input: { repository: string; sha: string }): Promise<boolean>; isCommitReachableFromBranch(input: { repository: string; branch: string; sha: string }): Promise<boolean>; currentBranchHeadSha(input: { repository: string; branch: string }): Promise<string | null>; }
export interface RelayLocalIdentityV31 { member: FederatedAgentMemberV31; repository: string; branch: string; currentHeadSha: string; }
export interface StoredRelayDeliveryV31 { messageId: string; semanticFingerprint: string; deliveryFingerprint: string; receipt: FederatedAgentRelayReceiptV31; currentState: RelayCurrentStateV31; supersededByMessageId: string | null; }
export interface RelayLedgerAcceptInputV31 { envelope: FederatedAgentRelayEnvelopeV31; semanticFingerprint: string; deliveryFingerprint: string; successorProofCookie: string; evidenceDigest: string; receipt: FederatedAgentRelayReceiptV31; }
export interface RelayLedgerAcceptResultV31 { outcome: 'accepted' | 'duplicate'; receipt: FederatedAgentRelayReceiptV31; currentState: RelayCurrentStateV31; supersededByMessageId: string | null; }
export interface RelayLedgerV31 { findByMessageId(messageId: string): Promise<StoredRelayDeliveryV31 | null>; accept(input: RelayLedgerAcceptInputV31): Promise<RelayLedgerAcceptResultV31>; }
export interface RelayAcceptDepsV31 { localIdentity: RelayLocalIdentityV31; sourceEvidence: RelaySourceEvidenceResolverV31; signatureVerifier: RelaySignatureVerifierV31; receiptSigner: RelayReceiptSignerV31; ledger: RelayLedgerV31; now?: number; }
