import test from 'node:test';
import assert from 'node:assert/strict';
import {assessJusscoRuleset,runJusscoAudit,SUBJECT} from './audit-jussco-games-ruleset.mjs';
const MAIN='a'.repeat(40),HEAD='b'.repeat(40);
const review=n=>({type:'pull_request',parameters:{required_approving_review_count:n,required_review_thread_resolution:true}});
const checks=names=>({type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:names.map(context=>({context}))}});
const baseline=()=>({
 id:26428639,name:'Production',source:'jussray/jussray',target:'branch',enforcement:'active',updated_at:'2026-11-08T02:55:57Z',
 conditions:{ref_name:{include:['~ALL','refs/heads/main'],exclude:[]}},
 bypass_actors:[{actor_type:'Integration',actor_id:4047066,bypass_mode:'always'}],
 rules:[{type:'deletion'},review(1),checks([]),{type:'required_deployments',parameters:{required_deployment_environments:['Think Tank / jussray-pr-69','Think Tank / production']}}],
});
test('observed drift is fingerprinted and cannot authorize mutation',()=>{
 const a=assessJusscoRuleset(baseline(),{mainSha:MAIN,prHeadSha:HEAD});
 assert.equal(a.disposition,'BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE');
 assert.equal(a.mutationAuthorized,false);assert.equal(a.releaseAuthorized,false);
 assert.equal(a.findings.filter(x=>x.startsWith('MISSING_CHECK:')).length,4);
 for(const reason of ['REVIEW_POLICY_CONFLICT','FORCE_PUSH_PROTECTION_MISSING','BYPASS_ACTORS_REVIEW_REQUIRED','HISTORICAL_PR_DEPLOYMENTS_REVIEW_REQUIRED'])
   assert.ok(a.findings.includes(reason));
 assert.match(a.rulesetFingerprint,/^[a-f0-9]{64}$/);
});
test('fingerprints ignore field order',()=>{
 const a=baseline(),b={rules:a.rules,conditions:a.conditions,bypass_actors:a.bypass_actors,updated_at:a.updated_at,enforcement:a.enforcement,target:a.target,source:a.source,name:a.name,id:a.id};
 assert.equal(assessJusscoRuleset(a,{mainSha:MAIN,prHeadSha:HEAD}).rulesetFingerprint,assessJusscoRuleset(b,{mainSha:MAIN,prHeadSha:HEAD}).rulesetFingerprint);
});
test('fully protected rule cannot self-authorize release',()=>{
 const x=baseline();x.bypass_actors=[];x.rules=[{type:'deletion'},{type:'non_fast_forward'},review(0),checks(SUBJECT.checks)];
 const r=assessJusscoRuleset(x,{mainSha:MAIN,prHeadSha:HEAD});
 assert.deepEqual(r.findings,[]);assert.equal(r.disposition,'NO_CHANGE_REQUIRED');assert.equal(r.mutationAuthorized,false);assert.equal(r.releaseAuthorized,false);
});
test('wrong identity, missing data and main exclusions refuse assessment',()=>{
 for(const alter of [
  x=>{delete x.bypass_actors;},x=>{x.id=1;},x=>{x.enforcement='disabled';},
  x=>{x.conditions.ref_name.exclude=['refs/heads/main'];},
  x=>{x.rules.find(r=>r.type==='required_status_checks').parameters.required_status_checks=null;},
  x=>{x.rules.push(review(0));}
 ]){
  const a=baseline();alter(a);assert.throws(()=>assessJusscoRuleset(a,{mainSha:MAIN,prHeadSha:HEAD}));
 }
});
test('live audit is GET-only and rejects concurrent provider changes',async()=>{
 const main={commit:{sha:MAIN}},pr={state:'open',draft:false,base:{ref:'main',sha:MAIN},head:{sha:HEAD}},state=baseline(),calls=[];
 const request=async (url,options)=>{calls.push([url,options.method]);return {ok:true,status:200,json:async()=>url.includes('/branches/')?main:url.includes('/pulls/')?pr:state};};
 const result=await runJusscoAudit({request,now:()=>new Date('2026-11-08T04:00:00Z')});
 assert.equal(result.readOnly,true);assert.equal(result.exactMainHead,MAIN);assert.equal(calls.length,6);
 assert.ok(calls.every(([url,method])=>url.startsWith('https://api.github.com/repos/jussray/jussray/')&&method==='GET'));
 let k=0;const changed=async (url,opts)=>{const res=await request(url,opts);if(url.includes('/rulesets/')&&++k===2)return {ok:true,status:200,json:async()=>({...state,updated_at:'changed'})};return res;};
 await assert.rejects(()=>runJusscoAudit({request:changed}),/Provider state changed/);
});

test('FCR can inspect open PR #71 with stale base without pretending it is merge-ready',async()=>{
 const pr={number:71,state:'open',draft:false,merged:false,base:{ref:'main',sha:'c'.repeat(40)},head:{sha:HEAD}};
 const calls=[];
 const request=async (url,opts)=>{calls.push([url,opts.method]);return {ok:true,status:200,json:async()=>url.includes('/branches/')?{commit:{sha:MAIN}}:url.includes('/pulls/')?pr:baseline()};};
 const result=await runJusscoAudit({request,pullRequest:71});
 assert.equal(result.subject.pullRequest,71);
 assert.equal(result.pullRequestState,'open-candidate');
 assert.ok(result.findings.includes('PR_BASE_STALE'));
 assert.equal(result.mutationAuthorized,false);assert.equal(result.releaseAuthorized,false);
 assert.equal(calls.length,6);
 assert.ok(calls.every(([url,method])=>url.startsWith('https://api.github.com/repos/jussray/jussray/')&&method==='GET'));
 assert.ok(calls.filter(([url])=>url.includes('/pulls/71')).length===2);
});
test('FCR retains merged PR #69 as historical evidence without merge or release authority',async()=>{
 const pr={number:69,state:'closed',draft:false,merged:true,merged_at:'2026-11-08T18:35:46Z',merge_commit_sha:MAIN,base:{ref:'main',sha:'c'.repeat(40)},head:{sha:HEAD}};
 const request=async url=>({ok:true,status:200,json:async()=>url.includes('/branches/')?{commit:{sha:MAIN}}:url.includes('/pulls/')?pr:baseline()});
 const result=await runJusscoAudit({request});
 assert.equal(result.subject.pullRequest,69);
 assert.equal(result.pullRequestState,'merged-historical');
 assert.equal(result.disposition,'HISTORICAL_MERGED_READ_ONLY');
 assert.ok(result.findings.includes('PR_ALREADY_MERGED_HISTORICAL'));
 assert.equal(result.mergeCommit,MAIN);
 assert.equal(result.mutationAuthorized,false);assert.equal(result.releaseAuthorized,false);
});
test('FCR cannot audit unapproved pull requests or closed-unmerged PRs',async()=>{
 await assert.rejects(()=>runJusscoAudit({pullRequest:70}),/outside pinned FCR audit scope/);
 assert.throws(()=>assessJusscoRuleset(baseline(),{mainSha:MAIN,prHeadSha:HEAD,pullRequest:70}),/outside pinned FCR audit scope/);
 const pr={number:71,state:'closed',merged:false,base:{ref:'main',sha:MAIN},head:{sha:HEAD}};
 const request=async url=>({ok:true,status:200,json:async()=>url.includes('/branches/')?{commit:{sha:MAIN}}:url.includes('/pulls/')?pr:baseline()});
 await assert.rejects(()=>runJusscoAudit({pullRequest:71,request}),/outside verified active\/merged states/);
});
