import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCustomerPaidEntitlement } from '../src/mcp/publicCustomerEntitlements.ts';

const USER='33333333-3333-4333-8333-333333333333';
const TENANT_A='11111111-1111-4111-8111-111111111111';
const TENANT_B='22222222-2222-4222-8222-222222222222';
const RECEIPT='55555555-5555-4555-8555-555555555555';
const customer={id:USER,email:'customer@example.test',email_confirmed_at:'2026-10-30T00:00:00Z',
 is_anonymous:false,user_metadata:{plan:'team',paid:true}};
const membership={
 listMemberships:async(id)=>[{tenantId:TENANT_A,userId:id,status:'active'}],
 listProjects:async()=>[],getProject:async()=>null,
};
const receipt={id:RECEIPT,tenantId:TENANT_A,signatureVerifiedAt:'2026-10-01T00:00:00Z',
 provider:'provider',providerEventId:'evt_proved'};
const paid={tenantId:TENANT_A,plan:'team',status:'active',verifiedReceiptId:RECEIPT,validUntil:'2026-12-01T00:00:00Z'};
const now=new Date('2026-11-01T00:00:00Z');
const reader={
 getEntitlement:async()=>paid,
 getVerifiedReceipt:async()=>receipt,
};
const check=(identity=customer,tenantId=TENANT_A,mem=membership,ent=reader,activated=true,clock=now)=>
 evaluateCustomerPaidEntitlement(identity,tenantId,mem,ent,{activated,now:clock});

test('paid authority is off unless the independent feature gate is enabled',async()=>{
 let calls=0;
 const denied=await check(customer,TENANT_A,membership,{...reader,getEntitlement:async()=>{calls++;return paid;}},false);
 assert.equal(denied.effectivePlan,'explorer');
 assert.equal(denied.paidCapabilitiesAuthorized,false);
 assert.equal(calls,0);
});

test('active paid plan requires both trusted entitlement and verified same-tenant receipt',async()=>{
 const result=await check();
 assert.deepEqual(result,{tenantId:TENANT_A,effectivePlan:'team',paidCapabilitiesAuthorized:true});
});

test('client-controlled user metadata and wrong-tenant claims cannot grant paid access',async()=>{
 await assert.rejects(check(customer,TENANT_B),/not found or not available/i);
 const free=await check(customer,TENANT_A,membership,{...reader,getEntitlement:async()=>null});
 assert.equal(free.paidCapabilitiesAuthorized,false);
 assert.equal(JSON.stringify(free).includes('team'),false);
});

test('inactive, canceled, expired, unsigned, wrong-tenant and missing receipts deny paid access',async()=>{
 for (const row of [
  {...paid,status:'suspended'}, {...paid,status:'canceled'}, {...paid,plan:'explorer'},
  {...paid,validUntil:'2026-10-01T00:00:00Z'}, {...paid,validUntil:'garbage'},
  {...paid,verifiedReceiptId:null},
 ]) {
  const result=await check(customer,TENANT_A,membership,{...reader,getEntitlement:async()=>row});
  assert.equal(result.paidCapabilitiesAuthorized,false);
 }
 for(const bad of [
  null,{...receipt,tenantId:TENANT_B},{...receipt,signatureVerifiedAt:'2026-12-01T00:00:00Z'},
  {...receipt,providerEventId:''},
 ]) {
  const result=await check(customer,TENANT_A,membership,{...reader,getVerifiedReceipt:async()=>bad});
  assert.equal(result.paidCapabilitiesAuthorized,false);
 }
});

test('revoked and unauthenticated users never query billing data',async()=>{
 let count=0;
 const ent={...reader,getEntitlement:async()=>{count++;return paid;}};
 const revoked={...membership,listMemberships:async()=>[{tenantId:TENANT_A,userId:USER,status:'revoked'}]};
 await assert.rejects(check(customer,TENANT_A,revoked,ent));
 await assert.rejects(check({...customer,email_confirmed_at:null},TENANT_A,membership,ent));
 await assert.rejects(check(null,TENANT_A,membership,ent));
 assert.equal(count,0);
});
