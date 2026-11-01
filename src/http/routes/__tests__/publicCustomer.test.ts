import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: vi.fn() } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import { createPublicCustomerRouter } from '../publicCustomer.js';

const USER='33333333-3333-4333-8333-333333333333';
const TENANT='11111111-1111-4111-8111-111111111111';
const PROJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const identity={id:USER,email:'test@example.test',email_confirmed_at:'2026-09-01T00:00:00Z',is_anonymous:false,
 user_metadata:{role:'founder',subscription:'enterprise'}};
const reader={
  listMemberships:async(userId:string)=>[{userId,tenantId:TENANT,status:'active' as const}],
  listProjects:async(tenantId:string)=>[{tenantId,id:PROJECT,name:'Mine',status:'observed',observedAt:null,secret:'never'}],
  getProject:async()=>null,
};
const build=(verify:(token:string)=>Promise<unknown>=async()=>identity, data=reader)=>{
 const app=express();app.use('/customer',createPublicCustomerRouter(verify,data));return app;
};

beforeEach(()=>{ delete process.env.FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED; });
afterEach(()=>{ vi.unstubAllEnvs(); });

describe('isolated customer workspace API',()=>{
 it('reports accurate non-authorizing status',async()=>{
  const res=await request(build()).get('/customer/status');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
   publicBrowsingEnabled:true,customerRegistrationEnabled:false,
   customerWorkspaceReadEnabled:false,checkoutEnabled:false,paidCapabilitiesEnabled:false,
  });
  expect(res.headers['cache-control']).toBe('no-store');
 });
 it('fails closed when not enabled and does not call auth or database',async()=>{
  const verify=vi.fn();
  const read=vi.fn();
  const res=await request(build(verify as never,{...reader,listMemberships:read as never}))
    .get('/customer/workspace').set('Authorization','Bearer customer-token');
  expect(res.status).toBe(503);expect(verify).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it('rejects cookie-only attempts without invoking customer auth',async()=>{
  vi.stubEnv('FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED','true');
  const verify=vi.fn();
  const res=await request(build(verify as never)).get('/customer/workspace')
    .set('Cookie','__Host-fcr_session=founder-session');
  expect(res.status).toBe(401);expect(verify).not.toHaveBeenCalled();
  expect(res.headers['www-authenticate']).toMatch(/Bearer/);
 });
 it('returns only scoped public data for a verified bearer token; metadata cannot grant authority',async()=>{
  vi.stubEnv('FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED','true');
  const res=await request(build()).get('/customer/workspace').set('Authorization','Bearer customer-token');
  expect(res.status).toBe(200);expect(res.body.accountId).toBe(USER);
  expect(res.body.projects).toEqual([{projectId:PROJECT,name:'Mine',status:'observed',observedAt:null,executionAuthorized:false}]);
  expect(res.body.executionAuthorized).toBe(false);
  expect(res.body.paidCapabilitiesAuthorized).toBe(false);
  expect(JSON.stringify(res.body)).not.toMatch(/never|enterprise|founder/);
 });
 it('rejects unverified identity and fails closed on revoked membership or backend errors',async()=>{
  vi.stubEnv('FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED','true');
  const unauthorized=await request(build(async()=>({...identity,email_confirmed_at:null})))
    .get('/customer/workspace').set('Authorization','Bearer customer-token');
  expect(unauthorized.status).toBe(401);
  const revoked=await request(build(async()=>identity,{...reader,
    listMemberships:async()=>[{tenantId:TENANT,userId:USER,status:'revoked' as const}]}))
    .get('/customer/workspace').set('Authorization','Bearer customer-token');
  expect(revoked.status).toBe(404);
  const outage=await request(build(async()=>{throw new Error('provider secret')}))
    .get('/customer/workspace').set('Authorization','Bearer customer-token');
  expect(outage.status).toBe(503);
  expect(JSON.stringify(outage.body)).not.toContain('provider secret');
 });
});
