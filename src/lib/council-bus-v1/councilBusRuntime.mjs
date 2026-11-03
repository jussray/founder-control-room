/**
 * Embedded Council Bus return-to-origin delivery adapter.
 *
 * This is an opt-in *library* seam, NOT an HTTP server or a hosted service.
 * All external effects are supplied by the owning, authenticated runtime.
 * It never supplies credentials, callback URLs, provider clients, or storage.
 */
import {verifyCouncilBusHandoff} from './busHandoff.mjs';

export const EMBEDDED_BUS_CONTRACT = 'juss/embedded-council-bus@v1';
export const BUS_STAGES = Object.freeze(['ingress', 'dispatch', 'egress']);
const IDENTIFIER = /^[a-z][a-z0-9-]{0,79}$/;
const RECEIPT = /^[A-Za-z0-9_-]{1,128}$/;
const SHA = /^[a-f0-9]{64}$/;
const check = (condition, message) => {if (!condition) throw new Error(message);};

function checkPorts(ports) {
  check(ports && typeof ports === 'object' && !Array.isArray(ports), 'Bus ports required');
  for (const key of ['enabled', 'authenticate', 'authorize', 'deliver', 'verifyAck']) {
    check(typeof ports[key] === 'function', 'Missing required Bus port: ' + key);
  }
  check(ports.journal && typeof ports.journal === 'object', 'Durable Bus journal required');
  for (const key of ['claimOnce', 'finish', 'read']) {
    check(typeof ports.journal[key] === 'function', 'Missing journal port: ' + key);
  }
}

async function enabled(ports, stage) {
  // Exact true required; missing/stale/error state fails closed.
  check(BUS_STAGES.includes(stage) && await ports.enabled(stage) === true,
    'Council Bus stage disabled: ' + stage);
}

function assertPrincipal(principal) {
  check(principal && typeof principal === 'object' && !Array.isArray(principal) &&
    principal.authenticated === true &&
    typeof principal.subject === 'string' && IDENTIFIER.test(principal.subject) &&
    typeof principal.tenant === 'string' && IDENTIFIER.test(principal.tenant),
    'Bus caller not independently authenticated by owning runtime');
}

function returnPacket(handoff) {
  // Only metadata is returned, NEVER findings, secrets, transcripts, or
  // a permission to deploy/merge/publish/spend. No callback URL is accepted.
  return Object.freeze({
    contract: EMBEDDED_BUS_CONTRACT,
    type: 'COUNCIL_INFORMATION_ONLY',
    idempotencyKey: handoff.idempotencyKey,
    correlationId: handoff.origin.correlationId,
    councilRound: handoff.councilRound,
    councilFingerprint: handoff.councilFingerprint,
    courtFingerprint: handoff.courtFingerprint,
    verdict: handoff.decisionStatus,
    grantsExecutionAuthority: false,
  });
}

/**
 * Ports are injected by the application and MUST be trustworthy:
 * enabled(stage) reads a server-owned flag (not a prompt).
 * authenticate({caller,origin}) proves signed/session caller identity.
 * authorize({principal,origin,scope}) enforces route AND tenant permission.
 * journal.claimOnce({key,origin,tenant}) MUST atomically persist a durable claim;
 *   it returns true only for the newly claimed key, false for duplicates.
 * deliver({route,agent,threadId,packet,signal}) uses an allowlisted route.
 * verifyAck({ack,principal,origin,key}) verifies a real signed origin ACK.
 * journal.finish({key,status,receiptId,correlationId}) persists the outcome.
 * journal.read(key) reads the durable record back independently.
 *
 * A mocked port can prove API behavior, NOT deployed delivery or authenticity.
 * The owning process must implement its own retry/leases, upstream timeouts,
 * rate/spend limits, secret storage, and provider cancellation.
 */
export async function runEmbeddedCouncilBus({council, court, handoff, caller, ports, signal} = {}) {
  // Re-verify policy before accessing any external adapter or persisted state.
  verifyCouncilBusHandoff({council, court, handoff});
  checkPorts(ports);
  const key = handoff.idempotencyKey;
  check(typeof key === 'string' && SHA.test(key), 'Invalid Bus idempotency key');
  // HOLD cannot become actionable delivery merely by enabling the Bus.
  if (court.verdict !== 'READY_FOR_EXTERNAL_VERIFICATION') {
    return Object.freeze({status:'COURT_HOLD', idempotencyKey:key, delivered:false});
  }
  await enabled(ports, 'ingress');
  const principal = await ports.authenticate({caller, origin:handoff.origin});
  assertPrincipal(principal);
  check(await ports.authorize({
    principal, origin:handoff.origin, scope:'council-bus:return-to-origin',
  }) === true, 'Bus origin/tenant authorization denied');
  await enabled(ports, 'dispatch');
  check(signal === undefined || (signal && typeof signal === 'object' &&
    typeof signal.aborted === 'boolean'), 'Invalid Bus AbortSignal');
  check(!signal?.aborted, 'Bus operation aborted');

  // Claim-before-send. A durable atomic implementation is mandatory, never
  // a process-local Set in production. Retried requests cannot send twice.
  const claimed = await ports.journal.claimOnce({
    key, origin:structuredClone(handoff.origin), tenant:principal.tenant,
  });
  check(typeof claimed === 'boolean', 'Bus journal claim returned invalid state');
  if (!claimed) return Object.freeze({status:'DUPLICATE_NOT_SENT',idempotencyKey:key,delivered:false});

  await enabled(ports, 'egress');
  check(!signal?.aborted, 'Bus operation aborted');
  const packet=returnPacket(handoff);
  // Recheck immediately before the only side-effecting adapter call.
  await enabled(ports, 'egress');
  const ack=await ports.deliver({
    route:handoff.origin.route,
    agent:handoff.origin.agent,
    threadId:handoff.origin.threadId,
    packet,
    signal,
  });
  // A response body containing the word "ACK" is not sufficient;
  // owning application MUST check the signature/receiving identity.
  check(ack && typeof ack === 'object' && !Array.isArray(ack) &&
    ack.status === 'ACK' && ack.idempotencyKey === key &&
    ack.correlationId === handoff.origin.correlationId &&
    typeof ack.receiptId === 'string' && RECEIPT.test(ack.receiptId),
    'Invalid Bus delivery ACK');
  check(await ports.verifyAck({ack,principal,origin:handoff.origin,key}) === true,
    'Bus ACK signature/receiver verification rejected');
  const receipt={key,status:'ACK_REPORTED_BY_TRUSTED_PORT',
    receiptId:ack.receiptId,correlationId:handoff.origin.correlationId};
  await ports.journal.finish(receipt);
  const readback=await ports.journal.read(key);
  check(readback && readback.key === key &&
    readback.status === receipt.status &&
    readback.receiptId === receipt.receiptId &&
    readback.correlationId === receipt.correlationId,
    'Bus journal readback mismatch; delivery outcome unverified');
  return Object.freeze({
    status:receipt.status,idempotencyKey:key,
    receiptId:ack.receiptId, delivered:true,
    authorityGranted:false,
  });
}
