#!/usr/bin/env node
// First-party FCR ruleset witness: read-only, pinned to existing Juss & Co policy.
// No existing-ruleset update: GitHub does not document an atomic conditional write.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SUBJECT = Object.freeze({
  repository:'jussray/jussray',ruleId:26428639,ruleName:'Production',branch:'main',pullRequest:69,
  checks:Object.freeze(['Independent Review Evidence','Review Gate Unit Tests','Juss & Co Site Browser Proof','Repo Reality / exact-head']),
});
const SHA=/^[a-f0-9]{40}$/i, API='https://api.github.com/repos/'+SUBJECT.repository;
function obj(x,n){if(!x||typeof x!=='object'||Array.isArray(x))throw Error(n+' missing or incomplete');return x;}
function arr(x,n){if(!Array.isArray(x))throw Error(n+' missing or incomplete');return x;}
function stable(x){
  if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
  if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
function hash(x){return createHash('sha256').update(stable(x)).digest('hex');}
export function assessJusscoRuleset(readback,{mainSha,prHeadSha}={}){
  const r=obj(readback,'ruleset');
  if(!SHA.test(mainSha||'')||!SHA.test(prHeadSha||''))throw Error('Exact main and PR head SHAs required');
  if(r.id!==SUBJECT.ruleId||r.name!==SUBJECT.ruleName||r.source!==SUBJECT.repository||r.target!=='branch'||r.enforcement!=='active')
    throw Error('Pinned ruleset identity or enforcement mismatch');
  const refs=obj(obj(r.conditions,'ref conditions').ref_name,'ref_name');
  const includes=arr(refs.include,'included refs'),excludes=arr(refs.exclude,'excluded refs');
  if(!includes.some(x=>['~ALL','~DEFAULT_BRANCH','refs/heads/main'].includes(x))||
     excludes.some(x=>['~ALL','~DEFAULT_BRANCH','refs/heads/main'].includes(x)))
    throw Error('Current main ruleset coverage not established');
  const rules=arr(r.rules,'rules'),actors=arr(r.bypass_actors,'bypass actors'),findings=[];
  const one=type=>{
    const group=rules.filter(x=>obj(x,'rule').type===type);
    if(group.length>1)throw Error('Duplicate '+type+' rules');
    return group[0];
  };
  const review=one('pull_request');
  if(!review||!review.parameters||!Number.isInteger(review.parameters.required_approving_review_count))
    throw Error('Incomplete review protection');
  if(review.parameters.required_approving_review_count!==0)findings.push('REVIEW_POLICY_CONFLICT');
  if(review.parameters.required_review_thread_resolution!==true)findings.push('REVIEW_THREADS_NOT_REQUIRED');
  const status=one('required_status_checks');
  if(!status||!status.parameters)throw Error('Missing status check rule');
  const checks=arr(status.parameters.required_status_checks,'required checks');
  if(status.parameters.strict_required_status_checks_policy!==true)findings.push('STATUS_CHECKS_NOT_STRICT');
  const names=checks.map(c=>{
    obj(c,'status check');
    if(typeof c.context!=='string'||!c.context.trim())throw Error('Invalid required check');
    if(c.integration_id!=null&&(!Number.isInteger(c.integration_id)||c.integration_id<1))
      throw Error('Invalid check producer identity');
    return c.context;
  });
  if(new Set(names).size!==names.length)throw Error('Duplicate required checks');
  for(const check of SUBJECT.checks)if(!names.includes(check))findings.push('MISSING_CHECK:'+check);
  if(!one('non_fast_forward'))findings.push('FORCE_PUSH_PROTECTION_MISSING');
  if(!one('deletion'))findings.push('DELETION_PROTECTION_MISSING');
  if(actors.length)findings.push('BYPASS_ACTORS_REVIEW_REQUIRED');
  const deployment=one('required_deployments');
  let environments=[];
  if(deployment){
    if(!deployment.parameters)throw Error('Incomplete deployment policy');
    environments=arr(deployment.parameters.required_deployment_environments,'deployment environments');
    if(environments.some(x=>typeof x!=='string'))throw Error('Invalid deployment environment');
    if(environments.some(x=>/\/ jussray-pr-\d+$/i.test(x)))findings.push('HISTORICAL_PR_DEPLOYMENTS_REVIEW_REQUIRED');
  }
  return {
    contract:'fcr/jussco-ruleset-readback@v1',
    subject:{repository:SUBJECT.repository,rulesetId:SUBJECT.ruleId,pullRequest:SUBJECT.pullRequest},
    exactMainHead:mainSha.toLowerCase(),exactPrHead:prHeadSha.toLowerCase(),
    rulesetFingerprint:hash(r),rulesetUpdatedAt:r.updated_at||null,
    observed:{mandatoryChecks:names,bypassActorCount:actors.length,approvalCount:review.parameters.required_approving_review_count,deploymentRequirementCount:environments.length},
    findings,
    disposition:findings.length?'BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE':'NO_CHANGE_REQUIRED',
    mutationAuthorized:false,releaseAuthorized:false,
  };
}
async function read(url,request,token){
  const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'fcr-ruleset-readback'};
  if(token)headers.Authorization='Bearer '+token;
  const res=await request(url,{method:'GET',headers,redirect:'error'});
  if(!res.ok)throw Error('GitHub read unavailable: HTTP '+res.status);
  return res.json();
}
export async function runJusscoAudit({request=fetch,token='',now=()=>new Date()}={}){
  const get=p=>read(API+p,request,token);
  const main=await get('/branches/main'),pr=await get('/pulls/69');
  const mainSha=main?.commit?.sha,prHeadSha=pr?.head?.sha;
  if(!SHA.test(mainSha||'')||!SHA.test(prHeadSha||'')||pr?.base?.ref!=='main'||
    pr?.base?.sha!==mainSha||pr?.state!=='open'||pr?.draft)
    throw Error('PR/main relationship incomplete or stale');
  const ruleset=await get('/rulesets/26428639');
  const result=assessJusscoRuleset(ruleset,{mainSha,prHeadSha});
  const again=await get('/branches/main'),againPr=await get('/pulls/69'),againRule=await get('/rulesets/26428639');
  if(again?.commit?.sha!==mainSha||againPr?.head?.sha!==prHeadSha||
     againPr?.base?.sha!==mainSha||hash(againRule)!==result.rulesetFingerprint)
    throw Error('Provider state changed during audit; discard stale witness');
  return {...result,observedAt:now().toISOString(),readOnly:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runJusscoAudit({token:process.env.FCR_GITHUB_RULESET_READ_TOKEN||''})
   .then(v=>{console.log(JSON.stringify(v,null,2));if(v.findings.length)process.exitCode=2;})
   .catch(e=>{console.error('FCR governance BLOCKED: '+e.message);process.exitCode=1;});
}
