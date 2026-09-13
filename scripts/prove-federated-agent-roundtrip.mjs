#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import {
  FEDERATED_AGENT_RELAY_CONTRACT,
  acceptFederatedAgentRelay,
  parseFederatedAgentRelayEnvelope,
} from '../src/founder-os-lab/federatedRelay.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const baseUrl = (process.env.CHIEF_FEDERATED_RELAY_BASE_URL || process.argv[2] || '').replace(/\/$/, '');
const expectedChiefSha = (process.env.CHIEF_FEDERATED_RELAY_TARGET_SHA || process.argv[3] || '').trim().toLowerCase();
const sourceSha = (process.env.EXPECTED_HEAD_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim().toLowerCase();

function fail(message) {
  throw new Error(`Federated roundtrip proof failed: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

if (!baseUrl.startsWith('https://')) fail('CHIEF_FEDERATED_RELAY_BASE_URL must be HTTPS.');
if (!SHA40.test(expectedChiefSha)) fail('CHIEF_FEDERATED_RELAY_TARGET_SHA must be an exact 40-character SHA.');
if (!SHA40.test(sourceSha)) fail('FCR source SHA is not exact.');

const versionResponse = await fetch(`${baseUrl}/version`, {
  headers: { Accept: 'application/json' },
  redirect: 'error',
});
if (!versionResponse.ok) fail(`Chief /version returned ${versionResponse.status}.`);
const version = await versionResponse.json();
const observedChiefSha = typeof version?.sha === 'string' ? version.sha.trim().toLowerCase() : '';
if (observedChiefSha !== expectedChiefSha) {
  fail(`Chief runtime SHA ${observedChiefSha || 'missing'} does not match expected ${expectedChiefSha}.`);
}

const messageId = `q4msg:fcr-chief:${sourceSha.slice(0, 12)}:${expectedChiefSha.slice(0, 12)}`;
const contextFingerprint = sha256(`fcr-chief-roundtrip:${sourceSha}:${expectedChiefSha}`);
const proofCookie = `Q4:v1:${sha256(`predecessor:${sourceSha}:${expectedChiefSha}`)}`;
const envelope = {
  contract: FEDERATED_AGENT_RELAY_CONTRACT,
  messageId,
  from: 'founder-control-room',
  to: 'chief-ai-machine',
  sourceRepository: 'jussray/founder-control-room',
  sourceBranch: 'main',
  sourceHeadSha: sourceSha,
  targetRepository: 'jussray/chief-ai-machine',
  targetBranch: 'main',
  targetObservedHeadSha: expectedChiefSha,
  subject: 'Exact-head federated continuity roundtrip',
  payload: 'Reconcile this FCR continuity handoff against Chief runtime truth and return a bound evidence-only reply. Do not carry approval or execution authority.',
  contextFingerprint,
  proofCookie,
  evidenceRefs: [
    `https://github.com/jussray/founder-control-room/commit/${sourceSha}`,
    `https://github.com/jussray/chief-ai-machine/commit/${expectedChiefSha}`,
    `${baseUrl}/version`,
  ],
};

const localOutgoing = parseFederatedAgentRelayEnvelope(envelope);
if (!localOutgoing.ok) fail(`FCR rejected its outgoing envelope: ${localOutgoing.error}`);
const outgoingReceipt = acceptFederatedAgentRelay(localOutgoing.envelope);

const relayResponse = await fetch(`${baseUrl}/api/federated-relay`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(envelope),
  redirect: 'error',
});
if (!relayResponse.ok) {
  const text = await relayResponse.text();
  fail(`Chief relay returned ${relayResponse.status}: ${text.slice(0, 500)}`);
}
const chief = await relayResponse.json();
if (chief?.contract !== FEDERATED_AGENT_RELAY_CONTRACT || chief?.status !== 'accepted') {
  fail('Chief response did not carry the expected relay contract and accepted status.');
}
if (
  chief?.receipt?.executionAuthorized !== false
  || chief?.receipt?.authorityTransferred !== false
  || chief?.receipt?.approvalCarriedForward !== false
) fail('Chief response widened authority.');
if (chief?.receipt?.messageFingerprint !== outgoingReceipt.messageFingerprint) {
  fail('Chief and FCR computed different outgoing message fingerprints.');
}
if (chief?.receipt?.successorProofCookie !== outgoingReceipt.successorProofCookie) {
  fail('Chief and FCR computed different successor proof cookies.');
}

const parsedReply = parseFederatedAgentRelayEnvelope(chief?.replyEnvelope);
if (!parsedReply.ok) fail(`FCR rejected Chief reply: ${parsedReply.error}`);
const reply = parsedReply.envelope;
if (reply.replyToMessageId !== messageId) fail('Chief reply is not bound to the outgoing message ID.');
if (reply.from !== 'chief-ai-machine' || reply.to !== 'founder-control-room') fail('Chief reply direction is invalid.');
if (reply.sourceHeadSha !== expectedChiefSha || reply.targetObservedHeadSha !== sourceSha) {
  fail('Chief reply exact-head binding drifted.');
}
if (reply.contextFingerprint !== outgoingReceipt.messageFingerprint) fail('Chief reply context fingerprint drifted.');
if (reply.proofCookie !== outgoingReceipt.successorProofCookie) fail('Chief reply predecessor cookie drifted.');

const replyReceipt = acceptFederatedAgentRelay(reply);
const proof = {
  contract: 'juss/federated-agent-roundtrip-proof@v1',
  status: 'VERIFIED',
  fcrSourceSha: sourceSha,
  chiefRuntimeSha: expectedChiefSha,
  chiefRuntimeVersionId: typeof version?.version_id === 'string' ? version.version_id : null,
  outgoing: {
    messageId,
    messageFingerprint: outgoingReceipt.messageFingerprint,
    predecessorProofCookie: proofCookie,
    successorProofCookie: outgoingReceipt.successorProofCookie,
  },
  reply: {
    messageId: reply.messageId,
    replyToMessageId: reply.replyToMessageId,
    messageFingerprint: replyReceipt.messageFingerprint,
    predecessorProofCookie: reply.proofCookie,
    successorProofCookie: replyReceipt.successorProofCookie,
  },
  authority: {
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
  },
  evidenceRefs: reply.evidenceRefs,
};

await writeFile('federated-agent-roundtrip.json', `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
