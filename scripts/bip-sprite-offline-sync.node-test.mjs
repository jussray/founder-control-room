import test from 'node:test';
import assert from 'node:assert/strict';
import {authority, checkpointReceipt, isTransferReceipt, buildRemoteScript} from './bip-sprite-offline-sync.mjs';
const sha='a'.repeat(40),old='b'.repeat(40),hash='c'.repeat(64),invocation='d'.repeat(32);
const env={GITHUB_REPOSITORY:'jussray/founder-control-room',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'jussray',GITHUB_SHA:old,
 BIP_SPRITE_HEAD_SHA:sha,BIP_SPRITE_MISSION:'repo-truth',
 BIP_SPRITE_APPROVED_SHA:sha,BIP_SPRITE_APPROVED_MISSION:'repo-truth',
 BIP_SPRITE_CONFIRM_EXECUTION:'EXECUTE',SPRITES_TOKEN:'dummy-test-token-not-real'};
test('only founder current-main exact-SHA approved execution can sync',()=>{
 assert.equal(authority(env).sha,sha);
 for(const patch of [{GITHUB_ACTOR:'nobody'}, {GITHUB_REF:'refs/heads/fix'},
  {BIP_SPRITE_HEAD_SHA:old}, {BIP_SPRITE_CONFIRM_EXECUTION:'NO'},
  {BIP_SPRITE_APPROVED_MISSION:'companion-contract'},{FOUNDER_OPERATION_KILL_SWITCH:'on'},
  {SPRITES_TOKEN:''}])assert.throws(()=>authority({...env,...patch}));
});
test('checkpoint requires one completed versioned provider response',()=>{
 assert.equal(checkpointReceipt('{"type":"info","data":"Creating checkpoint..."}\n{"type":"complete","data":"Checkpoint v22 created successfully"}\n'),'v22');
 assert.throws(()=>checkpointReceipt('{"type":"info","data":"Creating checkpoint..."}\n'));
 assert.throws(()=>checkpointReceipt('{"type":"complete","data":"done"}\n'));
 assert.throws(()=>checkpointReceipt('garbled'));
});
test('source-import receipt cannot be reused for another SHA or invocation',()=>{
 const wanted={sha,old,hash,invocation};
 const good={contract:'juss/bip-sprite-offline-sync@v1',status:'synced',sourceSha:sha,
  previousSha:old,bundleHash:hash,invocation,clean:true,networkPolicy:'deny-all',
  mergeAuthority:false,deployAuthority:false};
 assert.equal(isTransferReceipt(good,wanted),true);
 for(const bad of [{sourceSha:old},{previousSha:sha},{bundleHash:'0'.repeat(64)},
  {invocation:'0'.repeat(32)},{status:'pass'}, {clean:false},
  {networkPolicy:'allow-all'}, {mergeAuthority:true},{deployAuthority:true}])
  assert.equal(isTransferReceipt({...good,...bad},wanted),false);
});
test('remote command is fixed to existing isolated checkout and exact bundle',()=>{
 const code=buildRemoteScript({sha,old,hash,invocation,count:1});
 assert.match(code,/bip-governed-proof/);
 assert.match(code,/bundle','verify/);
 assert.match(code,/checkout','--detach/);
 assert.match(code,/--porcelain=v1/);
 assert.match(code,/BUNDLE_HASH_MISMATCH/);
 assert.doesNotMatch(code,/dummy-test-token/);
 assert.doesNotMatch(code,/curl |git push|git merge|network\/policy\/update/);
});
test('transfer rejects user-controlled non-SHA and unsafe chunk count',()=>{
 for(const bad of [{sha:'main'},{old:'main'},{hash:'abcd'},{invocation:'x'}, {count:0},{count:65}])
 assert.throws(()=>buildRemoteScript({sha,old,hash,invocation,count:1,...bad}));
});
