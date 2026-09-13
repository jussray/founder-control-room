#!/usr/bin/env node
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  FEDERATED_AGENT_RELAY_V3,
  canonicalizeRelayJsonV3,
  parseFederatedAgentRelayEnvelopeV3,
  verifyRelayEnvelopeV3,
} from '../dist/founder-os-lab/federatedRelayV3.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const SUPABASE_URL = (process.env.FCR_RELAY_SUPABASE_URL || 'https://oojzfmmywbvficgybaxd.supabase.co').replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const fcrBaseUrl = (process.env.FCR_FEDERATED_RELAY_BASE_URL || 'https://api.foundercontrolroom.org').replace(/\/$/, '');
const chiefBaseUrl = String(process.env.CHIEF_FEDERATED_RELAY_BASE_URL || '').replace(/\/$/, '');
const expectedFcrSha = String(process.env.FCR_FEDERATED_RELAY_SOURCE_SHA || process.env.EXPECTED_HEAD_SHA || '').trim().toLowerCase();
const expectedChiefSha = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_SHA || '').trim().toLowerCase();
const fcrBranch = String(process.env.FCR_FEDERATED_RELAY_SOURCE_BRANCH || process.env.TARGET_BRANCH || 'main').trim();
const chiefBranch = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_BRANCH || 'main').trim();

function fail(message) {
  throw new Error(`Federated relay v3 roundtrip proof failed: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireHttps(name, value) {
  if (!value.startsWith('https://')) fail(`${name} must be HTTPS.`);
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function db(path, { method = 'GET', body, prefer } = {}) {
  if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is required in the FCR-owned proof context.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  const response = await fetch(`${baseUrl}/version`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  if (!response.ok) {
    const location = response.headers.get('location');
    const suffix = location ? `; redirect=${new URL(location, baseUrl).host}` : '';
    fail(`${kind} /version returned ${response.status}${suffix}.`);
  }
  return response.json();
}

async function registerEphemeralFcrKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = `founder-control-room:relay-v3:ci:${randomUUID()}`;
  const validFrom = new Date(Date.now() - 30_000).toISOString();
  const validUntil = new Date(Date.now() + 15 * 60_000).toISOString();

  await db('federated_relay_public_keys', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      member: 'founder-control-room',
      key_id: keyId,
      algorithm: 'Ed25519',
      public_key_jwk: publicJwk,
      state: 'active',
      valid_from: validFrom,
      valid_until: validUntil,
    },
  });

  return { keyId, privateKey: pair.privateKey, publicJwk, validFrom, validUntil };
}

async function reserveFcrSequence(keyId) {
  const result = await db('rpc/federated_relay_reserve_sequence_v3', {
    method: 'POST',
    body: { p_member: 'founder-control-room', p_key_id: keyId },
  });
  const raw = Array.isArray(result) ? result[0] : result;
  const value = typeof raw === 'object' && raw !== null && 'source_sequence' in raw
    ? Number(raw.source_sequence)
    : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) fail('FCR source-sequence reservation returned an invalid value.');
  return value;
}

async function loadPublicKey(keyId) {
  const rows = await db(
    `federated_relay_public_keys?select=member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at&key_id=eq.${encodeURIComponent(keyId)}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) fail(`relay public key not found: ${keyId}`);
  return {
    member: row.member,
    keyId: row.key_id,
    publicKeyJwk: row.public_key_jwk,
    state: row.state,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    revokedAt: row.revoked_at,
  };
}

async function signEnvelope(unsigned, privateKey, keyId) {
  const signature = await webcrypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(canonicalizeRelayJsonV3(unsigned)),
  );
  return {
    ...unsigned,
    signature: {
      algorithm: 'Ed25519',
      keyId,
      valueBase64Url: base64Url(new Uint8Array(signature)),
    },
  };
}

requireHttps('FCR_FEDERATED_RELAY_BASE_URL', fcrBaseUrl);
requireHttps('CHIEF_FEDERATED_RELAY_BASE_URL', chiefBaseUrl);
if (!SHA40.test(expectedFcrSha)) fail('FCR_FEDERATED_RELAY_SOURCE_SHA must be an exact 40-character SHA.');
if (!SHA40.test(expectedChiefSha)) fail('CHIEF_FEDERATED_RELAY_TARGET_SHA must be an exact 40-character SHA.');
if (!fcrBranch || !chiefBranch) fail('Both FCR and Chief branch identities are required.');

const [fcrVersion, chiefVersion] = await Promise.all([
  runtimeVersion(fcrBaseUrl, 'FCR'),
  runtimeVersion(chiefBaseUrl, 'Chief'),
]);
const observedFcrSha = String(fcrVersion?.gitSha || fcrVersion?.sha || '').trim().toLowerCase();
const observedChiefSha = String(chiefVersion?.sha || '').trim().toLowerCase();
if (observedFcrSha !== expectedFcrSha) fail(`FCR runtime SHA ${observedFcrSha || 'missing'} does not match expected ${expectedFcrSha}.`);
if (observedChiefSha !== expectedChiefSha) fail(`Chief runtime SHA ${observedChiefSha || 'missing'} does not match expected ${expectedChiefSha}.`);

const fcrKey = await registerEphemeralFcrKey();
const sourceSequence = await reserveFcrSequence(fcrKey.keyId);
const messageId = randomUUID();
const chainId = randomUUID();
const logicalOperationId = randomUUID();
const issuedAt = new Date();
const payloadBody = JSON.stringify({ purpose: 'fcr-chief-live-relay-v3-proof' });
const contextFingerprint = sha256(`fcr-chief-v3:${expectedFcrSha}:${expectedChiefSha}:${chainId}:${logicalOperationId}`);
const predecessorProofCookie = `Q4R:v3:root:${sha256(`${messageId}:${contextFingerprint}`)}`;

const unsigned = {
  contract: FEDERATED_AGENT_RELAY_V3,
  messageId,
  ordering: {
    chainId,
    sourceSequence,
    chainPosition: 0,
    logicalOperationId,
  },
  source: {
    member: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    branch: fcrBranch,
    headSha: expectedFcrSha,
  },
  target: {
    member: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    branch: chiefBranch,
    headSha: expectedChiefSha,
  },
  issuedAt: issuedAt.toISOString(),
  expiresAt: new Date(issuedAt.getTime() + 5 * 60_000).toISOString(),
  nonce: randomUUID(),
  disposition: 'observe',
  subject: 'Exact-head federated relay v3 roundtrip proof',
  payload: {
    contentType: 'application/json',
    body: payloadBody,
    sha256: sha256(payloadBody),
  },
  contextFingerprint,
  predecessorProofCookie,
  evidence: [
    { ref: `github://jussray/founder-control-room@${expectedFcrSha}`, state: 'verified' },
    { ref: `github://jussray/chief-ai-machine@${expectedChiefSha}`, state: 'verified' },
  ],
  supersedesMessageIds: [],
};

const outgoing = parseFederatedAgentRelayEnvelopeV3(await signEnvelope(unsigned, fcrKey.privateKey, fcrKey.keyId));

const chiefAccept = await fetch(`${chiefBaseUrl}/api/federated-relay/v3`, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(outgoing),
  redirect: 'manual',
});
if (chiefAccept.status !== 201) {
  const text = await chiefAccept.text();
  const location = chiefAccept.headers.get('location');
  const suffix = location ? `; redirect=${new URL(location, chiefBaseUrl).host}` : '';
  fail(`Chief relay returned ${chiefAccept.status}${suffix}: ${text.slice(0, 500)}`);
}
const chiefAccepted = await chiefAccept.json();
if (chiefAccepted?.status !== 'accepted') fail('Chief did not durably accept the FCR envelope.');
if (
  chiefAccepted?.receipt?.executionAuthorized !== false
  || chiefAccepted?.receipt?.authorityTransferred !== false
  || chiefAccepted?.receipt?.approvalCarriedForward !== false
) fail('Chief receipt widened authority.');

const reply = parseFederatedAgentRelayEnvelopeV3(chiefAccepted.replyEnvelope);
if (reply.replyToMessageId !== messageId) fail('Chief reply is not bound to the FCR message ID.');
if (reply.ordering.chainId !== chainId || reply.ordering.chainPosition !== 1) fail('Chief reply chain ordering drifted.');
if (reply.predecessorProofCookie !== chiefAccepted.receipt.successorProofCookie) fail('Chief reply predecessor proof cookie drifted.');
const chiefKey = await loadPublicKey(reply.signature.keyId);
const verifiedReply = await verifyRelayEnvelopeV3({
  envelope: reply,
  key: chiefKey,
  expectedTarget: {
    member: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    branch: fcrBranch,
    headSha: expectedFcrSha,
  },
});
if (
  verifiedReply.receipt.executionAuthorized !== false
  || verifiedReply.receipt.authorityTransferred !== false
  || verifiedReply.receipt.approvalCarriedForward !== false
) fail('FCR verification of Chief reply widened authority.');

const fcrAccept = await fetch(`${fcrBaseUrl}/api/federated-relay/v3`, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(reply),
  redirect: 'manual',
});
if (fcrAccept.status !== 201) {
  const text = await fcrAccept.text();
  fail(`FCR relay receiver returned ${fcrAccept.status}: ${text.slice(0, 500)}`);
}
const fcrAccepted = await fcrAccept.json();
if (fcrAccepted?.outcome !== 'accepted') fail('FCR did not durably accept the Chief reply.');

const chiefRetry = await fetch(`${chiefBaseUrl}/api/federated-relay/v3`, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(outgoing),
  redirect: 'manual',
});
if (chiefRetry.status !== 200) fail(`Chief exact retry returned ${chiefRetry.status}, expected idempotent 200.`);
const chiefDuplicate = await chiefRetry.json();
if (chiefDuplicate?.status !== 'duplicate') fail('Chief exact retry was not classified duplicate.');
if (canonicalizeRelayJsonV3(chiefDuplicate.replyEnvelope) !== canonicalizeRelayJsonV3(reply)) {
  fail('Chief exact retry did not reproduce the identical signed reply.');
}

const fcrRetry = await fetch(`${fcrBaseUrl}/api/federated-relay/v3`, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(reply),
  redirect: 'manual',
});
if (fcrRetry.status !== 200) fail(`FCR exact retry returned ${fcrRetry.status}, expected idempotent 200.`);
const fcrDuplicate = await fcrRetry.json();
if (fcrDuplicate?.outcome !== 'duplicate') fail('FCR exact retry was not classified duplicate.');

const chainRows = await db(
  `federated_relay_messages?select=message_id,chain_position,source_member,source_sequence,status&chain_id=eq.${encodeURIComponent(chainId)}&order=chain_position.asc`,
);
if (!Array.isArray(chainRows) || chainRows.length !== 2) fail(`Durable relay chain expected 2 rows, observed ${Array.isArray(chainRows) ? chainRows.length : 'non-array'}.`);
if (chainRows[0]?.message_id !== messageId || chainRows[0]?.source_member !== 'founder-control-room' || Number(chainRows[0]?.chain_position) !== 0) {
  fail('Durable FCR root row does not match the accepted outgoing envelope.');
}
if (chainRows[1]?.message_id !== reply.messageId || chainRows[1]?.source_member !== 'chief-ai-machine' || Number(chainRows[1]?.chain_position) !== 1) {
  fail('Durable Chief reply row does not match the accepted reply envelope.');
}

const proof = {
  contract: 'juss/federated-agent-roundtrip-proof@v3',
  status: 'VERIFIED',
  fcr: {
    branch: fcrBranch,
    runtimeSha: expectedFcrSha,
    baseUrl: fcrBaseUrl,
    keyId: fcrKey.keyId,
    keyValidUntil: fcrKey.validUntil,
  },
  chief: {
    branch: chiefBranch,
    runtimeSha: expectedChiefSha,
    versionId: typeof chiefVersion?.version_id === 'string' ? chiefVersion.version_id : null,
    baseUrl: chiefBaseUrl,
    keyId: reply.signature.keyId,
  },
  chain: {
    chainId,
    logicalOperationId,
    outgoingMessageId: messageId,
    replyMessageId: reply.messageId,
    rows: chainRows,
  },
  continuity: {
    outgoingSuccessorProofCookie: chiefAccepted.receipt.successorProofCookie,
    replySuccessorProofCookie: verifiedReply.receipt.successorProofCookie,
  },
  idempotency: {
    chiefRetry: 'duplicate',
    fcrRetry: 'duplicate',
    identicalChiefReply: true,
  },
  authority: {
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
  },
};

await writeFile('federated-agent-roundtrip.json', `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
