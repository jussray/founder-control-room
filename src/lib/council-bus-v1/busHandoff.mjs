/**
 * Pure Council -> Council Bus handoff, with no network, persistence, callbacks,
 * provider invocation, or execution authority. Council Bus ENG-7 owns those.
 * Route IDs are symbolic names, deliberately NOT arbitrary callback URLs.
 */
import {fingerprint, verifyCouncil, verifyCourt} from './council.mjs';

export const BUS_HANDOFF_CONTRACT = 'juss/ultrathink-council-bus-handoff@v1';
const TOKEN = /^[a-z][a-z0-9-]{0,79}$/;
const EXACT = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every(key => keys.includes(key));
function ensure(check, message) { if (!check) throw new Error(message); }
function copyJson(value) { return JSON.parse(JSON.stringify(value)); }
const ORIGIN_KEYS = ['agent', 'route', 'threadId', 'correlationId'];
const HANDOFF_KEYS = ['contract', 'origin', 'councilRound', 'councilFingerprint',
  'courtFingerprint', 'decisionStatus', 'idempotencyKey', 'deliveryStatus',
  'authority', 'fingerprint'];

function validateOrigin(origin) {
  ensure(EXACT(origin, ORIGIN_KEYS), 'Invalid Bus origin fields');
  for (const key of ORIGIN_KEYS) {
    ensure(typeof origin[key] === 'string' && TOKEN.test(origin[key]), `Invalid Bus ${key}`);
  }
}

/** This contains references only; no raw deliberation or private content is
 * emitted. A policy-authorized owner must supply separately scoped payloads.
 */
export function prepareCouncilBusHandoff({council, court, origin}) {
  verifyCouncil(council);
  verifyCourt(council, court);
  validateOrigin(origin);
  const metadata = {
    contract: BUS_HANDOFF_CONTRACT,
    origin: copyJson(origin),
    councilRound: council.roundId,
    councilFingerprint: council.fingerprint,
    courtFingerprint: court.fingerprint,
    decisionStatus: court.verdict,
  };
  const idempotencyKey = fingerprint(metadata);
  const record = {
    ...metadata, idempotencyKey,
    deliveryStatus: 'PREPARED_NOT_SENT',
    authority: {decisionOwner:'founder', grantsExecutionAuthority:false},
  };
  return {...record, fingerprint:fingerprint(record)};
}

/** Verifies local shape and deterministic linkage only. The receiving Bus must
 * authenticate the caller and origin, deduplicate idempotencyKey, verify callback
 * signatures, impose resource bounds, and record actual delivery evidence.
 */
export function verifyCouncilBusHandoff({council, court, handoff}) {
  verifyCourt(council, court);
  ensure(EXACT(handoff, HANDOFF_KEYS), 'Invalid Bus handoff fields');
  validateOrigin(handoff.origin);
  // Bind the provided complete payload to its claimed digest BEFORE comparing
  // with the deterministic expected handoff. Comparing expected to a claimed
  // digest alone allowed an un-fingerprinted deliveryStatus edit to pass.
  const {fingerprint: claimed, ...provided} = handoff;
  ensure(fingerprint(provided) === claimed,
    'Bus handoff payload fingerprint mismatch');
  const expected = prepareCouncilBusHandoff({council, court, origin:handoff.origin});
  ensure(expected.fingerprint === claimed,
    'Bus handoff fingerprint or contract mismatch');
  // Both records are canonical-hashed. Key insertion order is not authority
  // and must not invalidate a legitimate JSON decode/re-encode.
  return true;
}