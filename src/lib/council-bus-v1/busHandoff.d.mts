import type {CouncilPacket,CourtPacket} from './council.mjs';
export type BusOrigin = {
  agent:string;route:string;threadId:string;correlationId:string;
};
export type HandoffPacket = {
  contract:string;origin:BusOrigin;councilRound:string;
  councilFingerprint:string;courtFingerprint:string;
  decisionStatus:string;idempotencyKey:string;
  deliveryStatus:'PREPARED_NOT_SENT';
  authority:{decisionOwner:'founder';grantsExecutionAuthority:false};
  fingerprint:string;
};
export function prepareCouncilBusHandoff(input:{council:CouncilPacket;court:CourtPacket;origin:BusOrigin}):HandoffPacket;
export function verifyCouncilBusHandoff(input:{council:CouncilPacket;court:CourtPacket;handoff:HandoffPacket}):true;
