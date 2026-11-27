import assert from 'node:assert/strict';
import test from 'node:test';
import {readSecretRegistry} from './runtime-secret-registry-read.mjs';

test('reads only the canonical Worker secret-name registry and rejects untrusted provider results',async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-token'};
 let requested=0;
 const rows=await readSecretRegistry(env,async(url,init)=>{
  requested++;
  assert.equal(String(url),'https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/founder-control-room/secrets');
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,'Bearer fixture-token');
  return Response.json({success:true,result:[{name:'OPENAI_API_KEY',type:'secret_text'}]});
 });
 assert.deepEqual(rows,[{name:'OPENAI_API_KEY'}]);assert.equal(requested,1);
 for(const body of [{success:false,result:[]},{success:true,result:[{name:'A',type:'plain_text'}]},{success:true,result:[{name:'A',type:'secret_text',value:'must-not-return'}]}]){
  await assert.rejects(readSecretRegistry(env,async()=>Response.json(body)));
 }
 await assert.rejects(readSecretRegistry(env,async()=>new Response('{}',{status:403})));
});
