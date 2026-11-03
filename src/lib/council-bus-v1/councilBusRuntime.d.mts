import type {CouncilPacket,CourtPacket} from './council.mjs';
import type {HandoffPacket,BusOrigin} from './busHandoff.mjs';
export const EMBEDDED_BUS_CONTRACT:string;
export const BUS_STAGES:readonly ['ingress','dispatch','egress'];
export type BusPorts={
  enabled(stage:'ingress'|'dispatch'|'egress'):Promise<boolean>;
  authenticate(input:{caller:unknown;origin:BusOrigin}):Promise<{authenticated:boolean;subject:string;tenant:string}>;
  authorize(input:{principal:{authenticated:boolean;subject:string;tenant:string};origin:BusOrigin;scope:string}):Promise<boolean>;
  deliver(input:{route:string;agent:string;threadId:string;packet:unknown;signal?:AbortSignal}):Promise<{status:string;idempotencyKey:string;correlationId:string;receiptId:string}>;
  verifyAck(input:{ack:unknown;principal:unknown;origin:BusOrigin;key:string}):Promise<boolean>;
  journal:{
    claimOnce(input:{key:string;origin:BusOrigin;tenant:string}):Promise<boolean>;
    finish(input:{key:string;status:string;receiptId:string;correlationId:string}):Promise<void>;
    read(key:string):Promise<{key:string;status:string;receiptId:string;correlationId:string}|null>;
  };
};
export function runEmbeddedCouncilBus(input:{
  council:CouncilPacket;court:CourtPacket;handoff:HandoffPacket;caller:unknown;ports:BusPorts;signal?:AbortSignal;
}):Promise<{status:string;delivered:boolean;idempotencyKey:string;receiptId?:string;authorityGranted?:false}>;
