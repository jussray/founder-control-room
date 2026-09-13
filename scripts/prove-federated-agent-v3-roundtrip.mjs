import { createClient } from '@supabase/supabase-js';
import {
  FEDERATED_AGENT_RELAY_V3,
  canonicalizeRelayJsonV3,
  parseFederatedAgentRelayEnvelopeV3,
  sha256HexV3,
  signRelayEnvelopeV3,
  verifyRelayEnvelopeV3,
} from '../dist/founder-os-lab/federatedRelayV3.js';

const FCR_REPOSITORY = 'jussray/founder-control-room';
const CHIEF_REPOSITORY = 'jussray/chief-ai-machine';
const DEFAULT_FCR_BASE_URL = 'https://api.foundercontrolroom.org';
const DEFAULT_CHIEF_BASE_URL = 'https://chief-ai.mcgill-raylene.workers.dev';
const FULL_SHA = /^[0-9a-f]{40}$/;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function baseUrl(name, fallback) {
  const value = String(process.env[name] || fallback).trim().replace(/\/$/, '');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must be one HTTPS origin/base URL`);
  }
  return value;
}

function parsePrivateJwk(name) {
  let jwk;
  try { jwk = JSON.parse(required(name)); } catch { throw new Error(`${name} must be valid JWK JSON`); }
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.d !== 'string' || typeof jwk.x !== 'string') {
    throw new Error(`${name} must be an Ed25519 private JWK`);
  }
  return jwk;
}

function publicJwk(privateJwk) {
  return { kty: 'OKP', crv: 'Ed25519', x: privateJwk.x };
}

function chiefAccessHeaders() {
  const id = String(process.env.CLOUDFLARE_ACCESS_CLIENT_ID || '').trim();
  const secret = String(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET || '').trim();
  if (Boolean(id) !== Boolean(secret)) throw new Error('Cloudflare Access client id/secret must be configured together');
  return id ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname} failed with ${response.status}: ${String(text).slice(0, 500)}`);
  return body;
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) throw new Error(`POST ${new URL(url).pathname} failed with ${response.status}: ${String(text).slice(0, 1000)}`);
  return { status: response.status, body: parsed };
}

async function ensurePublicKey(client, { member, keyId, publicKeyJwk, validFrom }) {
  const { data, error } = await client
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', keyId)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    if (data.member !== member || data.algorithm !== 'Ed25519' || canonicalizeRelayJsonV3(data.public_key_jwk) !== canonicalizeRelayJsonV3(publicKeyJwk)) {
      throw new Error(`relay key id collision for ${keyId}`);
    }
    if (data.state === 'revoked' || data.revoked_at) throw new Error(`relay key ${keyId} is revoked`);
    return;
  }
  const { error: insertError } = await client.from('federated_relay_public_keys').insert({
    member,
    key_id: keyId,
    algorithm: 'Ed25519',
    public_key_jwk: publicKeyJwk,
    state: 'active',
    valid_from: validFrom,
  });
  if (insertError) throw insertError;
}

async function reserveSequence(client, member, keyId) {
  const { data, error } = await client.rpc('federated_relay_reserve_sequence_v3', {
    p_member: member,
    p_key_id: keyId,
  });
  if (error) throw error;
  const sequence = Number(Array.isArray(data) ? data[0] : data);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('invalid relay source-sequence reservation');
  return sequence;
}

async function loadKey(client, keyId) {
  const { data, error } = await client
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', keyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`relay public key not found: ${keyId}`);
  return {
    member: data.member,
    keyId: data.key_id,
    publicKeyJwk: data.public_key_jwk,
    state: data.state,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
    revokedAt: data.revoked_at,
  };
}

async function main() {
  const fcrBase = baseUrl('FCR_FEDERATED_RELAY_BASE_URL', DEFAULT_FCR_BASE_URL);
  const chiefBase = baseUrl('CHIEF_FEDERATED_RELAY_BASE_URL', DEFAULT_CHIEF_BASE_URL);
  const accessHeaders = chiefAccessHeaders();
  const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const fcrPrivateJwk = parsePrivateJwk('FCR_FEDERATED_RELAY_PRIVATE_JWK');
  const fcrKeyId = required('FCR_FEDERATED_RELAY_KEY_ID');
  const keyValidFrom = String(process.env.FCR_FEDERATED_RELAY_KEY_VALID_FROM || '2026-09-13T00:00:00.000Z').trim();
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const [fcrVersion, chiefVersion] = await Promise.all([
    getJson(`${fcrBase}/version`),
    getJson(`${chiefBase}/version`, accessHeaders),
  ]);
  const fcrSha = String(fcrVersion?.gitSha || '').trim().toLowerCase();
  const chiefSha = String(chiefVersion?.sha || '').trim().toLowerCase();
  if (!FULL_SHA.test(fcrSha)) throw new Error('FCR /version did not expose exact gitSha');
  if (!FULL_SHA.test(chiefSha)) throw new Error('Chief /version did not expose exact sha');
  const expectedFcrSha = String(process.env.EXPECTED_FCR_SHA || '').trim().toLowerCase();
  const expectedChiefSha = String(process.env.EXPECTED_CHIEF_SHA || '').trim().toLowerCase();
  if (expectedFcrSha && expectedFcrSha !== fcrSha) throw new Error(`FCR runtime moved: expected ${expectedFcrSha}, observed ${fcrSha}`);
  if (expectedChiefSha && expectedChiefSha !== chiefSha) throw new Error(`Chief runtime moved: expected ${expectedChiefSha}, observed ${chiefSha}`);

  await ensurePublicKey(client, {
    member: 'founder-control-room',
    keyId: fcrKeyId,
    publicKeyJwk: publicJwk(fcrPrivateJwk),
    validFrom: keyValidFrom,
  });
  const sourceSequence = await reserveSequence(client, 'founder-control-room', fcrKeyId);
  const messageId = crypto.randomUUID();
  const chainId = crypto.randomUUID();
  const logicalOperationId = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
  const payloadBody = JSON.stringify({
    purpose: 'fcr-chief-federated-relay-v3-roundtrip-proof',
    observation: 'Signed evidence-only continuity roundtrip.',
  });
  const contextFingerprint = await sha256HexV3(`${fcrSha}:${chiefSha}:${chainId}:${logicalOperationId}`);
  const predecessorProofCookie = `Q4R:v3:root:${await sha256HexV3(`${messageId}:${contextFingerprint}`)}`;
  const unsignedRoot = {
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
      repository: FCR_REPOSITORY,
      branch: 'main',
      headSha: fcrSha,
    },
    target: {
      member: 'chief-ai-machine',
      repository: CHIEF_REPOSITORY,
      branch: 'main',
      headSha: chiefSha,
    },
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce,
    disposition: 'observe',
    subject: 'FCR → Chief → FCR durable relay v3 proof',
    payload: {
      contentType: 'application/json',
      body: payloadBody,
      sha256: await sha256HexV3(payloadBody),
    },
    contextFingerprint,
    predecessorProofCookie,
    evidence: [
      { ref: `github://jussray/founder-control-room@${fcrSha}`, state: 'verified' },
      { ref: `github://jussray/chief-ai-machine@${chiefSha}`, state: 'verified' },
    ],
    supersedesMessageIds: [],
  };
  const rootEnvelope = await signRelayEnvelopeV3(unsignedRoot, fcrPrivateJwk, fcrKeyId);

  const first = await postJson(`${chiefBase}/api/federated-relay/v3`, rootEnvelope, accessHeaders);
  if (first.status !== 201 || first.body?.status !== 'accepted') throw new Error('Chief did not durably accept first relay delivery');
  if (first.body?.receipt?.executionAuthorized !== false) throw new Error('Chief receipt widened execution authority');
  const replyEnvelope = parseFederatedAgentRelayEnvelopeV3(first.body?.replyEnvelope);
  if (replyEnvelope.replyToMessageId !== messageId || replyEnvelope.ordering.chainPosition !== 1) {
    throw new Error('Chief reply lineage is not exactly parent + 1');
  }
  const chiefKey = await loadKey(client, replyEnvelope.signature.keyId);
  const verifiedReply = await verifyRelayEnvelopeV3({
    envelope: replyEnvelope,
    key: chiefKey,
    expectedTarget: {
      member: 'founder-control-room',
      repository: FCR_REPOSITORY,
      branch: 'main',
      headSha: fcrSha,
    },
  });
  if (verifiedReply.receipt.predecessorProofCookie !== first.body.receipt.successorProofCookie) {
    throw new Error('Chief reply proof-cookie continuity drifted');
  }

  const fcrAccept = await postJson(`${fcrBase}/api/federated-relay/v3`, replyEnvelope);
  if (fcrAccept.status !== 201 || fcrAccept.body?.outcome !== 'accepted') throw new Error('FCR did not durably accept Chief reply');

  const retry = await postJson(`${chiefBase}/api/federated-relay/v3`, rootEnvelope, accessHeaders);
  if (retry.status !== 200 || retry.body?.status !== 'duplicate') throw new Error('Chief exact retry was not idempotent duplicate delivery');
  if (canonicalizeRelayJsonV3(retry.body.replyEnvelope) !== canonicalizeRelayJsonV3(replyEnvelope)) {
    throw new Error('Chief exact retry did not reproduce identical signed reply bytes');
  }
  const fcrRetry = await postJson(`${fcrBase}/api/federated-relay/v3`, retry.body.replyEnvelope);
  if (fcrRetry.status !== 200 || fcrRetry.body?.outcome !== 'duplicate') throw new Error('FCR exact reply retry was not idempotent');

  const { data: chainRows, error: chainError } = await client
    .from('federated_relay_messages')
    .select('message_id,chain_position,source_member,source_sequence,status,message_fingerprint')
    .eq('chain_id', chainId)
    .order('chain_position', { ascending: true });
  if (chainError) throw chainError;
  if (!Array.isArray(chainRows) || chainRows.length !== 2) throw new Error(`Expected exactly 2 durable chain rows, observed ${chainRows?.length ?? 0}`);
  if (chainRows[0].chain_position !== 0 || chainRows[0].source_member !== 'founder-control-room') throw new Error('Durable root row drifted');
  if (chainRows[1].chain_position !== 1 || chainRows[1].source_member !== 'chief-ai-machine') throw new Error('Durable reply row drifted');

  console.log(JSON.stringify({
    contract: FEDERATED_AGENT_RELAY_V3,
    status: 'verified',
    fcrRuntimeSha: fcrSha,
    chiefRuntimeSha: chiefSha,
    chainId,
    logicalOperationId,
    rootMessageId: messageId,
    replyMessageId: replyEnvelope.messageId,
    rootSourceSequence: sourceSequence,
    chiefSourceSequence: replyEnvelope.ordering.sourceSequence,
    chainPositions: chainRows.map((row) => row.chain_position),
    exactRetryIdempotent: true,
    identicalReplyOnRetry: true,
    durableRows: chainRows.length,
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
