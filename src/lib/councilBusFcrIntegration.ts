/**
 * Optional FCR ↔ Council Bus integration boundary.
 *
 * Uses exact pinned Council/Court validators locally; no public endpoint,
 * remote sender, secret, or founder approval is bundled.
 */
import {createHash} from 'node:crypto';
import {verifyPinnedCouncilBundle,type PinnedCouncilBundle} from './councilBusCanonical.js';

export interface FcrFounderSession { userId:string;email:string }
export interface FcrCouncilRoundReadback {
  mission_id:string|null;
  round:number;
  transcript:{
    state:'complete'|'interrupted';
    goal:string;sourceRef:string;
    hops:Array<{toOperator:string;answer:string;evidenceRefs:string[]}>;
  };
}
export type PortableCouncilReturnBundle = PinnedCouncilBundle;
export interface FcrCouncilReturnInput {
  missionId:string;round:number;founder:FcrFounderSession;
  bundle:PortableCouncilReturnBundle;signal?:AbortSignal;
}
export interface FcrCouncilBusRuntime {
  enabled:()=>Promise<boolean>;
  canAccessMission:(founder:FcrFounderSession,missionId:string)=>Promise<boolean>;
  loadPersisted:(missionId:string,round:number)=>Promise<FcrCouncilRoundReadback|null>;
  /** Authoritative origin-agent/channel/tenant map, never caller-supplied URLs. */
  authorizeOrigin:(context:{
    founder:FcrFounderSession;missionId:string;
    origin:PortableCouncilReturnBundle['handoff']['origin'];
  })=>Promise<boolean>;
  /** Owning authenticated transport; MUST invoke dispatchPinnedCouncilBus. */
  deliver:(context:{
    council:PortableCouncilReturnBundle['council'];
    court:PortableCouncilReturnBundle['court'];
    handoff:PortableCouncilReturnBundle['handoff'];
    origin:PortableCouncilReturnBundle['handoff']['origin'];
    founder:FcrFounderSession;signal?:AbortSignal;
  })=>Promise<{status:string;delivered:boolean;idempotencyKey?:string}>;
}
const TOKEN=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const requireCondition=(ok:boolean,reason:string):void=>{if(!ok)throw new Error(reason);};
const validText=(v:unknown):v is string=>typeof v==='string' && v.length>0;
/** Deterministic mission/round binding, excluding private mission identifier. */
export function fcrCouncilRoundId(missionId:string,round:number):string {
  requireCondition(TOKEN.test(missionId) && Number.isSafeInteger(round) && round>=1,'Invalid mission/round');
  return 'fcr-'+createHash('sha256').update(missionId).digest('hex').slice(0,40)+'-'+round;
}
export async function returnCouncilToOrigin(
  input:FcrCouncilReturnInput,runtime:FcrCouncilBusRuntime,
):Promise<{status:string;productionVerified:false}> {
  requireCondition(Boolean(input&&runtime),'Council Bus input/runtime required');
  for(const port of ['enabled','canAccessMission','loadPersisted','authorizeOrigin','deliver'] as const) {
    requireCondition(typeof runtime[port]==='function','Missing Council Bus runtime port: '+port);
  }
  const expectedRoundId=fcrCouncilRoundId(input.missionId,input.round);
  requireCondition(Boolean(input.founder) && validText(input.founder.userId) &&
    validText(input.founder.email),'Verified founder session required');
  requireCondition(!input.signal?.aborted,'Council Bus request aborted');
  requireCondition(await runtime.enabled()===true,'FCR Council Bus disabled');
  requireCondition(await runtime.canAccessMission(input.founder,input.missionId)===true,
    'Council Bus mission access denied');

  const persisted=await runtime.loadPersisted(input.missionId,input.round);
  requireCondition(Boolean(persisted) && persisted?.mission_id===input.missionId &&
    persisted.round===input.round && persisted.transcript?.state==='complete',
    'Expected complete persisted Council record');
  const {council,court,handoff}=input.bundle??{} as PortableCouncilReturnBundle;
  requireCondition(Boolean(council&&court&&handoff),'Council Court handoff bundle required');
  requireCondition(council.roundId===expectedRoundId && handoff.councilRound===expectedRoundId,
    'Council round is not bound to FCR mission');
  const actual=persisted!.transcript;
  requireCondition(council.goal===actual.goal && council.sourceRef===actual.sourceRef &&
    Array.isArray(council.findings) && council.findings.length===actual.hops.length &&
    council.findings.every((finding,index)=>{
      const hop=actual.hops[index];
      return Boolean(hop && finding.id===hop.toOperator && finding.finding===hop.answer &&
        Array.isArray(finding.evidenceRefs) && Array.isArray(hop.evidenceRefs) &&
        JSON.stringify(finding.evidenceRefs)===JSON.stringify(hop.evidenceRefs));
    }),'Council Bus persisted transcript lineage mismatch');

  // Verify exact Council/Court field schemas, real fingerprints and deterministic
  // Court verdict. User-supplied matching SHA text alone never suffices.
  verifyPinnedCouncilBundle(input.bundle);
  if(court.verdict!=='READY_FOR_EXTERNAL_VERIFICATION')
    return {status:'COURT_HOLD',productionVerified:false};
  requireCondition(Boolean(handoff.origin) && ['agent','route','threadId','correlationId']
    .every(key=>{
      const value=handoff.origin[key as keyof typeof handoff.origin];
      return validText(value) && TOKEN.test(value);
    }),
    'Invalid return-to-origin identity');
  requireCondition(await runtime.authorizeOrigin({
    founder:input.founder,missionId:input.missionId,origin:handoff.origin
  })===true,'Council Bus origin/route authorization denied');
  requireCondition(!input.signal?.aborted,'Council Bus request aborted');
  requireCondition(await runtime.enabled()===true,'FCR Council Bus disabled');
  const outcome=await runtime.deliver({
    council,court,handoff,origin:handoff.origin,founder:input.founder,signal:input.signal
  });
  return {
    status:outcome?.status==='ACK_REPORTED_BY_TRUSTED_PORT' && outcome.delivered===true
      ?'ADAPTER_ACK_NOT_INDEPENDENTLY_VERIFIED':'NOT_DELIVERED',
    productionVerified:false
  };
}
