import {describe,expect,it} from 'vitest';
import {dispatchPinnedCouncilBus} from '../councilBusCanonical.js';
import {assembleCouncil,reviewCourt} from '../council-bus-v1/council.mjs';
import {prepareCouncilBusHandoff} from '../council-bus-v1/busHandoff.mjs';
import type {BusPorts} from '../council-bus-v1/councilBusRuntime.mjs';

function fixture(hold=false){
  const council=assembleCouncil({
    roundId:'fcr-round-one',goal:'Check source',sourceRef:'github-sha',
    independent:!hold,seats:[{id:'codex',finding:'Source inspected',
      evidenceRefs:['source:sha'],dissent:[],providerState:'UNVERIFIED'}]
  });
  const court=reviewCourt(council,{
    claims:[{id:'source',status:hold?'UNKNOWN':'VERIFIED',
      witnesses:hold?[]:[{class:'repository_source',ref:'source:sha',root:'github'}]}],
    dissent:[],strongestChallenge:'Is any actual callback authenticated?'
  });
  const handoff=prepareCouncilBusHandoff({
    council,court,origin:{agent:'chatgpt',route:'founder-relay',
      threadId:'thread-one',correlationId:'case-one'}
  });
  const records=new Map<string,{key:string;status:string;receiptId:string;correlationId:string}>();
  const calls:unknown[]=[];
  const enabled:{ingress:boolean;dispatch:boolean;egress:boolean}={
    ingress:true,dispatch:true,egress:true
  };
  const ports:BusPorts={
    enabled:async stage=>enabled[stage],
    authenticate:async()=>({authenticated:true,subject:'founder',tenant:'juss'}),
    authorize:async()=>true,
    journal:{
      claimOnce:async({key})=>{
        if(records.has(key))return false;
        records.set(key,{key,status:'PENDING',receiptId:'',correlationId:''});
        return true;
      },
      finish:async record=>{records.set(record.key,{...record});},
      read:async key=>records.get(key)??null
    },
    deliver:async input=>{
      calls.push(input);
      const packet=input.packet as {idempotencyKey:string;correlationId:string};
      return {status:'ACK',idempotencyKey:packet.idempotencyKey,
        correlationId:packet.correlationId,receiptId:'ack-one'};
    },
    verifyAck:async()=>true
  };
  return {bundle:{council,court,handoff},ports,calls,enabled,records};
}
describe('FCR exact-pinned Council Bus executable adapter',()=>{
  it('executes official source, records an ACK and blocks a duplicate send',async()=>{
    const f=fixture();
    const input={bundle:f.bundle,caller:{session:'test-only'},ports:f.ports};
    const first=await dispatchPinnedCouncilBus(input);
    expect(first).toMatchObject({status:'ACK_REPORTED_BY_TRUSTED_PORT',delivered:true,authorityGranted:false});
    const second=await dispatchPinnedCouncilBus(input);
    expect(second).toMatchObject({status:'DUPLICATE_NOT_SENT',delivered:false});
    expect(f.calls).toHaveLength(1);
    const sent=f.calls[0] as {packet:Record<string,unknown>};
    expect(sent.packet.grantsExecutionAuthority).toBe(false);
    expect(JSON.stringify(sent)).not.toContain('Source inspected');
  });
  it('Court HOLD prevents all calls to the authenticated sender',async()=>{
    const f=fixture(true);
    f.ports.authenticate=async()=>{throw new Error('must not authenticate');};
    const result=await dispatchPinnedCouncilBus({
      bundle:f.bundle,caller:null,ports:f.ports
    });
    expect(result.status).toBe('COURT_HOLD');
    expect(f.calls).toHaveLength(0);
  });
  it('independent stage switches deny an outbound callback',async()=>{
    for(const stage of ['ingress','dispatch','egress'] as const){
      const f=fixture();f.enabled[stage]=false;
      await expect(dispatchPinnedCouncilBus({bundle:f.bundle,caller:null,ports:f.ports}))
        .rejects.toThrow(/disabled/);
      expect(f.calls).toHaveLength(0);
    }
  });
  it('rejects a tampered handoff even if sender adapters claim success',async()=>{
    const f=fixture();
    f.bundle.handoff.origin.route='untrusted-route';
    await expect(dispatchPinnedCouncilBus({bundle:f.bundle,caller:null,ports:f.ports}))
      .rejects.toThrow(/fingerprint|handoff/i);
    expect(f.calls).toHaveLength(0);
  });
  it('rejects forged ACK verification and never persists success',async()=>{
    const f=fixture();
    f.ports.verifyAck=async()=>false;
    await expect(dispatchPinnedCouncilBus({bundle:f.bundle,caller:null,ports:f.ports}))
      .rejects.toThrow(/verification rejected/);
    expect(f.records.get(f.bundle.handoff.idempotencyKey)?.status).toBe('PENDING');
  });
});
