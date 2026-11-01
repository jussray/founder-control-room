#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';

export const MISSIONS = Object.freeze(['repo-truth','agent-contract','companion-contract']);
export const TARGET = Object.freeze({
  repository:'jussray/Sekret-Bip',
  branch:'governance/repo-reality-v10-20261025',
  name:'sekret-bip-governed-proof',
  id:'sprite-4709ae6f-3a4c-4e45-8c47-e73a7ee54f1f',
});
const API='https://api.sprites.dev/v1/sprites/'+TARGET.name;
const SHA=/^[a-f0-9]{40}$/;
export function validateIntent({mission,sha,execute=false},env){
  if(!MISSIONS.includes(mission)||!SHA.test(sha)||typeof execute!=='boolean')throw Error('INVALID_MISSION_OR_SHA');
  if(env.GITHUB_REPOSITORY!=='jussray/founder-control-room' ||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main' ||
     env.GITHUB_ACTOR!=='jussray'||!SHA.test(env.GITHUB_SHA||''))throw Error('FOUNDER_MAIN_REQUIRED');
  if(env.FOUNDER_OPERATION_KILL_SWITCH && env.FOUNDER_OPERATION_KILL_SWITCH!=='off')
    throw Error('FOUNDER_PAUSED');
  if(execute && (env.BIP_SPRITE_APPROVED_SHA!==sha ||
    env.BIP_SPRITE_APPROVED_MISSION!==mission ||
    env.BIP_SPRITE_CONFIRM_EXECUTION!=='EXECUTE' ||
    !/^[\x21-\x7e]{16,}$/.test(env.SPRITES_TOKEN||'')))throw Error('APPROVAL_OR_CREDENTIAL_MISSING');
  return {mission,sha,execute};
}
async function get(fetcher,url,opts={},asJson=true){
  const res=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(90000),...opts});
  if(res?.status!==200)throw Error('PROVIDER_REQUEST_FAILED');
  const text=await res.text();
  if(text.length>65536)throw Error('PROVIDER_RESPONSE_TOO_LARGE');
  if(!asJson)return text;
  try{return JSON.parse(text)}catch{throw Error('INVALID_PROVIDER_RESPONSE')}
}
export function denyAll(d){
  return d?.rules?.length===1 && d.rules[0].action==='deny' && d.rules[0].domain==='*';
}
export function validateReceipt(r,request,since,now=Date.now()){
  if(r?.schema!=='juss/bip-sprite-proof@v1'||
    r?.source?.repository!==TARGET.repository||r?.source?.sha!==request.sha||
    r?.mission!==request.mission||r?.status!=='pass'||r?.exitCode!==0||
    !/^sha256:[a-f0-9]{64}$/.test(r.outputFingerprint||'')||
    r?.networkPolicy!=='deny-all'||r?.inputs!=='public-repository-code-only'||
    r?.authority?.merge!==false||r?.authority?.deploy!==false||
    r?.authority?.providerMutation!==false||r?.authority?.userDataAccess!==false)throw Error('INVALID_PROOF_RECEIPT');
  const start=Date.parse(r.startedAt),end=Date.parse(r.finishedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<since-30000||
    end<start||end>now+60000)throw Error('STALE_PROOF_RECEIPT');
  return {status:'VERIFIED_READ_ONLY_PROOF',
    fingerprint:'sha256:'+createHash('sha256').update(JSON.stringify(r)).digest('hex'),
    mergeAuthority:false,deployAuthority:false,providerMutation:false};
}
export async function dispatch(input,{env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
  const request=validateIntent(input,env);
  const github={Accept:'application/vnd.github+json'};
  const main=await get(fetcher,'https://api.github.com/repos/jussray/founder-control-room/commits/main',{headers:github});
  if(main.sha!==env.GITHUB_SHA)throw Error('FCR_MAIN_MOVED');
  const bip=await get(fetcher,'https://api.github.com/repos/jussray/Sekret-Bip/git/ref/heads/'+TARGET.branch,{headers:github});
  if(bip?.object?.sha!==request.sha)throw Error('BIP_HEAD_MOVED');
  const base={sourceSha:env.GITHUB_SHA,bipSha:request.sha,mission:request.mission,
    mutationAuthority:false,mergeAuthority:false,deployAuthority:false};
  if(!request.execute)return {...base,status:'DRY_RUN_SOURCE_VERIFIED'};
  const headers={Authorization:'Bearer '+env.SPRITES_TOKEN};
  const info=await get(fetcher,API,{headers});
  if(info.id!==TARGET.id||info.name!==TARGET.name||info.organization!=='juss'||
    info.url_settings?.auth!=='sprite'||
    (info.url_settings?.private_access && info.url_settings.private_access!=='admins'))
    throw Error('SPRITE_IDENTITY_DRIFT');
  if(!denyAll(await get(fetcher,API+'/policy/network',{headers})))throw Error('SPRITE_NETWORK_DRIFT');
  const start=now();
  const url=new URL(API+'/exec');
  for(const x of ['node','/home/sprite/bip-source/scripts/bip-sprite-proof.mjs',
    '--mission',request.mission,'--sha',request.sha])url.searchParams.append('cmd',x);
  url.searchParams.set('dir','/home/sprite/bip-source');
  url.searchParams.set('stdin','false');
  await get(fetcher,url.toString(),{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'}},false);
  const proofURL=new URL(API+'/fs/read');
  proofURL.searchParams.set('path','/home/sprite/.sprite-proof/receipts/'+request.sha+'-'+request.mission+'.json');
  proofURL.searchParams.set('workingDir','/home/sprite');
  const proof=await get(fetcher,proofURL.toString(),{headers});
  if(!denyAll(await get(fetcher,API+'/policy/network',{headers})))throw Error('SPRITE_NETWORK_DRIFT');
  return {...base,...validateReceipt(proof,request,start,now())};
}
async function main(){
  try{
    const e=process.env;
    const r=await dispatch({mission:e.BIP_SPRITE_MISSION,sha:e.BIP_SPRITE_HEAD_SHA,execute:e.BIP_SPRITE_EXECUTE==='true'});
    if(e.GITHUB_OUTPUT)appendFileSync(e.GITHUB_OUTPUT,'status='+r.status+'\n');
    console.log('BIP_SPRITE_DISPATCH_RECEIPT_WRITTEN');
  }catch{
    console.error('BIP_SPRITE_DISPATCH_BLOCKED');
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
