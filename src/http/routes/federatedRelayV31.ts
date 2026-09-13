import type { Request, RequestHandler, Response } from 'express';
import { makeSupabaseClient } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import {
  FEDERATED_AGENT_RELAY_RECEIPT_V31,
  FEDERATED_AGENT_RELAY_V31,
  FEDERATED_RELAY_KEY_QUERY_V31,
  FEDERATED_RELAY_V31_MEMBER_REPOSITORIES,
  FederatedRelayV31Error,
  canonicalTransportByteLengthV31,
  deliveryFingerprintV31,
  parseFederatedAgentRelayEnvelopeV31,
  signRelayReceiptV31,
  verifyRelayEnvelopeV31,
  type FederatedAgentRelayEnvelopeV31,
  type FederatedRelayMemberV31,
  type FederatedRelayPublicKeyV31,
  type FederatedRelayReceiptV31,
  type FederatedRelayUnsignedReceiptV31,
} from '../../founder-os-lab/federatedRelayV31.js';

const LOCAL_MEMBER = 'founder-control-room' as const;
const LOCAL_REPOSITORY = FEDERATED_RELAY_V31_MEMBER_REPOSITORIES[LOCAL_MEMBER];
const SHA40 = /^[0-9a-f]{40}$/;
const KEY_QUERY_FIELDS = new Set(['contract','member','keyId']);

interface StoredMessage {
  semanticFingerprint: string;
  deliveryFingerprint: string;
  receipt: FederatedRelayReceiptV31;
  currentState: 'accepted' | 'superseded' | 'revoked';
  supersededByMessageId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function relayError(error: unknown): FederatedRelayV31Error {
  if (error instanceof FederatedRelayV31Error) return error;
  if (isRecord(error)) {
    if (error.code === '40P01') return new FederatedRelayV31Error('relay_deadlock_retry', 503);
    if (error.code === '40001') return new FederatedRelayV31Error('relay_serialization_retry', 503);
    const message = typeof error.message === 'string' ? error.message : String(error);
    const relayCode = message.match(/relay_[a-z0-9_]+/iu)?.[0];
    if (relayCode) return new FederatedRelayV31Error(relayCode, /retry|database|concurrency/u.test(relayCode) ? 503 : 409, message.slice(0, 1_000));
  }
  return new FederatedRelayV31Error('relay_internal_error', 503);
}

function statusFor(error: FederatedRelayV31Error): number {
  if (error.status !== 400) return error.status;
  if (/expired|stale|sequence|nonce|collision|chain|parent|supersession|tip/u.test(error.code)) return 409;
  if (/key_unknown|signature/u.test(error.code)) return 401;
  if (/unconfigured|runtime|provider|database|retry/u.test(error.code)) return 503;
  return 400;
}

function runtimeBase(member: FederatedRelayMemberV31): string {
  const configured: Partial<Record<FederatedRelayMemberV31, string | undefined>> = {
    'founder-control-room': process.env.FCR_FEDERATED_RELAY_BASE_URL || 'https://api.foundercontrolroom.org',
    'chief-ai-machine': process.env.CHIEF_FEDERATED_RELAY_BASE_URL,
    solcontinuity: process.env.SOLCONTINUITY_FEDERATED_RELAY_BASE_URL,
    promptos: process.env.PROMPTOS_FEDERATED_RELAY_BASE_URL,
  };
  const value = configured[member]?.trim().replace(/\/$/u, '') ?? '';
  if (!value.startsWith('https://')) throw new FederatedRelayV31Error('relay_source_runtime_unconfigured', 503);
  return value;
}

function repositoryProvider(identity: FederatedAgentRelayEnvelopeV31['source']) {
  return providerForProject({ repo_provider: 'github', slug: identity.member, repo_identifier: identity.repository });
}

async function resolveBranchHead(identity: FederatedAgentRelayEnvelopeV31['source']): Promise<string> {
  try {
    return (await repositoryProvider(identity).resolveRef(identity.member, identity.branch)).toLowerCase();
  } catch (error) {
    throw new FederatedRelayV31Error('relay_repository_head_unavailable', 503, error instanceof Error ? error.message : String(error));
  }
}

async function runtimeSha(member: FederatedRelayMemberV31, expectedHeadSha: string): Promise<string> {
  const base = runtimeBase(member);
  let response: globalThis.Response;
  try {
    response = await fetch(`${base}/version`, { headers: { Accept: 'application/json' }, redirect: 'manual' });
  } catch (error) {
    throw new FederatedRelayV31Error('relay_source_runtime_unavailable', 503, error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new FederatedRelayV31Error('relay_source_runtime_unavailable', 503, `runtime status ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  const observed = String(body.gitSha ?? body.sha ?? '').trim().toLowerCase();
  if (!SHA40.test(observed) || observed !== expectedHeadSha) throw new FederatedRelayV31Error('relay_source_runtime_stale', 409);
  return observed;
}

async function localPublicKey(member: FederatedRelayMemberV31, keyId: string): Promise<FederatedRelayPublicKeyV31> {
  const admin = makeSupabaseClient();
  const { data, error } = await admin.from('federated_relay_v31_public_keys')
    .select('member,key_id,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('member', member).eq('key_id', keyId).limit(1).maybeSingle();
  if (error) throw relayError(error);
  if (!data) throw new FederatedRelayV31Error('relay_key_unknown', 401);
  return {
    member: data.member as FederatedRelayMemberV31,
    keyId: String(data.key_id),
    publicKeyJwk: data.public_key_jwk as JsonWebKey,
    state: data.state as FederatedRelayPublicKeyV31['state'],
    validFrom: String(data.valid_from),
    validUntil: data.valid_until ? String(data.valid_until) : null,
    revokedAt: data.revoked_at ? String(data.revoked_at) : null,
  };
}

async function sourcePublicKey(envelope: FederatedAgentRelayEnvelopeV31): Promise<FederatedRelayPublicKeyV31> {
  const base = runtimeBase(envelope.source.member);
  const requestBody = JSON.stringify({ contract: FEDERATED_RELAY_KEY_QUERY_V31, member: envelope.source.member, keyId: envelope.signature.keyId });
  const response = await fetch(`${base}/api/federated-relay/v3`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: requestBody, redirect: 'manual',
  });
  if (!response.ok) throw new FederatedRelayV31Error('relay_key_unknown', response.status === 404 ? 401 : 503);
  const result = await response.json() as Record<string, unknown>;
  if (result.contract !== FEDERATED_RELAY_KEY_QUERY_V31 || !isRecord(result.key)) throw new FederatedRelayV31Error('relay_key_query_invalid', 503);
  const key = result.key;
  return {
    member: key.member as FederatedRelayMemberV31,
    keyId: String(key.keyId ?? ''),
    publicKeyJwk: key.publicKeyJwk as JsonWebKey,
    state: key.state as FederatedRelayPublicKeyV31['state'],
    validFrom: String(key.validFrom ?? ''),
    validUntil: key.validUntil == null ? null : String(key.validUntil),
    revokedAt: key.revokedAt == null ? null : String(key.revokedAt),
  };
}

async function receiverSigner(runtimeHeadSha: string): Promise<{ key: FederatedRelayPublicKeyV31; privateKey: CryptoKey }> {
  const keyId = process.env.FEDERATED_RELAY_RECEIVER_KEY_ID?.trim() ?? '';
  const privateJwkRaw = process.env.FEDERATED_RELAY_RECEIVER_PRIVATE_JWK?.trim() ?? '';
  if (!keyId || !privateJwkRaw) throw new FederatedRelayV31Error('relay_receiver_signing_key_unconfigured', 503);
  let privateJwk: JsonWebKey;
  try { privateJwk = JSON.parse(privateJwkRaw) as JsonWebKey; } catch { throw new FederatedRelayV31Error('relay_receiver_signing_key_invalid', 503); }
  const key = await localPublicKey(LOCAL_MEMBER, keyId);
  if (privateJwk.kty !== key.publicKeyJwk.kty || privateJwk.crv !== key.publicKeyJwk.crv || privateJwk.x !== key.publicKeyJwk.x) {
    throw new FederatedRelayV31Error('relay_receiver_signing_key_mismatch', 503);
  }
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'Ed25519' }, false, ['sign']);
  if (!SHA40.test(runtimeHeadSha)) throw new FederatedRelayV31Error('relay_runtime_identity_unavailable', 503);
  return { key, privateKey };
}

async function findStored(messageId: string): Promise<StoredMessage | null> {
  const admin = makeSupabaseClient();
  const { data, error } = await admin.from('federated_relay_v31_messages')
    .select('semantic_fingerprint,delivery_fingerprint,receipt,status,superseded_by_message_id')
    .eq('message_id', messageId).limit(1).maybeSingle();
  if (error) throw relayError(error);
  if (!data) return null;
  return {
    semanticFingerprint: String(data.semantic_fingerprint),
    deliveryFingerprint: String(data.delivery_fingerprint),
    receipt: data.receipt as FederatedRelayReceiptV31,
    currentState: data.status as StoredMessage['currentState'],
    supersededByMessageId: data.superseded_by_message_id ? String(data.superseded_by_message_id) : null,
  };
}

async function persist(input: {
  envelope: FederatedAgentRelayEnvelopeV31;
  semanticFingerprint: string;
  deliveryFingerprint: string;
  successorProofCookie: string;
  evidenceDigest: string;
  receipt: FederatedRelayReceiptV31;
}) {
  const e = input.envelope;
  const admin = makeSupabaseClient();
  const { data, error } = await admin.rpc('federated_relay_accept_v31', {
    p_message_id: e.messageId,
    p_semantic_fingerprint: input.semanticFingerprint,
    p_delivery_fingerprint: input.deliveryFingerprint,
    p_receipt_id: input.receipt.receiptId,
    p_receipt: input.receipt,
    p_envelope: e,
    p_chain_id: e.ordering.chainId,
    p_chain_position: e.ordering.chainPosition,
    p_logical_operation_id: e.ordering.logicalOperationId,
    p_relation_type: e.ordering.relation.type,
    p_parent_message_id: e.ordering.relation.parentMessageId ?? null,
    p_reply_to_message_id: e.replyToMessageId ?? null,
    p_source_member: e.source.member,
    p_source_repository: e.source.repository,
    p_source_branch: e.source.branch,
    p_source_head_sha: e.source.headSha,
    p_source_key_id: e.signature.keyId,
    p_source_sequence: e.ordering.sourceSequence,
    p_target_member: e.target.member,
    p_target_repository: e.target.repository,
    p_target_branch: e.target.branch,
    p_target_head_sha: e.target.headSha,
    p_nonce: e.nonce,
    p_predecessor_proof_cookie: e.predecessorProofCookie,
    p_successor_proof_cookie: input.successorProofCookie,
    p_payload_sha256: e.payload.sha256,
    p_evidence_digest: input.evidenceDigest,
    p_issued_at: e.issuedAt,
    p_expires_at: e.expiresAt,
    p_supersedes_message_ids: e.supersedesMessageIds,
  });
  if (error) throw relayError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row) || (row.delivery !== 'accepted' && row.delivery !== 'duplicate') || !isRecord(row.stored_receipt)) {
    throw new FederatedRelayV31Error('relay_database_result_invalid', 503);
  }
  return {
    delivery: row.delivery as 'accepted' | 'duplicate',
    receipt: row.stored_receipt as unknown as FederatedRelayReceiptV31,
    currentState: row.current_state as 'accepted' | 'superseded' | 'revoked',
    supersededByMessageId: row.superseded_by_message_id == null ? null : String(row.superseded_by_message_id),
  };
}

async function handleKeyQuery(req: Request, res: Response) {
  if (!isRecord(req.body) || Object.keys(req.body).some((key) => !KEY_QUERY_FIELDS.has(key))
      || req.body.contract !== FEDERATED_RELAY_KEY_QUERY_V31 || typeof req.body.member !== 'string' || typeof req.body.keyId !== 'string') {
    throw new FederatedRelayV31Error('relay_key_query_invalid');
  }
  if (req.body.member !== LOCAL_MEMBER) throw new FederatedRelayV31Error('relay_key_query_member_mismatch', 404);
  const key = await localPublicKey(LOCAL_MEMBER, req.body.keyId);
  return res.status(200).json({ contract: FEDERATED_RELAY_KEY_QUERY_V31, key, executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false });
}

export const handleFederatedRelayV31: RequestHandler = async function handleFederatedRelayV31(req: Request, res: Response) {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  try {
    if (isRecord(req.body) && req.body.contract === FEDERATED_RELAY_KEY_QUERY_V31) return await handleKeyQuery(req, res);
    const envelope = parseFederatedAgentRelayEnvelopeV31(req.body);

    // Express v3 transport currently parses JSON before this handler. For v3.1 we
    // require byte length equality with canonical JCS. Duplicate-key bodies necessarily
    // add bytes beyond the canonical parsed object and fail closed here; Chief's Worker
    // additionally performs raw duplicate-key rejection before JSON.parse.
    const declaredLength = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(declaredLength) || declaredLength !== canonicalTransportByteLengthV31(envelope)) {
      throw new FederatedRelayV31Error('relay_transport_not_canonical_length');
    }

    const deliveryFingerprint = await deliveryFingerprintV31(envelope);
    const stored = await findStored(envelope.messageId);
    if (stored) {
      if (stored.deliveryFingerprint !== deliveryFingerprint) throw new FederatedRelayV31Error('relay_message_id_collision', 409);
      return res.status(200).json({
        contract: FEDERATED_AGENT_RELAY_V31,
        delivery: 'duplicate',
        receipt: stored.receipt,
        currentState: stored.currentState,
        supersededByMessageId: stored.supersededByMessageId,
        executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
      });
    }

    const runtimeHeadSha = process.env.GIT_SHA?.trim() ?? '';
    if (!SHA40.test(runtimeHeadSha)) throw new FederatedRelayV31Error('relay_runtime_identity_unavailable', 503);
    if (envelope.target.member !== LOCAL_MEMBER || envelope.target.repository !== LOCAL_REPOSITORY || envelope.target.branch !== 'main' || envelope.target.headSha !== runtimeHeadSha) {
      throw new FederatedRelayV31Error('relay_target_identity_stale', 409);
    }

    const [sourceHead, targetHead] = await Promise.all([resolveBranchHead(envelope.source), resolveBranchHead(envelope.target)]);
    if (sourceHead !== envelope.source.headSha) throw new FederatedRelayV31Error('relay_source_identity_stale', 409);
    if (targetHead !== envelope.target.headSha || targetHead !== runtimeHeadSha) throw new FederatedRelayV31Error('relay_target_identity_stale', 409);

    await runtimeSha(envelope.source.member, envelope.source.headSha);
    const acceptedAt = new Date();
    const sourceKey = await sourcePublicKey(envelope);
    const verified = await verifyRelayEnvelopeV31({ envelope, key: sourceKey, acceptedAt });
    const signer = await receiverSigner(runtimeHeadSha);
    const receiptId = crypto.randomUUID();
    const unsignedReceipt: FederatedRelayUnsignedReceiptV31 = {
      contract: FEDERATED_AGENT_RELAY_RECEIPT_V31,
      receiptId,
      delivery: 'accepted',
      messageId: envelope.messageId,
      semanticFingerprint: verified.semanticFingerprint,
      deliveryFingerprint: verified.deliveryFingerprint,
      predecessorProofCookie: envelope.predecessorProofCookie,
      successorProofCookie: verified.successorProofCookie,
      sourceHeadSha: envelope.source.headSha,
      targetObservedHeadSha: runtimeHeadSha,
      sourceCommitEvidence: { repository: envelope.source.repository, branch: envelope.source.branch, headSha: envelope.source.headSha, state: 'reachable_at_acceptance', checkedAt: acceptedAt.toISOString() },
      evidenceDigest: verified.evidenceDigest,
      acceptedKey: { member: sourceKey.member, keyId: sourceKey.keyId, stateAtAcceptance: sourceKey.state as 'active' | 'retiring', validFrom: sourceKey.validFrom, validUntil: sourceKey.validUntil },
      acceptedAt: acceptedAt.toISOString(),
      executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
      nextGate: 'Relay acceptance is evidence transport only. Local policy, evidence verification, and explicit local approval remain required before mutation.',
      receiver: { member: LOCAL_MEMBER, repository: LOCAL_REPOSITORY, branch: 'main', headSha: runtimeHeadSha, keyId: signer.key.keyId },
    };
    const receipt = await signRelayReceiptV31(unsignedReceipt, signer.privateKey, signer.key.keyId);
    const durable = await persist({ envelope, ...verified, receipt });
    return res.status(durable.delivery === 'accepted' ? 201 : 200).json({
      contract: FEDERATED_AGENT_RELAY_V31,
      ...durable,
      executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
    });
  } catch (error) {
    const parsed = relayError(error);
    return res.status(statusFor(parsed)).json({
      error: parsed.code,
      detail: parsed.message,
      executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
    });
  }
};
