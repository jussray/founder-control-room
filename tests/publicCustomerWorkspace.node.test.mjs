import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerWorkspace, VerifiedCustomerRequired } from '../src/mcp/publicCustomerWorkspace.ts';

const TA='11111111-1111-4111-8111-111111111111';
const TB='22222222-2222-4222-8222-222222222222';
const PA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const verified={id:A,email:'customer@example.test',email_confirmed_at:'2026-10-01T00:00:00Z',is_anonymous:false,
 user_metadata:{role:'founder',plan:'enterprise',paid:true}};
const memberships=[{tenantId:TA,userId:A,status:'active'},{tenantId:TB,userId:B,status:'active'}];
const projects=[{id:PA,tenantId:TA,name:'A project',status:'observed',observedAt:null},
 {id:PB,tenantId:TB,name:'B project',status:'observed',observedAt:null}];
const reader={
 listMemberships:async id=>memberships.filter(m=>m.userId===id),
 listProjects:async tenant=>projects.filter(p=>p.tenantId===tenant),
 getProject:async(tenant,id)=>projects.find(p=>p.id===id&&p.tenantId===tenant)||null,
};

test('verified customer receives only tenant-scoped sanitized read-only projects',async()=>{
 const result=await getCustomerWorkspace(verified,reader);
 assert.deepEqual(result.projects,[{projectId:PA,name:'A project',status:'observed',observedAt:null,executionAuthorized:false}]);
 assert.equal(result.accountId,A);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.paidCapabilitiesAuthorized,false);
 assert.equal(result.billingEnabled,false);
 assert.equal(result.connectionsAuthorized,false);
 assert.equal(JSON.stringify(result).includes('enterprise'),false);
 assert.equal(JSON.stringify(result).includes('founder'),false);
 assert.equal(JSON.stringify(result).includes(TA),false);
 assert.equal(JSON.stringify(result).includes(PB),false);
});

test('missing, anonymous, unverified or invalid customer identity fails closed',async()=>{
 for(const bad of [null,{},'a-string',{...verified,id:'bad'}, {...verified,is_anonymous:true},
  {...verified,email_confirmed_at:null}, {...verified,email:''}]) {
   await assert.rejects(getCustomerWorkspace(bad,reader),VerifiedCustomerRequired);
 }
});

test('foreign, revoked and duplicate memberships never grant other customer data',async()=>{
 for(const rows of [
  [memberships[1]], [{tenantId:TA,userId:A,status:'revoked'}],
  [memberships[0],memberships[0]],
 ]) await assert.rejects(getCustomerWorkspace(verified,{...reader,listMemberships:async()=>rows}));
});

test('customer receives no paid entitlements or execution even if metadata claims paid access',async()=>{
 const badReader={...reader,listProjects:async()=>[{...projects[0],private_prompt:'secret',api_key:'key',paid:true}]};
 const workspace=await getCustomerWorkspace(verified,badReader);
 assert.equal(JSON.stringify(workspace).includes('secret'),false);
 assert.equal(JSON.stringify(workspace).includes('key'),false);
 assert.equal(workspace.paidCapabilitiesAuthorized,false);
 assert.equal(workspace.executionAuthorized,false);
});
