#!/usr/bin/env node
import { randomUUID, webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  FEDERATED_AGENT_RELAY_V31,
  FEDERATED_RELAY_GENESIS_COOKIE_V31,
  FEDERATED_RELAY_KEY_QUERY_V31,
  canonicalizeRelayJsonV31,
  deliveryFingerprintV31,
  parseCanonicalRelayJsonV31,
  semanticFingerprintV31,
  sha256HexV31,
  signRelayEnvelopeV31,
  successorProofCookieV31,
  verifyRelayEnvelopeV31,
  verifyRelayReceiptV31,
} from '../dist/founder-os-lab/federatedRelayV31.js';

const SHA40 = /^[0-9a-f]{40}$/;
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseUrl = String(process.env.FCR_RELAY_SUPABASE_URL || 'https://oojzfmmywbvficgybaxd.supabase.co').replace(/\/$/, '');
const fcrBaseUrl = String(process.env.FCR_FEDERATED_RELAY_BASE_URL || 'https://api.foundercontrolroom.org').replace(/\/$/, '');
const chiefBaseUrl = String(process.env.CHIEF_FEDERATED_RELAY_BASE_URL || '').replace(/\/$/, '');
const fcrSha = String(process.env.FCR_FEDERATED_RELAY_SOURCE_SHA || process.env.EXPECTED_HEAD_SHA || '').trim().toLowerCase();
const chiefSha = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_SHA || '').trim().toLowerCase();
const fcrBranch = String(process.env.FCR_FEDERATED_RELAY_SOURCE_BRANCH || process.env.TARGET_BRANCH || 'main').trim();
const chiefBranch = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_BRANCH || 'main').trim();
const DELIVERY_ACK_CONTRACT = 'juss/federated-agent-relay-delivery-ack@v3.1';
const SOURCE_ORIGIN_HEADER = 'X-Federated-Relay-Source-Origin';

function fail(message) { throw new Error(`Federated relay v3.1 roundtrip proof failed: ${message}`); }
function requireHttps(name, value) { if (!value.startsWith('https://')) fail(`${name} must be HTTPS.`); }
function assertAuthorityFalse(value, label) {
  if (value?.executionAuthorized !== false || value?.authorityTransferred !== false || value?.approvalCarriedForward !== false) {
    fail(`${label} widened authority.`);
  }
}
async function db(path, { method = 'GET', body, prefer } = {}) {
  if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is required in the FCR-owned proof context.');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) fail(`Supabase ${path} returned ${response.status}: ${String(raw).slice(0, 500)}`);
  return data;
}
async function runtimeVersion(baseUrl, kind) {
  const response = await fetch(`${baseUrl}/version`, { headers: { Accept: 'application/json' }, redirect: 'manual' });
  if (!response.ok) fail(`${kind} /version returned ${response.status}.`);
  return response.json();
}
async function keyQuery(baseUrl, endpoint, member, keyId) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract: FEDERATED_RELAY_KEY_QUERY_V31, member, keyId }),
    redirect: 'manual',
  });
  if (!response.ok) fail(`${member} key query returned ${response.status}.`);
  const result = await response.json();
  assertAuthorityFalse(result, `${member} key query`);
  if (result?.contract !== FEDERATED_RELAY_KEY_QUERY_V31 || !result?.key) fail(`${member} key query returned an invalid contract.`);
  return result.key;
}
async function registerFcrKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = `founder-control-room:relay-v3.1:ci:${randomUUID()}`;
  const validFrom = new Date(Date.now() - 30_000).toISOString();
  const validUntil = new Date(Date.now() + 15 * 60_000).toISOString();
  await db('rpc/federated_relay_v31_register_ephemeral_key', {
    method: 'POST',
    body: {
      p_member: 'founder-control-room', p_key_id: keyId, p_public_key_jwk: publicJwk,
      p_valid_from: validFrom, p_valid_until: validUntil,
    },
  });
  return { pair, keyId, publicJwk, validFrom, validUntil };
}
async function registerObservedKey(key) {
  if (!key || typeof key.member !== 'string' || typeof key.keyId !== 'string' || !key.publicKeyJwk) {
    fail('Observed relay public key is malformed.');
  }
  await db('rpc/federated_relay_v31_register_observed_key', {
    method: 'POST',
    body: {
      p_member: key.member,
      p_key_id: key.keyId,
      p_public_key_jwk: key.publicKeyJwk,
      p_state: key.state,
      p_valid_from: key.validFrom,
      p_valid_until: key.validUntil ?? null,
    },
  });
}
async function reserveRoot(keyId, messageId, chainId, logicalOperationId) {
  const result = await db('rpc/federated_relay_v31_reserve_outbound', {
    method: 'POST',
    body: {
      p_message_id: messageId,
      p_source_member: 'founder-control-room',
      p_source_repository: 'jussray/founder-control-room',
      p_source_branch: fcrBranch,
      p_source_head_sha: fcrSha,
      p_source_key_id: keyId,
      p_target_member: 'chief-ai-machine',
      p_target_repository: 'jussray/chief-ai-machine',
      p_target_branch: chiefBranch,
      p_target_head_sha: chiefSha,
      p_chain_id: chainId,
      p_chain_position: 0,
      p_logical_operation_id: logicalOperationId,
      p_relation_type: 'root',
      p_parent_message_id: null,
      p_predecessor_proof_cookie: FEDERATED_RELAY_GENESIS_COOKIE_V31,
    },
  });
  const row = Array.isArray(result) ? result[0] : result;
  const sequence = Number(row?.source_sequence ?? row);
  if (!Number.isSafeInteger(sequence) || sequence < 0) fail('FCR v3.1 root reservation returned an invalid source sequence.');
  return sequence;
}
async function finalizeRoot(envelope, semanticFingerprint, deliveryFingerprint, successorProofCookie) {
  await db('rpc/federated_relay_v31_finalize_outbound', {
    method: 'POST',
    body: {
      p_message_id: envelope.messageId,
      p_semantic_fingerprint: semanticFingerprint,
      p_delivery_fingerprint: deliveryFingerprint,
      p_successor_proof_cookie: successorProofCookie,
      p_envelope: envelope,
    },
  });
}
async function resolveRoot(messageId, result) {
  await db('rpc/federated_relay_v31_resolve_outbound', {
    method: 'POST',
    body: {
      p_message_id: messageId,
      p_delivery: result.delivery,
      p_receipt: result.receipt,
      p_current_state: result.currentState,
      p_superseded_by_message_id: result.supersededByMessageId ?? null,
    },
  });
}
async function postCanonical(baseUrl, endpoint, envelope, extraHeaders = {}) {
  const canonical = canonicalizeRelayJsonV31(envelope);
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...extraHeaders },
    body: canonical,
    redirect: 'manual',
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) fail(`${endpoint} returned ${response.status}: ${String(text).slice(0, 500)}`);
  return body;
}
async function acknowledgeChiefReply(replyResult) {
  const response = await fetch(`${chiefBaseUrl}/api/federated-relay`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contract: DELIVERY_ACK_CONTRACT,
      messageId: replyResult.receipt.messageId,
      delivery: replyResult.delivery,
      receipt: replyResult.receipt,
      currentState: replyResult.currentState,
      supersededByMessageId: replyResult.supersededByMessageId ?? null,
    }),
    redirect: 'manual',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.resolved !== true) fail(`Chief delivery ACK failed with ${response.status}.`);
  assertAuthorityFalse(body, 'Chief delivery ACK');
  return body;
}

requireHttps('FCR_FEDERATED_RELAY_BASE_URL', fcrBaseUrl);
requireHttps('CHIEF_FEDERATED_RELAY_BASE_URL', chiefBaseUrl);
if (!SHA40.test(fcrSha) || !SHA40.test(chiefSha)) fail('Both exact runtime SHAs are required.');
if (!fcrBranch || !chiefBranch) fail('Both branch identities are required.');

const [fcrVersion, chiefVersion] = await Promise.all([runtimeVersion(fcrBaseUrl, 'FCR'), runtimeVersion(chiefBaseUrl, 'Chief')]);
const observedFcrSha = String(fcrVersion?.gitSha || fcrVersion?.sha || '').trim().toLowerCase();
const observedChiefSha = String(chiefVersion?.gitSha || chiefVersion?.sha || '').trim().toLowerCase();
if (observedFcrSha !== fcrSha) fail(`FCR runtime SHA ${observedFcrSha || 'missing'} does not match expected ${fcrSha}.`);
if (observedChiefSha !== chiefSha) fail(`Chief runtime SHA ${observedChiefSha || 'missing'} does not match expected ${chiefSha}.`);

const fcrKey = await registerFcrKey();
const messageId = randomUUID();
const chainId = randomUUID();
const logicalOperationId = randomUUID();
const sourceSequence = await reserveRoot(fcrKey.keyId, messageId, chainId, logicalOperationId);
const issuedAt = new Date();
const payloadBody = JSON.stringify({ purpose: 'fcr-chief-live-relay-v3.1-proof' });
const unsignedRoot = {
  contract: FEDERATED_AGENT_RELAY_V31,
  messageId,
  ordering: { chainId, sourceSequence, chainPosition: 0, logicalOperationId, relation: { type: 'root' } },
  source: { member: 'founder-control-room', repository: 'jussray/founder-control-room', branch: fcrBranch, headSha: fcrSha },
  target: { member: 'chief-ai-machine', repository: 'jussray/chief-ai-machine', branch: chiefBranch, headSha: chiefSha },
  issuedAt: issuedAt.toISOString(),
  expiresAt: new Date(issuedAt.getTime() + 4 * 60_000).toISOString(),
  nonce: randomUUID(),
  disposition: 'observe',
  subject: 'Exact-head federated relay v3.1 roundtrip proof',
  payload: { contentType: 'application/json', body: payloadBody, sha256: await sha256HexV31(payloadBody) },
  contextFingerprint: await sha256HexV31(`fcr-chief-v31:${fcrSha}:${chiefSha}:${chainId}:${logicalOperationId}`),
  predecessorProofCookie: FEDERATED_RELAY_GENESIS_COOKIE_V31,
  evidence: [
    { locator: { provider: 'github', ref: `jussray/founder-control-room@${fcrSha}` }, state: 'verified' },
    { locator: { provider: 'github', ref: `jussray/chief-ai-machine@${chiefSha}` }, state: 'verified' },
  ],
  supersedesMessageIds: [],
};
const root = await signRelayEnvelopeV31(unsignedRoot, fcrKey.pair.privateKey, fcrKey.keyId);
const rootSemanticFingerprint = await semanticFingerprintV31(root);
const rootDeliveryFingerprint = await deliveryFingerprintV31(root);
const rootSuccessorCookie = await successorProofCookieV31(root, rootDeliveryFingerprint);
await finalizeRoot(root, rootSemanticFingerprint, rootDeliveryFingerprint, rootSuccessorCookie);

const chiefAccepted = await postCanonical(
  chiefBaseUrl,
  '/api/federated-relay',
  root,
  { [SOURCE_ORIGIN_HEADER]: fcrBaseUrl },
);
assertAuthorityFalse(chiefAccepted, 'Chief root acceptance');
if (!['accepted','duplicate'].includes(chiefAccepted?.delivery) || !chiefAccepted?.receipt || !chiefAccepted?.replyEnvelope) fail('Chief did not return durable v3.1 acceptance + reply evidence.');
if (chiefAccepted.receipt.messageId !== messageId || chiefAccepted.receipt.successorProofCookie !== rootSuccessorCookie) fail('Chief root receipt is not bound to the FCR root.');
const chiefReceiptKey = await keyQuery(chiefBaseUrl, '/api/federated-relay', 'chief-ai-machine', chiefAccepted.receipt.signature?.keyId);
await verifyRelayReceiptV31(chiefAccepted.receipt, chiefReceiptKey);
await registerObservedKey(chiefReceiptKey);
await resolveRoot(messageId, chiefAccepted);

const replyCanonical = canonicalizeRelayJsonV31(chiefAccepted.replyEnvelope);
const reply = parseCanonicalRelayJsonV31(replyCanonical);
if (reply.replyToMessageId !== messageId || reply.ordering.relation.type !== 'reply'
  || reply.ordering.relation.parentMessageId !== messageId || reply.ordering.chainId !== chainId
  || reply.ordering.chainPosition !== 1 || reply.predecessorProofCookie !== rootSuccessorCookie) {
  fail('Chief reply lineage is not bound to the accepted FCR root.');
}
const chiefReplyKey = await keyQuery(chiefBaseUrl, '/api/federated-relay', 'chief-ai-machine', reply.signature.keyId);
await registerObservedKey(chiefReplyKey);
const verifiedReply = await verifyRelayEnvelopeV31({ envelope: reply, key: chiefReplyKey });
const fcrAccepted = await postCanonical(fcrBaseUrl, '/api/federated-relay/v3', reply);
assertAuthorityFalse(fcrAccepted, 'FCR reply acceptance');
if (!['accepted','duplicate'].includes(fcrAccepted?.delivery) || !fcrAccepted?.receipt) fail('FCR did not durably accept the Chief v3.1 reply.');
if (fcrAccepted.receipt.messageId !== reply.messageId || fcrAccepted.receipt.successorProofCookie !== verifiedReply.successorProofCookie) fail('FCR receipt is not bound to the Chief reply.');
const fcrReceiptKey = await keyQuery(fcrBaseUrl, '/api/federated-relay/v3', 'founder-control-room', fcrAccepted.receipt.signature?.keyId);
await verifyRelayReceiptV31(fcrAccepted.receipt, fcrReceiptKey);
const firstAck = await acknowledgeChiefReply(fcrAccepted);

const chiefRetry = await postCanonical(
  chiefBaseUrl,
  '/api/federated-relay',
  root,
  { [SOURCE_ORIGIN_HEADER]: fcrBaseUrl },
);
if (chiefRetry?.delivery !== 'duplicate') fail('Chief exact root retry was not classified duplicate.');
if (canonicalizeRelayJsonV31(chiefRetry.replyEnvelope) !== replyCanonical) fail('Chief exact retry did not reproduce the identical durable signed reply.');
const fcrRetry = await postCanonical(fcrBaseUrl, '/api/federated-relay/v3', reply);
if (fcrRetry?.delivery !== 'duplicate') fail('FCR exact reply retry was not classified duplicate.');
if (canonicalizeRelayJsonV31(fcrRetry.receipt) !== canonicalizeRelayJsonV31(fcrAccepted.receipt)) fail('FCR exact retry did not return the original immutable receipt.');
await acknowledgeChiefReply(fcrRetry);

const [rootRows, replyRows, chainRows] = await Promise.all([
  db(`federated_relay_v31_outbox?select=message_id,delivery_status,source_sequence,chain_position&message_id=eq.${encodeURIComponent(messageId)}&limit=1`),
  db(`federated_relay_v31_messages?select=message_id,status,source_sequence,chain_position&message_id=eq.${encodeURIComponent(reply.messageId)}&limit=1`),
  db(`federated_relay_v31_chain_cursors?select=chain_id,last_position,last_message_id,last_origin&chain_id=eq.${encodeURIComponent(chainId)}&limit=1`),
]);
if (!Array.isArray(rootRows) || rootRows[0]?.message_id !== messageId || !['accepted','duplicate'].includes(rootRows[0]?.delivery_status)) fail('FCR durable root outbox is not resolved.');
if (!Array.isArray(replyRows) || replyRows[0]?.message_id !== reply.messageId || replyRows[0]?.status !== 'accepted' || Number(replyRows[0]?.chain_position) !== 1) fail('FCR durable Chief reply row is missing or invalid.');
if (!Array.isArray(chainRows) || Number(chainRows[0]?.last_position) !== 1 || chainRows[0]?.last_message_id !== reply.messageId || chainRows[0]?.last_origin !== 'inbound') fail('FCR v3.1 chain cursor did not finish on the Chief reply.');

const proof = {
  contract: 'juss/federated-agent-roundtrip-proof@v3.1',
  status: 'VERIFIED',
  fcr: { branch: fcrBranch, runtimeSha: fcrSha, baseUrl: fcrBaseUrl, signingKeyId: fcrKey.keyId },
  chief: { branch: chiefBranch, runtimeSha: chiefSha, baseUrl: chiefBaseUrl, signingKeyId: reply.signature.keyId },
  chain: { chainId, logicalOperationId, rootMessageId: messageId, replyMessageId: reply.messageId, finalPosition: 1, finalOrigin: 'inbound' },
  continuity: { rootSuccessorProofCookie: rootSuccessorCookie, replySuccessorProofCookie: verifiedReply.successorProofCookie },
  idempotency: { chiefRootRetry: 'duplicate', identicalChiefReply: true, fcrReplyRetry: 'duplicate', identicalFcrReceipt: true },
  deliveryAck: { firstResolved: firstAck.resolved === true, retryResolved: true },
  authority: { executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false },
};
await writeFile('federated-agent-roundtrip-v31.json', `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
