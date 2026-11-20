#!/usr/bin/env node
// Trusted GitHub Actions-only source transfer for a private deny-all Sprite.
// No Sprite egress, no provider credentials copied into the Sprite.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, validateIntent, denyAll } from './bip-sprite-founder-dispatch.mjs';

const API = 'https://api.sprites.dev/v1/sprites/' + TARGET.name;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const REMOTE_HEAD = '/home/sprite/bip-source/.git/worktrees/bip-governed-proof/HEAD';
const CONTRACT = 'juss/bip-sprite-offline-sync@v1';
const MAX_BYTES = 128 * 1024 * 1024;
const CHUNK = 2 * 1024 * 1024;
function requireSha(x) { if (!SHA.test(x || '')) throw Error('INVALID_SHA'); return x; }
export function authority(env) {
  const input = validateIntent({mission:env.BIP_SPRITE_MISSION,sha:env.BIP_SPRITE_HEAD_SHA,execute:true},env);
  if (TARGET.branch !== 'main') throw Error('BIP_MAIN_REQUIRED');
  return input;
}
export function checkpointReceipt(body) {
  const rows=String(body).split(/\r?\n/).filter(Boolean).map(x=>{
    try{return JSON.parse(x)}catch{throw Error('INVALID_CHECKPOINT_RESPONSE')}
  });
  const done=rows.filter(x=>x.type==='complete');
  const match=done.length===1 && String(done[0].data||'').match(/\bv[0-9]+\b/);
  if(!match)throw Error('CHECKPOINT_NOT_VERIFIED');
  return match[0];
}
export function isTransferReceipt(r,p) {
  return r?.contract===CONTRACT && r?.status==='synced' && r?.sourceSha===p.sha &&
    r?.previousSha===p.old && r?.bundleHash===p.hash && r?.invocation===p.invocation &&
    r?.clean===true && r?.networkPolicy==='deny-all' &&
    r?.mergeAuthority===false && r?.deployAuthority===false;
}
function git(cwd,...args) {
  const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
  if(r.error||r.signal||r.status!==0)throw Error('GIT_SOURCE_OPERATION_FAILED');
  return String(r.stdout).trim();
}
async function get(fetcher,url,{token,method='GET',body,json=false}={}) {
  const headers={...(token?{Authorization:'Bearer '+token}:{})};
  if(body!==undefined)headers['Content-Type']=typeof body==='string'?'application/json':'application/octet-stream';
  const r=await fetcher(url,{method,body,headers,redirect:'error',signal:AbortSignal.timeout(180000)});
  if(!r||r.status<200||r.status>=300)throw Error('SOURCE_BRIDGE_PROVIDER_ERROR');
  const value=await r.text();
  if(value.length>65536 && body===undefined)throw Error('SOURCE_BRIDGE_RESPONSE_TOO_LARGE');
  if(!json)return value;
  try{return JSON.parse(value)}catch{throw Error('INVALID_SOURCE_BRIDGE_JSON')}
}
function fsReadUrl(file) {
  const url=new URL(API+'/fs/read');
  url.searchParams.set('path',file);url.searchParams.set('workingDir','/home/sprite');
  return url.toString();
}
export function buildRemoteScript(p) {
  requireSha(p.sha);requireSha(p.old);
  if(!HASH.test(p.hash)||!/^[a-f0-9]{32}$/.test(p.invocation)||!Number.isInteger(p.count)||p.count<1||p.count>64)
    throw Error('TRANSFER_METADATA_INVALID');
  const data={...p,root:TARGET.checkoutDir,
    dir:'/home/sprite/.sprite-proof/source-sync/'+p.invocation,
    receipt:'/home/sprite/.sprite-proof/receipts/source-sync-'+p.invocation+'.json'};
  return [
    "'use strict';",
    "const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');",
    'const p='+JSON.stringify(data)+';',
    "function git(...args){const r=cp.spawnSync('git',args,{cwd:p.root,encoding:'utf8',timeout:180000,maxBuffer:1048576});if(r.error||r.signal||r.status!==0)throw Error('GIT_IMPORT_FAILED');return String(r.stdout).trim();}",
    "if(git('rev-parse','HEAD')!==p.old)throw Error('SPRITE_BASE_MOVED');",
    "if(git('status','--porcelain=v1','--untracked-files=all','--ignore-submodules=none'))throw Error('SPRITE_WORKTREE_DIRTY');",
    "const parts=[];for(let i=0;i<p.count;i++)parts.push(fs.readFileSync(path.join(p.dir,'chunk-'+String(i).padStart(3,'0'))));",
    "const bytes=Buffer.concat(parts);if(crypto.createHash('sha256').update(bytes).digest('hex')!==p.hash)throw Error('BUNDLE_HASH_MISMATCH');",
    "const bundle=path.join(p.dir,'source.bundle');fs.writeFileSync(bundle,bytes,{mode:0o600,flag:'wx'});",
    "git('bundle','verify',bundle);git('fetch',bundle,'refs/heads/fcr-sprite-sync-target');",
    "git('checkout','--detach',p.sha);if(git('rev-parse','HEAD')!==p.sha)throw Error('SPRITE_TARGET_MISMATCH');",
    "if(git('status','--porcelain=v1','--untracked-files=all','--ignore-submodules=none'))throw Error('SPRITE_RESULT_DIRTY');",
    "fs.mkdirSync(path.dirname(p.receipt),{recursive:true,mode:0o700});",
    'fs.writeFileSync(p.receipt,JSON.stringify({contract:'+JSON.stringify(CONTRACT)+',status:"synced",sourceSha:p.sha,previousSha:p.old,bundleHash:p.hash,invocation:p.invocation,clean:true,networkPolicy:"deny-all",mergeAuthority:false,deployAuthority:false})+"\\n",{flag:"wx",mode:0o600});'
  ].join('\n');
}
export async function offlineSync({env=process.env,fetcher=fetch,source=path.resolve('bip-sync-source')}={}) {
  const {sha}=authority(env),token=env.SPRITES_TOKEN;
  const [fcr,bip,sprite,policy,remoteHead]=await Promise.all([
    get(fetcher,'https://api.github.com/repos/jussray/founder-control-room/commits/main',{json:true}),
    get(fetcher,'https://api.github.com/repos/jussray/Sekret-Bip/git/ref/heads/main',{json:true}),
    get(fetcher,API,{token,json:true}),
    get(fetcher,API+'/policy/network',{token,json:true}),
    get(fetcher,fsReadUrl(REMOTE_HEAD),{token})
  ]);
  if(fcr?.sha!==env.GITHUB_SHA)throw Error('FCR_MAIN_MOVED');
  if(bip?.object?.sha!==sha)throw Error('BIP_MAIN_MOVED');
  if(sprite?.id!==TARGET.id||sprite?.name!==TARGET.name||sprite?.organization!=='juss')
    throw Error('SPRITE_IDENTITY_DRIFT');
  if(!denyAll(policy))throw Error('SPRITE_NETWORK_DRIFT');
  const old=requireSha(remoteHead.trim());
  if(git(source,'rev-parse','HEAD')!==sha)throw Error('SOURCE_HEAD_MISMATCH');
  if(git(source,'status','--porcelain=v1','--untracked-files=all','--ignore-submodules=none'))
    throw Error('SOURCE_CHECKOUT_DIRTY');
  if(old===sha)return {status:'ALREADY_AT_EXACT_SHA',sha,old};
  git(source,'merge-base','--is-ancestor',old,sha);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bip-offline-sync-'));
  const ref='refs/heads/fcr-sprite-sync-target';
  try {
    git(source,'update-ref',ref,sha);
    const bundle=path.join(tmp,'source.bundle');
    git(source,'bundle','create',bundle,ref,'^'+old);
    git(source,'bundle','verify',bundle);
    const bytes=fs.readFileSync(bundle);
    if(!bytes.length||bytes.length>MAX_BYTES)throw Error('BUNDLE_TOO_LARGE');
    const hash=createHash('sha256').update(bytes).digest('hex');
    const invocation=randomBytes(16).toString('hex');
    const count=Math.ceil(bytes.length/CHUNK);
    const checkpoint=checkpointReceipt(await get(fetcher,API+'/checkpoint',{
      token,method:'POST',body:JSON.stringify({comment:'Bip offline sync '+sha.slice(0,12)})
    }));
    for(let i=0;i<count;i++){
      const url=new URL(API+'/fs/write');
      url.searchParams.set('path','/home/sprite/.sprite-proof/source-sync/'+invocation+'/chunk-'+String(i).padStart(3,'0'));
      url.searchParams.set('workingDir','/home/sprite');url.searchParams.set('mkdir','true');
      await get(fetcher,url.toString(),{token,method:'PUT',body:bytes.subarray(i*CHUNK,(i+1)*CHUNK)});
    }
    if(!denyAll(await get(fetcher,API+'/policy/network',{token,json:true})))throw Error('SPRITE_NETWORK_DRIFT');
    const exec=new URL(API+'/exec');
    for(const item of ['node','-e',buildRemoteScript({sha,old,hash,invocation,count})])exec.searchParams.append('cmd',item);
    exec.searchParams.set('dir',TARGET.checkoutDir);exec.searchParams.set('stdin','false');
    await get(fetcher,exec.toString(),{token,method:'POST',body:new Uint8Array()});
    const receipt=await get(fetcher,fsReadUrl('/home/sprite/.sprite-proof/receipts/source-sync-'+invocation+'.json'),{token,json:true});
    if(!isTransferReceipt(receipt,{sha,old,hash,invocation}))throw Error('OFFLINE_TRANSFER_RECEIPT_INVALID');
    if((await get(fetcher,fsReadUrl(REMOTE_HEAD),{token})).trim()!==sha)throw Error('POST_TRANSFER_HEAD_MISMATCH');
    if(!denyAll(await get(fetcher,API+'/policy/network',{token,json:true})))throw Error('SPRITE_NETWORK_DRIFT');
    return {status:'EXACT_SHA_SOURCE_TRANSFER_VERIFIED',sha,old,hash,invocation,checkpoint};
  } finally {
    try { git(source,'update-ref','-d',ref) } catch {}
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await offlineSync();
    console.log('BIP_SPRITE_SOURCE_SYNC_'+result.status+' '+result.sha);
  }catch{
    console.error('BIP_SPRITE_SOURCE_SYNC_BLOCKED');
    process.exitCode=1;
  }
}
