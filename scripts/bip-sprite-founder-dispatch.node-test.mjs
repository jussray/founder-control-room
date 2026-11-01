import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,TARGET,validateIntent,denyAll,validateReceipt,dispatch} from './bip-sprite-founder-dispatch.mjs';
const sha='a'.repeat(40),fcr='b'.repeat(40);
const env={GITHUB_REPOSITORY:'jussray/founder-control-room',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'jussray',GITHUB_SHA:fcr};
const request={mission:'repo-truth',sha,execute:false};
const response=(x,status=200)=>({status,text:async()=>JSON.stringify(x)});
test('only exact SHA, fixed mission, founder main and no kill switch',()=>{
 assert.equal(MISSIONS.length,3);assert.deepEqual(validateIntent(request,env),request);
 for(const bad of [{mission:'shell'},{sha:'main'},{execute:'true'}])
   assert.throws(()=>validateIntent({...request,...bad},env));
 for(const bad of [{GITHUB_ACTOR:'other'},{GITHUB_REF:'refs/heads/dev'},
 {GITHUB_EVENT_NAME:'push'},{FOUNDER_OPERATION_KILL_SWITCH:'all'}])
   assert.throws(()=>validateIntent(request,{...env,...bad}));
});
test('explicit exact SHA+mission approval and token needed to execute',()=>{
 const x={...env,BIP_SPRITE_APPROVED_SHA:sha,BIP_SPRITE_APPROVED_MISSION:'repo-truth',
 BIP_SPRITE_CONFIRM_EXECUTION:'EXECUTE',SPRITES_TOKEN:'dummy-test-token-with-length'};
 assert.equal(validateIntent({...request,execute:true},x).execute,true);
 for(const bad of [{BIP_SPRITE_APPROVED_SHA:fcr},{BIP_SPRITE_APPROVED_MISSION:'agent-contract'},
 {SPRITES_TOKEN:''},{BIP_SPRITE_CONFIRM_EXECUTION:'NO'}])
 assert.throws(()=>validateIntent({...request,execute:true},{...x,...bad}));
});
test('dry run checks both current source heads without touching Sprite',async()=>{
 const urls=[];const r=await dispatch(request,{env,fetcher:async u=>{
 urls.push(String(u));return response(String(u).includes('/commits/main')?{sha:fcr}:{object:{sha}})}});
 assert.equal(r.status,'DRY_RUN_SOURCE_VERIFIED');
 assert.equal(urls.length,2);assert.equal(urls.some(x=>x.includes('sprites.dev')),false);
});
test('rejects stale FCR or Bip before provider auth',async()=>{
 await assert.rejects(dispatch(request,{env,fetcher:async()=>response({sha:'c'.repeat(40)})}),/FCR_MAIN_MOVED/);
 await assert.rejects(dispatch(request,{env,fetcher:async u=>response(String(u).includes('/commits/main')?{sha:fcr}:{object:{sha:fcr}})}),/BIP_HEAD_MOVED/);
});
test('deny-all requires a sole deny star rule',()=>{
 assert.equal(denyAll({rules:[{action:'deny',domain:'*'}]}),true);
 assert.equal(denyAll({rules:[{action:'allow',domain:'github.com'},{action:'deny',domain:'*'}]}),false);
});
const proof={schema:'juss/bip-sprite-proof@v1',source:{repository:TARGET.repository,sha},
 mission:'repo-truth',status:'pass',exitCode:0,outputFingerprint:'sha256:'+'f'.repeat(64),
 networkPolicy:'deny-all',inputs:'public-repository-code-only',
 authority:{merge:false,deploy:false,providerMutation:false,userDataAccess:false},
 startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};
test('receipt is exact, fresh, and strictly nonauthorizing',()=>{
 assert.equal(validateReceipt(proof,request,Date.now()-1000).status,'VERIFIED_READ_ONLY_PROOF');
 for(const bad of [{status:'failed'},{mission:'other'},{source:{repository:TARGET.repository,sha:fcr}},
 {startedAt:'2001-01-01'},{authority:{...proof.authority,merge:true}}])
 assert.throws(()=>validateReceipt({...proof,...bad},request,Date.now()-1000));
});
test('live executes one immutable command; reads receipt; checks policy twice',async()=>{
 const e={...env,BIP_SPRITE_APPROVED_SHA:sha,BIP_SPRITE_APPROVED_MISSION:'repo-truth',
 BIP_SPRITE_CONFIRM_EXECUTION:'EXECUTE',SPRITES_TOKEN:'dummy-test-token-with-length'};
 const urls=[];const fake=async(u,o)=>{u=String(u);urls.push({u,o});
 if(u.includes('/commits/main'))return response({sha:fcr});
 if(u.includes('/git/ref/heads/'))return response({object:{sha}});
 if(u.includes('/policy/network'))return response({rules:[{action:'deny',domain:'*'}]});
 if(u.endsWith('/'+TARGET.name))return response({id:TARGET.id,name:TARGET.name,organization:'juss',url_settings:{auth:'sprite',private_access:'admins'}});
 if(u.includes('/exec?'))return {status:200,text:async()=>''};
 if(u.includes('/fs/read?'))return response({...proof,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()});
 throw Error('unexpected URL');
 };
 const out=await dispatch({...request,execute:true},{env:e,fetcher:fake});
 assert.equal(out.status,'VERIFIED_READ_ONLY_PROOF');
 const exec=urls.filter(x=>x.u.includes('/exec?'));assert.equal(exec.length,1);
 assert.deepEqual(new URL(exec[0].u).searchParams.getAll('cmd'),
 ['node','/home/sprite/bip-source/scripts/bip-sprite-proof.mjs','--mission','repo-truth','--sha',sha]);
 assert.equal(urls.filter(x=>x.u.includes('/policy/network')).length,2);
});
