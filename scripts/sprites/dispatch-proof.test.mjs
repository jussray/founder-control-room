import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { dispatchFcrSpriteProof } from './dispatch-proof.mjs';
const SHA='f1d39dbb931b7546eca9f8a40916186239cf99b1';
const BASE={headRef:'fix/fcr-access-split-public-worker',expectedHeadSha:SHA,requestId:'sprite-dispatch-20261101',suite:'verify.access'};
const DIGEST=x=>createHash('sha256').update(x).digest('hex');
function response(payload,status=200){
 const bytes=new TextEncoder().encode(payload);
 return {status,body:{async *[Symbol.asyncIterator](){yield bytes}}};
}
test('valid exact-head receipt is accepted, without merge/deploy authority',async()=>{
 const mocked=async(url,opts)=>{
  assert.equal(new URL(url).hostname,'api.sprites.dev');
  assert.equal(opts.redirect,'manual');
  assert.match(opts.headers.Authorization,/^Bearer fake-provider-token-for-tests/);
  const job=JSON.parse(opts.body);
  const receipt={schema:job.schema,repository:job.repository,headRef:job.headRef,exactHeadSha:job.expectedHeadSha,
    requestId:job.requestId,suite:job.suite,state:'PASS',checks:4,
    intentFingerprintSha256:DIGEST(JSON.stringify(job)),
    mergeAuthorized:false,deployAuthorized:false,providerMutationAuthorized:false};
  return response('\x01'+JSON.stringify({result:'PASS',receipt})+'\n\x03\x00');
 };
 const receipt=await dispatchFcrSpriteProof(BASE,{token:'fake-provider-token-for-tests',transport:mocked});
 assert.equal(receipt.exactHeadSha,SHA);
});
test('rejects arbitrary suites and stale/bad refs before network',async()=>{
 for(const changes of [{suite:'git.push'},{headRef:'--upload-pack=x'},{expectedHeadSha:'main'}]){
  await assert.rejects(dispatchFcrSpriteProof({...BASE,...changes},{token:'fake-provider-token-for-tests',transport:async()=>{throw Error('SHOULD_NOT_BE_CALLED')}}));
 }
});
test('does not accept provider HTTP 200 as execution proof without a bound receipt',async()=>{
 for(const body of ['',JSON.stringify({result:'PASS'}),'\x01'+JSON.stringify({result:'PASS',receipt:{state:'PASS'}})]){
  await assert.rejects(dispatchFcrSpriteProof(BASE,{token:'fake-provider-token-for-tests',transport:async()=>response(body)}));
 }
});
test('rejects a framed PASS from a process that exits nonzero',async()=>{
 const spoofed=async(_url,opts)=>{
  const job=JSON.parse(opts.body);
  const receipt={schema:job.schema,repository:job.repository,headRef:job.headRef,exactHeadSha:job.expectedHeadSha,
    requestId:job.requestId,suite:job.suite,state:'PASS',checks:4,intentFingerprintSha256:DIGEST(JSON.stringify(job)),
    mergeAuthorized:false,deployAuthorized:false,providerMutationAuthorized:false};
  return response('\x01'+JSON.stringify({result:'PASS',receipt})+'\n\x03\x02');
 };
 await assert.rejects(dispatchFcrSpriteProof(BASE,{token:'fake-provider-token-for-tests',transport:spoofed}));
});
test('missing provider token fails closed',async()=>{
 await assert.rejects(dispatchFcrSpriteProof(BASE,{token:''}));
});
