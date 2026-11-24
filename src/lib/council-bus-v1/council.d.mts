/** Frozen public type surface for Council @ 223ad28ce4b0831912a3cd9b9c49541d559c7683. */
export type CouncilSeatFinding = {
  id:string; finding:string; evidenceRefs:string[]; dissent:string[];
  providerState:'UNVERIFIED'|'SIMULATED'|'EXTERNALLY_ATTESTED';
};
export type CouncilPacket = {
  contract:string; roundId:string; sourceRef:string; goal:string;
  findings:CouncilSeatFinding[]; independent:boolean;
  authority:{decisionOwner:'founder';grantsExecutionAuthority:false};
  transport:{owner:'Council Bus';tracking:'Linear ENG-7';deliveryProof:'NOT_ESTABLISHED'};
  fingerprint:string;
};
export function assembleCouncil(input:{
  roundId:string;goal:string;sourceRef:string;independent?:boolean;
  seats:CouncilSeatFinding[];
}): CouncilPacket;
export function verifyCouncil(packet:CouncilPacket):true;
export type CourtWitness = {class:string;ref:string;root:string};
export type CourtClaim = {id:string;status:'VERIFIED'|'INFERRED'|'UNKNOWN'|'BLOCKED'|'FAIL';witnesses:CourtWitness[];independent?:boolean};
export type CourtPacket = {
  contract:string;councilRound:string;councilFingerprint:string;
  verdict:'HOLD'|'READY_FOR_EXTERNAL_VERIFICATION';gaps:string[];
  witnesses:CourtClaim[];launchGate:Record<string,unknown>|null;
  dissent:string[];strongestChallenge:string;
  authority:{decisionOwner:'founder';grantsExecutionAuthority:false};
  limits:string[];fingerprint:string;
};
export function reviewCourt(packet:CouncilPacket,input:{
  claims:CourtClaim[];strongestChallenge:string;dissent:string[];
  launchGate?:Record<string,unknown>;
}):CourtPacket;
export function verifyCourt(packet:CouncilPacket,court:CourtPacket):true;
