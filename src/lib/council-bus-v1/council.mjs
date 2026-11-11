import { createHash } from 'node:crypto';

export const COUNCIL_CONTRACT = 'juss/ultrathink-council@v1';
export const COURT_CONTRACT = 'juss/founder-court-record@v1';
export const STATUSES = Object.freeze(['VERIFIED', 'INFERRED', 'UNKNOWN', 'BLOCKED', 'FAIL']);
export const WITNESSES = Object.freeze(['repository_source', 'ci_receipt', 'provider_readback', 'runtime_identity', 'browser_functional', 'browser_visual', 'independent_challenger', 'human_observation']);
const ID = /^[a-z][a-z0-9-]{0,79}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ensure(condition, message) { if (!condition) throw new Error(message); }
// Fingerprints are recomputable by anyone who can edit a packet. They are not
// signatures or an approval credential; validate the entire untrusted shape.
function exactFields(value, expected, label) {
  ensure(isObject(value), `Invalid ${label}`);
  const actual = Object.keys(value);
  ensure(actual.length === expected.length && actual.every(key => expected.includes(key)), `Unknown or missing ${label} field`);
}
function nonemptyText(value) { return typeof value === 'string' && Boolean(value.trim()); }
function textArray(value, label) {
  ensure(Array.isArray(value) && value.every(nonemptyText), `Invalid ${label}`);
}
const PROVIDER_STATES = Object.freeze(['UNVERIFIED', 'SIMULATED', 'EXTERNALLY_ATTESTED']);
const PACKET_FIELDS = ['contract', 'roundId', 'sourceRef', 'goal', 'findings', 'independent', 'authority', 'transport', 'fingerprint'];
const SEAT_FIELDS = ['id', 'finding', 'evidenceRefs', 'dissent', 'providerState'];
const AUTHORITY_FIELDS = ['decisionOwner', 'grantsExecutionAuthority'];
const TRANSPORT_FIELDS = ['owner', 'tracking', 'deliveryProof'];
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  throw new Error('Unsupported fingerprint value');
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

/** Pure, non-executing record of independent findings. Neither calls providers nor grants authority. */
export function assembleCouncil(input) {
  ensure(isObject(input), 'Council input required');
  ensure(typeof input.roundId === 'string' && ID.test(input.roundId), 'Invalid round ID');
  ensure(typeof input.goal === 'string' && input.goal.trim(), 'Goal required');
  ensure(Array.isArray(input.seats) && input.seats.length > 0, 'At least one seat required');
  ensure(typeof input.sourceRef === 'string' && input.sourceRef.trim(), 'Source reference required');
  const ids = new Set();
  const findings = input.seats.map(seat => {
    ensure(isObject(seat) && typeof seat.id === 'string' && ID.test(seat.id), 'Invalid seat');
    ensure(!ids.has(seat.id), 'Repeated seat ID');
    ids.add(seat.id);
    ensure(typeof seat.finding === 'string' && seat.finding.trim(), 'Seat finding required');
    ensure(Array.isArray(seat.evidenceRefs), 'Evidence refs array required');
    textArray(seat.dissent, 'seat dissent');
    ensure(PROVIDER_STATES.includes(seat.providerState), 'Invalid provider label');
    // Claimed provider evidence is never sufficient to establish LIVE status here.
    ensure(seat.evidenceRefs.every(ref => typeof ref === 'string' && ref.trim()), 'Invalid evidence ref');
    return copy({id:seat.id, finding:seat.finding, evidenceRefs:seat.evidenceRefs, dissent:seat.dissent, providerState:seat.providerState});
  });
  const record = {
    contract: COUNCIL_CONTRACT,
    roundId: input.roundId,
    sourceRef: input.sourceRef,
    goal: input.goal,
    findings,
    independent: input.independent === true,
    authority: {decisionOwner:'founder', grantsExecutionAuthority:false},
    transport: {owner:'Council Bus', tracking:'Linear ENG-7', deliveryProof:'NOT_ESTABLISHED'},
  };
  return {...record, fingerprint:fingerprint(record)};
}

export function verifyCouncil(packet) {
  ensure(isObject(packet) && packet.contract === COUNCIL_CONTRACT, 'Unknown Council contract');
  const {fingerprint: claimedHash, ...record} = packet;
  ensure(typeof claimedHash === 'string' && claimedHash === fingerprint(record), 'Council fingerprint mismatch');
  exactFields(packet, PACKET_FIELDS, 'Council packet');
  ensure(typeof record.roundId === 'string' && ID.test(record.roundId) && nonemptyText(record.goal) && nonemptyText(record.sourceRef), 'Invalid Council identity');
  ensure(typeof record.independent === 'boolean', 'Invalid Council independence label');
  ensure(Array.isArray(record.findings) && record.findings.length > 0, 'Council findings required');
  const ids = new Set();
  for (const seat of record.findings) {
    exactFields(seat, SEAT_FIELDS, 'seat');
    ensure(typeof seat.id === 'string' && ID.test(seat.id) && !ids.has(seat.id), 'Invalid or repeated seat');
    ids.add(seat.id);
    ensure(nonemptyText(seat.finding), 'Invalid seat finding');
    textArray(seat.evidenceRefs, 'seat evidence');
    textArray(seat.dissent, 'seat dissent');
    ensure(PROVIDER_STATES.includes(seat.providerState), 'Invalid provider label');
  }
  exactFields(record.authority, AUTHORITY_FIELDS, 'authority');
  ensure(record.authority.decisionOwner === 'founder' && record.authority.grantsExecutionAuthority === false, 'Council cannot authorize action');
  exactFields(record.transport, TRANSPORT_FIELDS, 'transport');
  ensure(record.transport.owner === 'Council Bus' && record.transport.tracking === 'Linear ENG-7' && record.transport.deliveryProof === 'NOT_ESTABLISHED', 'Transport proof cannot be self-minted');
  return true;
}

/** Court adjudicates evidence completeness, not authority. External witnesses still need verification. */
export function reviewCourt(packet, input) {
  verifyCouncil(packet);
  ensure(isObject(input) && Array.isArray(input.claims) && input.claims.length, 'Claims required');
  ensure(typeof input.strongestChallenge === 'string' && input.strongestChallenge.trim(), 'Independent cross-examination required');
  textArray(input.dissent, 'Court dissent');
  const gaps = [];
  const claimIds = new Set();
  const witnessLimitations = [];
  if (!packet.independent) gaps.push('Council findings not confirmed independent');
  for (const claim of input.claims) {
    ensure(isObject(claim) && typeof claim.id === 'string' && ID.test(claim.id) && STATUSES.includes(claim.status), 'Invalid claim');
    ensure(Object.keys(claim).every(key => ['id', 'status', 'witnesses', 'independent'].includes(key)), 'Unknown claim field');
    ensure(!claimIds.has(claim.id), 'Duplicate Court claim');
    claimIds.add(claim.id);
    ensure(claim.independent === undefined || typeof claim.independent === 'boolean', 'Invalid claimed witness independence');
    ensure(Array.isArray(claim.witnesses), 'Witness array required');
    for (const witness of claim.witnesses) {
      exactFields(witness, ['class', 'ref', 'root'], 'witness');
      ensure(WITNESSES.includes(witness.class), 'Unrecognized witness class');
      ensure(typeof witness.ref === 'string' && witness.ref.trim(), 'Witness ref required');
      ensure(typeof witness.root === 'string' && witness.root.trim(), 'Witness root required');
    }
    if (claim.status !== 'VERIFIED') gaps.push(`${claim.id}: ${claim.status}`);
    if (claim.status === 'VERIFIED' && !claim.witnesses.length) gaps.push(`${claim.id}: no witnesses`);
    if (claim.status === 'VERIFIED' && new Set(claim.witnesses.map(w => w.root)).size === 1) witnessLimitations.push(`${claim.id}: single-witness (independence not established)`);
    if (claim.independent === true && (new Set(claim.witnesses.map(w => w.root)).size < 2 || new Set(claim.witnesses.map(w => w.ref)).size < 2)) gaps.push(`${claim.id}: repeated source not independent`);
  }
  const launch = input.launchGate;
  if (launch !== undefined) {
    ensure(isObject(launch), 'Invalid launch gate');
    ensure(Object.keys(launch).every(key => ['destinationIdentity', 'functionalRuntime', 'visualCanon', 'measurementGoal', 'campaignAttribution'].includes(key)), 'Unknown launch field');
    ensure(launch.measurementGoal === undefined || typeof launch.measurementGoal === 'boolean', 'Invalid measurement goal');
    for (const key of ['destinationIdentity', 'functionalRuntime', 'visualCanon']) {
      if (launch[key] !== 'VERIFIED') gaps.push(`launch ${key}: ${launch[key] ?? 'UNKNOWN'}`);
    }
    if (launch.measurementGoal === true && launch.campaignAttribution !== 'VERIFIED') gaps.push('launch campaignAttribution not verified');
  }
  const verdict = gaps.length ? 'HOLD' : 'READY_FOR_EXTERNAL_VERIFICATION';
  const record = {
    contract: COURT_CONTRACT,
    councilRound: packet.roundId,
    councilFingerprint: packet.fingerprint,
    verdict,
    gaps,
    witnesses:copy(input.claims),
    // Persist the exact launch context needed for downstream Court replay.
    launchGate:launch === undefined ? null : copy(launch),
    dissent:copy(input.dissent),
    strongestChallenge:input.strongestChallenge,
    authority:{decisionOwner:'founder', grantsExecutionAuthority:false},
    limits:['No external evidence fetched here', 'Witness root and independence claims are not authenticated here', 'No live-provider identity verified here', 'No merge, deploy, publish, spend, delete, or cross-project writes authorized', ...witnessLimitations],
  };
  return {...record, fingerprint:fingerprint(record)};
}

/** Re-evaluate a transported Court record against its original Council input.
 * SHA integrity alone is not attestation, authentication, or proof of origin.
 * Older Court records without launchGate cannot be verified across the seam.
 */
export function verifyCourt(packet, court) {
  verifyCouncil(packet);
  exactFields(court, [
    'contract', 'councilRound', 'councilFingerprint', 'verdict', 'gaps',
    'witnesses', 'launchGate', 'dissent', 'strongestChallenge',
    'authority', 'limits', 'fingerprint'
  ], 'Court record');
  ensure(court.contract === COURT_CONTRACT, 'Unknown Court contract');
  ensure(court.councilRound === packet.roundId &&
    court.councilFingerprint === packet.fingerprint, 'Court/Council lineage mismatch');
  const {fingerprint:claimed, ...content} = court;
  ensure(typeof claimed === 'string' && claimed === fingerprint(content), 'Court fingerprint mismatch');
  ensure(court.launchGate === null || isObject(court.launchGate), 'Invalid Court launch context');
  // The returned verdict and limits must be exact deterministic outputs of
  // the policy, not merely a new signed-looking digest produced by a sender.
  const expected = reviewCourt(packet, {
    claims:court.witnesses,
    dissent:court.dissent,
    strongestChallenge:court.strongestChallenge,
    ...(court.launchGate === null ? {} : {launchGate:court.launchGate}),
  });
  ensure(expected.fingerprint === court.fingerprint, 'Court ruling recheck mismatch');
  return true;
}