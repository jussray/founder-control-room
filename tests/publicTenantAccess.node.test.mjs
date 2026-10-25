import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listMyPublicProjects, getMyPublicProject, PublicMcpAccessDenied } from '../src/mcp/publicTenantAccess.ts';
import { authenticatePublicMcp, FCR_PUBLIC_MCP_RESOURCE } from '../src/mcp/publicMcpAuth.ts';

const TA='11111111-1111-4111-8111-111111111111', TB='22222222-2222-4222-8222-222222222222';
const PA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A={id:'A',clientId:'oauth-client'}, B={id:'B',clientId:'oauth-client'};
const memberships=[{tenantId:TA,userId:'A',status:'active'},{tenantId:TB,userId:'B',status:'active'}];
const projects=[{id:PA,tenantId:TA,name:'A only',status:'observed',observedAt:null},{id:PB,tenantId:TB,name:'B only',status:'observed',observedAt:null}];
const reader={
 listMemberships:async user=>memberships.filter(m=>m.userId===user),
 listProjects:async tenant=>projects.filter(p=>p.tenantId===tenant),
 getProject:async (tenant,id)=>projects.find(p=>p.tenantId===tenant&&p.id===id)||null,
};
const jwt=(claims)=>{
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 return `${b64({alg:'RS256'})}.${b64(claims)}.signed`;
};
const claims={iss:'https://auth.example/auth/v1',aud:'authenticated',resource:FCR_PUBLIC_MCP_RESOURCE,scope:'openid',sub:'A',client_id:'oauth-client',exp:4102444800};
const cfg={issuer:'https://auth.example/auth/v1',allowedClientIds:['oauth-client'],now:1700000000};

test('only own tenant projects are listed', async()=>{
 const a=await listMyPublicProjects(A,reader); const b=await listMyPublicProjects(B,reader);
 assert.deepEqual(a.projects.map(x=>x.projectId),[PA]);
 assert.deepEqual(b.projects.map(x=>x.projectId),[PB]);
 assert.equal(a.executionAuthorized,false);
});
test('project lookup is tenant-scoped; foreign and unknown projects are indistinguishable',async()=>{
 const good=await getMyPublicProject(A,reader,PA); assert.equal(good.project.projectId,PA);
 await assert.rejects(getMyPublicProject(A,reader,PB),PublicMcpAccessDenied);
 await assert.rejects(getMyPublicProject(A,reader,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),PublicMcpAccessDenied);
});
test('revoked membership, excess membership and adapter tenant leakage fail closed',async()=>{
 await assert.rejects(listMyPublicProjects(A,{...reader,listMemberships:async()=>[{tenantId:TA,userId:'A',status:'revoked'}]}),PublicMcpAccessDenied);
 await assert.rejects(listMyPublicProjects(A,{...reader,listMemberships:async()=>Array.from({length:21},(_,i)=>({tenantId:TA,userId:'A',status:'active'}))}),PublicMcpAccessDenied);
 await assert.rejects(listMyPublicProjects(A,{...reader,listProjects:async()=>[projects[1]]}),PublicMcpAccessDenied);
});
test('project summary strips extra raw columns',async()=>{
 const data=await getMyPublicProject(A,{...reader,getProject:async()=>({...projects[0],secret:'not-leaked',raw_content:'hidden'})},PA);
 assert.equal(JSON.stringify(data).includes('not-leaked'),false);
 assert.equal(JSON.stringify(data).includes('hidden'),false);
});
test('valid OAuth token requires verified Supabase user',async()=>{
 const token=jwt(claims);
 const matched=await authenticatePublicMcp(token,cfg,async()=>({id:'A',is_anonymous:false}));
 assert.deepEqual(matched,A);
 const forged=await authenticatePublicMcp(token,cfg,async()=>({id:'B',is_anonymous:false}));
 assert.equal(forged,null);
 const revoked=await authenticatePublicMcp(token,cfg,async()=>null);
 assert.equal(revoked,null);
});
test('rejects wrong issuer, client, expired and non-OAuth claims before verifier',async()=>{
 let n=0; const verify=async()=>{n++;return {id:'A'}};
 for(const bad of [
 {...claims,iss:'https://evil.example'},
 {...claims,client_id:'wrong'},
 {...claims,exp:1},
 {...claims,aud:'something-else'},
 {...claims,client_id:undefined},
 {...claims,resource:undefined},
 {...claims,resource:'https://unrelated.example/mcp'},
 {...claims,scope:'profile'},
 {...claims,nbf:4102444800},
 ]) assert.equal(await authenticatePublicMcp(jwt(bad),cfg,verify),null);
 assert.equal(n,0);
});

test('accepts an exact MCP audience but rejects generic unbound tokens',async()=>{
 const valid=jwt({...claims,aud:FCR_PUBLIC_MCP_RESOURCE,resource:undefined});
 assert.deepEqual(await authenticatePublicMcp(valid,cfg,async()=>({id:'A'})),A);
 const invalid=jwt({...claims,aud:'authenticated',resource:undefined});
 let called=false;
 assert.equal(await authenticatePublicMcp(invalid,cfg,async()=>{called=true;return {id:'A'};}),null);
 assert.equal(called,false);
});

test('OAuth resource checks use exact full values, never URL prefixes or substrings',async()=>{
 let verifyCalls=0;
 const verify=async()=>{verifyCalls++;return {id:'A'}};
 const deceptive=[
  `https://evil.example/forward?to=${FCR_PUBLIC_MCP_RESOURCE}`,
  `${FCR_PUBLIC_MCP_RESOURCE}/more`,
  `${FCR_PUBLIC_MCP_RESOURCE}.evil.example`,
  FCR_PUBLIC_MCP_RESOURCE.replace('https:', 'http:'),
 ];
 for(const address of deceptive){
  for(const bad of [
   {...claims,aud:address,resource:undefined},
   {...claims,aud:['authenticated',address],resource:undefined},
   {...claims,aud:'authenticated',resource:address},
  ]){
   assert.equal(await authenticatePublicMcp(jwt(bad),cfg,verify),null,address);
  }
 }
 assert.equal(verifyCalls,0);

 const accepted=jwt({...claims,aud:['authenticated',FCR_PUBLIC_MCP_RESOURCE],resource:undefined});
 assert.deepEqual(await authenticatePublicMcp(accepted,cfg,verify),A);
 assert.equal(verifyCalls,1);
});
