import {describe,expect,it} from 'vitest';
import {
  fcrCouncilRoundId,returnCouncilToOrigin,
  type FcrCouncilReturnInput,type FcrCouncilBusRuntime,type FcrCouncilRoundReadback,
} from '../councilBusFcrIntegration.js';
import {verifyPinnedCouncilBundle} from '../councilBusCanonical.js';
import {assembleCouncil,reviewCourt} from '../council-bus-v1/council.mjs';
import {prepareCouncilBusHandoff} from '../council-bus-v1/busHandoff.mjs';
function fixture(){
  const missionId='mission-one',round=2;
  const stored:FcrCouncilRoundReadback={
    mission_id:missionId,round,transcript:{
      goal:'Review source',sourceRef:'repo-sha',state:'complete',
      hops:[{toOperator:'codex',answer:'Checked source',evidenceRefs:['sha:1']}]
    }
  };
  const council=assembleCouncil({
    roundId:fcrCouncilRoundId(missionId,round),goal:'Review source',
    sourceRef:'repo-sha',independent:true,
    seats:[{id:'codex',finding:'Checked source',evidenceRefs:['sha:1'],dissent:[],providerState:'UNVERIFIED'}]
  });
  const court=reviewCourt(council,{
    claims:[{id:'one',status:'VERIFIED',witnesses:[{class:'repository_source',ref:'sha:1',root:'repository'}]}],
    dissent:[],strongestChallenge:'Is this real runtime delivery?'
  });
  const handoff=prepareCouncilBusHandoff({
    council,court,origin:{agent:'chatgpt',route:'founder-relay',threadId:'thread-one',correlationId:'case-one'}
  });
  const input:FcrCouncilReturnInput={
    missionId,round,founder:{userId:'founder-one',email:'test@example.invalid'},
    bundle:{council,court,handoff}
  };
  const calls:unknown[]=[];
  const runtime:FcrCouncilBusRuntime={
    enabled:async()=>true,
    canAccessMission:async()=>true,
    loadPersisted:async()=>stored,
    authorizeOrigin:async()=>true,
    deliver:async context=>{calls.push(context);return {
      status:'ACK_REPORTED_BY_TRUSTED_PORT',delivered:true,idempotencyKey:handoff.idempotencyKey
    }}
  };
  return {input,runtime,stored,calls};
}
describe('FCR pinned canonical Council Bus bridge',()=>{
  it('verifies the full Council/Court/handoff and never claims production proof',async()=>{
    const f=fixture();
    expect(verifyPinnedCouncilBundle(f.input.bundle)).toBe(true);
    expect(await returnCouncilToOrigin(f.input,f.runtime)).toEqual({
      status:'ADAPTER_ACK_NOT_INDEPENDENTLY_VERIFIED',productionVerified:false
    });
    expect(f.calls).toHaveLength(1);
  });
  it('blocks a fabricated but syntactically consistent SHA and Court verdict',async()=>{
    const f=fixture();
    f.input.bundle.court.verdict='HOLD';
    await expect(returnCouncilToOrigin(f.input,f.runtime)).rejects.toThrow(/Court|fingerprint|mismatch/);
    expect(f.calls).toHaveLength(0);
  });
  it('rejects an unbound round replayed across missions',async()=>{
    const f=fixture();
    f.input.missionId='another-mission';
    f.runtime.loadPersisted=async()=>({...f.stored,mission_id:'another-mission'});
    await expect(returnCouncilToOrigin(f.input,f.runtime)).rejects.toThrow(/bound to FCR mission/);
    expect(f.calls).toHaveLength(0);
  });
  it('rejects changed evidence in persisted source',async()=>{
    const f=fixture();
    f.stored.transcript.hops[0].answer='tampered';
    await expect(returnCouncilToOrigin(f.input,f.runtime)).rejects.toThrow(/persisted transcript lineage/);
    expect(f.calls).toHaveLength(0);
  });
  it('blocks disabled runtime, unauthorized founder mission, and invalid session',async()=>{
    const first=fixture();first.runtime.enabled=async()=>false;
    await expect(returnCouncilToOrigin(first.input,first.runtime)).rejects.toThrow(/disabled/);
    const second=fixture();second.runtime.canAccessMission=async()=>false;
    await expect(returnCouncilToOrigin(second.input,second.runtime)).rejects.toThrow(/mission access/);
    const third=fixture();third.input.founder=null as unknown as FcrCouncilReturnInput['founder'];
    await expect(returnCouncilToOrigin(third.input,third.runtime)).rejects.toThrow(/founder session/);
  });
  it('blocks unrecognized agent/route and missing required ports',async()=>{
    const first=fixture();first.runtime.authorizeOrigin=async()=>false;
    await expect(returnCouncilToOrigin(first.input,first.runtime)).rejects.toThrow(/origin\/route/);
    expect(first.calls).toHaveLength(0);
    const second=fixture();delete (second.runtime as Partial<FcrCouncilBusRuntime>).authorizeOrigin;
    await expect(returnCouncilToOrigin(second.input,second.runtime)).rejects.toThrow(/Missing Council Bus runtime port/);
  });
  it('cannot mutate a hash-bound handoff delivery status',async()=>{
    const f=fixture();
    (f.input.bundle.handoff as {deliveryStatus:string}).deliveryStatus='DELIVERED';
    await expect(returnCouncilToOrigin(f.input,f.runtime)).rejects.toThrow(/fingerprint|handoff|contract/);
    expect(f.calls).toHaveLength(0);
  });
  it('a proper Court HOLD blocks outgoing calls',async()=>{
    const f=fixture();
    f.input.bundle.council.independent=false;
    // Rebuild policy-derived Court and handoff, not just a claimed digest.
    const original=f.input.bundle.council;
    const updated=assembleCouncil({
      roundId:original.roundId,goal:original.goal,sourceRef:original.sourceRef,
      independent:false,seats:original.findings
    });
    const held=reviewCourt(updated,{claims:[{id:'one',status:'UNKNOWN',witnesses:[]}],
      dissent:[],strongestChallenge:'No independent proof'});
    f.input.bundle={council:updated,court:held,
      handoff:prepareCouncilBusHandoff({council:updated,court:held,origin:f.input.bundle.handoff.origin})};
    expect(await returnCouncilToOrigin(f.input,f.runtime)).toEqual({status:'COURT_HOLD',productionVerified:false});
    expect(f.calls).toHaveLength(0);
  });
  it('disabled or aborted after readback still cannot deliver',async()=>{
    const f=fixture();let enabledCount=0;
    f.runtime.enabled=async()=>++enabledCount===1;
    await expect(returnCouncilToOrigin(f.input,f.runtime)).rejects.toThrow(/disabled/);
    expect(f.calls).toHaveLength(0);
    const x=fixture();const abort=new AbortController();abort.abort();x.input.signal=abort.signal;
    await expect(returnCouncilToOrigin(x.input,x.runtime)).rejects.toThrow(/aborted/);
    expect(x.calls).toHaveLength(0);
  });
  it('missing remote ACK cannot upgrade metadata to verified',async()=>{
    const f=fixture();f.runtime.deliver=async()=>({status:'DUPLICATE_NOT_SENT',delivered:false});
    expect(await returnCouncilToOrigin(f.input,f.runtime)).toEqual({status:'NOT_DELIVERED',productionVerified:false});
  });
});
