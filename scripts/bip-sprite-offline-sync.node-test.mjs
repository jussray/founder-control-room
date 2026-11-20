import * as requireVm from 'node:vm';
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
 assert.doesNotThrow(()=>new (requireVm.Script)(code));
});
test('transfer rejects user-controlled non-SHA and unsafe chunk count',()=>{
 for(const bad of [{sha:'main'},{old:'main'},{hash:'abcd'},{invocation:'x'}, {count:0},{count:65}])
 assert.throws(()=>buildRemoteScript({sha,old,hash,invocation,count:1,...bad}));
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {offlineSync} from './bip-sprite-offline-sync.mjs';
import {TARGET} from './bip-sprite-founder-dispatch.mjs';

test('real local git bundle with mocked Sprite stays checkpointed and receipt-bound',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offline-bip-test-'));
 const run=(...args)=>{
  const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
 };
 try {
  run('init','-q');run('config','user.email','test@example.invalid');run('config','user.name','test');
  fs.writeFileSync(path.join(dir,'fixture.txt'),'old\n');run('add','.');run('commit','-qm','base');
  const previous=run('rev-parse','HEAD');
  fs.writeFileSync(path.join(dir,'fixture.txt'),'new\n');run('add','.');run('commit','-qm','advance');
  const target=run('rev-parse','HEAD');
  const localEnv={...env,BIP_SPRITE_HEAD_SHA:target,BIP_SPRITE_APPROVED_SHA:target};
  let ranRemote=false,checkpointed=false,uploads=0,uploadBytes=[],invocation=null;
  const requests=[];
  function response(value){return {status:200,text:async()=>typeof value==='string'?value:JSON.stringify(value)}}
  const fetcher=async(url,opt)=>{
   const u=String(url),a=new URL(u),pathname=a.pathname;
   requests.push({method:opt.method,path:pathname});
   if(pathname.endsWith('/founder-control-room/commits/main'))return response({sha:localEnv.GITHUB_SHA});
   if(pathname.endsWith('/Sekret-Bip/git/ref/heads/main'))return response({object:{sha:target}});
   if(pathname.endsWith('/sprites/'+TARGET.name))return response({id:TARGET.id,name:TARGET.name,organization:'juss'});
   if(pathname.endsWith('/policy/network'))return response({rules:[{action:'deny',domain:'*'}]});
   if(pathname.endsWith('/checkpoint')){checkpointed=true;return response('{"type":"info","data":"Creating checkpoint..."}\n{"type":"complete","data":"Checkpoint v901 created successfully"}\n')}
   if(pathname.endsWith('/fs/write')){
    assert.equal(checkpointed,true);assert.equal(opt.method,'PUT');
    uploadBytes.push(Buffer.from(opt.body));uploads++;
    invocation=a.searchParams.get('path').match(/source-sync\/([a-f0-9]{32})\//)?.[1];
    return response({ok:true});
   }
   if(pathname.endsWith('/exec')){
    assert.equal(uploads>0,true);
    assert.equal(a.searchParams.getAll('cmd')[0],'node');
    assert.equal(a.searchParams.getAll('cmd')[1],'-e');
    assert.match(a.searchParams.getAll('cmd')[2],/BUNDLE_HASH_MISMATCH/);
    ranRemote=true;return response('');
   }
   if(pathname.endsWith('/fs/read')){
    const f=a.searchParams.get('path');
    if(f.endsWith('/HEAD'))return response((ranRemote?target:previous)+'\n');
    if(f.endsWith('/source-sync-'+invocation+'.json')){
     const hash=createHash('sha256').update(Buffer.concat(uploadBytes)).digest('hex');
     return response({contract:'juss/bip-sprite-offline-sync@v1',status:'synced',
      sourceSha:target,previousSha:previous,bundleHash:hash,invocation,
      clean:true,networkPolicy:'deny-all',mergeAuthority:false,deployAuthority:false});
    }
   }
   throw Error('Unexpected request '+pathname);
  };
  const result=await offlineSync({env:localEnv,fetcher,source:dir});
  assert.equal(result.status,'EXACT_SHA_SOURCE_TRANSFER_VERIFIED');
  assert.equal(result.sha,target);assert.equal(result.old,previous);
  assert.equal(result.checkpoint,'v901');assert.equal(ranRemote,true);
  assert.equal(requests.some(x=>x.path.endsWith('/policy/network')&&x.method!=='GET'),false);
  assert.equal(run('status','--porcelain=v1'),'');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('generated remote import executes a real incremental bundle in a disposable worktree',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'bip-sprite-remote-test-'));
 const source=path.join(base,'source'),proof=path.join(base,'proof');
 fs.mkdirSync(source);
 const command=(cwd,...args)=>{
   const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:30000});
   assert.equal(r.status,0,r.stderr||r.stdout);
   return r.stdout.trim();
 };
 try{
   command(source,'init','-q');
   command(source,'config','user.name','Test');
   command(source,'config','user.email','test@example.invalid');
   fs.writeFileSync(path.join(source,'README.md'),'before\n');
   command(source,'add','.');command(source,'commit','-qm','baseline');
   const oldSha=command(source,'rev-parse','HEAD');
   command(base,'clone','-q','--no-hardlinks',source,proof);
   fs.writeFileSync(path.join(source,'README.md'),'after\n');
   command(source,'add','.');command(source,'commit','-qm','new-main');
   const nextSha=command(source,'rev-parse','HEAD');
   command(source,'update-ref','refs/heads/fcr-sprite-sync-target',nextSha);
   const bundle=path.join(base,'source.bundle');
   command(source,'bundle','create',bundle,'refs/heads/fcr-sprite-sync-target','^'+oldSha);
   const bytes=fs.readFileSync(bundle);
   const digest=createHash('sha256').update(bytes).digest('hex');
   const transfer=path.join(base,'transfer');
   fs.mkdirSync(transfer);
   fs.writeFileSync(path.join(transfer,'chunk-000'),bytes);
   const receipt=path.join(base,'receipt.json');
   const marker='e'.repeat(32);
   const generated=buildRemoteScript({sha:nextSha,old:oldSha,hash:digest,invocation:marker,count:1});
   const patched=generated
    .replace(JSON.stringify(TARGET.checkoutDir),JSON.stringify(proof))
    .replace(JSON.stringify('/home/sprite/.sprite-proof/source-sync/'+marker),JSON.stringify(transfer))
    .replace(JSON.stringify('/home/sprite/.sprite-proof/receipts/source-sync-'+marker+'.json'),JSON.stringify(receipt));
   assert.notEqual(generated,patched);
   const invoked=spawnSync('node',['-e',patched],{cwd:base,encoding:'utf8',timeout:60000,maxBuffer:1e6});
   assert.equal(invoked.status,0,invoked.stderr||invoked.stdout);
   assert.equal(command(proof,'rev-parse','HEAD'),nextSha);
   assert.equal(command(proof,'status','--porcelain=v1'),'');
   const received=JSON.parse(fs.readFileSync(receipt,'utf8'));
   assert.equal(isTransferReceipt(received,{sha:nextSha,old:oldSha,hash:digest,invocation:marker}),true);
 }finally{fs.rmSync(base,{recursive:true,force:true})}
});
