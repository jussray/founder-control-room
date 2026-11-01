#!/usr/bin/env node
// Read-only threat intelligence collector. Does not auto-block, investigate users, or modify Cloudflare.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseSyndication,extractIndicators,detectPromptInjection,summarizePortfolioObservation,brokeFounderGate} from './security-threat-watch-core.mjs';
const MAX_BYTES=300000;
const ALLOWED_FEED_HOSTS=new Set(['www.cisa.gov','developers.cloudflare.com']);
const OUT='artifacts/security-threat-watch/receipt.json';
function truncateError(error) {
  const message=error instanceof Error?error.message:String(error);
  return message.replace(/https?:\/\/\S+/g,'[url]').replace(/(?:sk-|ghp_|github_pat_|Bearer\s+)\S+/gi,'[redacted]').slice(0,100);
}
async function readBounded(response) {
  if(!response.ok)throw Error('HTTP_'+response.status);
  const reader=response.body?.getReader();
  if(!reader) throw Error('Empty body');
  const chunks=[];let total=0;
  try {
    for(;;) {
      const {done,value}=await reader.read(); if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES)throw Error('Feed too large');
      chunks.push(value);
    }
  } finally {await reader.cancel().catch(()=>{});}
  const buffer=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(buffer);
}
async function readFeed(feed) {
  const url=new URL(feed.url);
  if(url.protocol!=='https:'||!ALLOWED_FEED_HOSTS.has(url.hostname)||url.username||url.password||url.port)
    throw Error('UNAPPROVED_FEED_ORIGIN');
  const response=await fetch(url,{redirect:'error',headers:{accept:'application/rss+xml, application/atom+xml, application/xml'},signal:AbortSignal.timeout(15000)});
  const entries=parseSyndication(await readBounded(response));
  return {id:feed.id,entries};
}
async function getCloudflareObservation() {
  // Cloudflare Intel/Attack Surface read only. Missing token preserves first-party feed capability.
  const token=process.env.CF_INTEL_READ_TOKEN, accountId=process.env.CF_ACCOUNT_ID;
  if(!token||!accountId)return {issues:[],zoneCount:0,blocked:['cloudflare-credential-not-configured']};
  if(!/^[a-f0-9]{32}$/i.test(accountId))return {issues:[],zoneCount:0,blocked:['cloudflare-account-invalid']};
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  const base='https://api.cloudflare.com/client/v4';
  const paths=['/zones?per_page=100','/accounts/'+accountId+'/intel/attack-surface-report/issues?per_page=100'];
  const responses=await Promise.allSettled(paths.map(async path=>{
    const res=await fetch(base+path,{redirect:'error',headers,signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error('HTTP_'+res.status);
    const raw=await res.text();if(raw.length>750000)throw Error('PROVIDER_RESPONSE_TOO_LARGE');
    const json=JSON.parse(raw);
    if(json.success!==true)throw Error('CLOUDFLARE_API_FAILED');
    return json.result;
  }));
  const blocked=[];
  const zones=responses[0].status==='fulfilled'?responses[0].value:[];
  if(responses[0].status==='rejected')blocked.push('cloudflare-zones-unavailable');
  const issues=responses[1].status==='fulfilled'?responses[1].value:[];
  if(responses[1].status==='rejected')blocked.push('cloudflare-attack-surface-unavailable');
  return {
    zoneCount:Array.isArray(zones)?zones.length:0,
    issues:(Array.isArray(issues)?issues:Array.isArray(issues?.issues)?issues.issues:[]).map(x=>({
      severity:x.severity,issue_class:x.issue_class,status:x.status
    })),
    blocked,
  };
}
export async function main() {
  const configuration=JSON.parse(await readFile(new URL('../config/security-threat-watch.json',import.meta.url),'utf8'));
  const cost=brokeFounderGate({incrementalMonthlyCost:configuration.incrementalMonthlyCost,incrementalOneTimeCost:configuration.incrementalOneTimeCost});
  if(!cost.allowed)throw Error(cost.reason);
  const observations=await Promise.allSettled(configuration.feeds.map(readFeed));
  const entries=[];const blocked=[];
  for(let i=0;i<observations.length;i++) {
    const result=observations[i];
    if(result.status==='fulfilled')entries.push(...result.value.entries.map(entry=>({...entry,feedId:result.value.id})));
    else blocked.push(configuration.feeds[i].id+'-unavailable');
  }
  const cf=await getCloudflareObservation();
  blocked.push(...cf.blocked);
  const found=extractIndicators(entries.map(x=>x.title+' '+x.summary).join(' '));
  const articleHashes=entries.map(entry=>createHash('sha256').update(entry.feedId+'\n'+entry.title+'\n'+entry.link).digest('hex')).slice(0,100);
  const receipt=summarizePortfolioObservation({zoneCount:cf.zoneCount,issues:cf.issues,feedEntries:entries,articleCount:entries.length,
    indicatorCount:found.cves.length+found.ghsas.length+found.ips.length+found.domains.length,blockedSources:blocked});
  const result={...receipt,project:'jussray/founder-control-room',runUtc:new Date().toISOString(),
    feedSources:configuration.feeds.map(({id})=>id),
    articleHashes,
    iocCounts:Object.fromEntries(Object.entries(found).map(([k,v])=>[k,v.length])),
    detectedPromptInjectionArticles:entries.filter(e=>detectPromptInjection(e.title+' '+e.summary).suspected).length,
    activePolicy:{mode:'observe-only',costCapUsd:0,autoMutations:false,founderRequired:true},
    provenance:{githubSha:process.env.GITHUB_SHA||null,providerState:cf.blocked.length?'PARTIAL':'OBSERVED'},
    note:'Findings are signals, not verified compromise or identity attribution; no external content is executable instruction.'};
  await mkdir('artifacts/security-threat-watch',{recursive:true});
  await writeFile(OUT,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:result.status,counts:result.counts,action:result.action,receiptPath:OUT}));
  if(observations.every(x=>x.status==='rejected'))process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{
  console.error('Security observation failed:',truncateError(e));process.exitCode=1;
});