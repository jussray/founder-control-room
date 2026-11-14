import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectJusscoRulesetPreflight, planJusscoRulesetPreflight, RULESETS, PROTECTED_REFS } from '../scripts/audit-jussco-rulesets.mjs';

const MAIN = 'a'.repeat(40);
function makeRuleset(id,name) {
  return {
    id,name,source:'jussray/jussray',target:'branch',enforcement:'active',
    updated_at:'2026-11-10T12:00:00Z',
    conditions:{ref_name:{include:name==='Governance'?['refs/heads/main']:['~ALL',...PROTECTED_REFS],exclude:[]}},
    bypass_actors:name==='Production'?[{actor_type:'RepositoryRole',actor_id:4,bypass_mode:'always'}]:[],
    rules:[
      {type:'pull_request',parameters:{required_approving_review_count:1,required_review_thread_resolution:true}},
      {type:'required_status_checks',parameters:{strict_required_status_checks_policy:name==='Production',required_status_checks:[]}},
      {type:'deletion'},...(name==='Production'?[{type:'creation'}]:[{type:'non_fast_forward'}]),
      {type:'required_deployments',parameters:{required_deployment_environments:['test']}},
    ],
  };
}
const input=()=>({
  governance:makeRuleset(RULESETS.Governance,'Governance'),
  production:makeRuleset(RULESETS.Production,'Production'),
  mainSha:MAIN,prHeadSha:'b'.repeat(40),prBaseSha:MAIN,prState:'open',prAuthor:'jussray',reviews:[],
});
test('detects real rule drift while providing no mutation capability',()=>{
  const plan=planJusscoRulesetPreflight(input());
  assert.equal(plan.mutation,null);
  assert.equal(plan.authority.providerMutationAuthority,false);
  assert.equal(plan.authority.mergeAuthority,false);
  assert.equal(plan.disposition,'BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE');
  assert.ok(plan.issues.includes('PRODUCTION_ALL_BRANCH_CREATION_LOCKOUT_RISK'));
  assert.ok(plan.issues.includes('GOVERNANCE_REVIEW_GATE_CONTEXT_MISSING'));
  assert.ok(plan.issues.includes('EXACT_HEAD_INDEPENDENT_HUMAN_REVIEW_MISSING'));
  assert.equal(plan.observations.production.deployments,1);
});
test('rejects changed identity, target, enforcement or repository',()=>{
  for (const key of ['id','name','source','target','enforcement']) {
    const bad=input();bad.governance[key]='attacker';
    assert.throws(()=>planJusscoRulesetPreflight(bad),/untrusted Governance identity/);
  }
});
test('rejects unknown, excluded, missing or duplicated protected refs',()=>{
  for (const values of [
    ['~ALL','refs/heads/main','refs/heads/evil'],
    ['~ALL','refs/heads/main'],
    ['~ALL',...PROTECTED_REFS,'refs/heads/Production'],
  ]) {
    const bad=input();bad.production.conditions.ref_name.include=values;
    assert.throws(()=>planJusscoRulesetPreflight(bad),/unexpected branch selectors|duplicate ref selectors/);
  }
  const excluded=input();excluded.production.conditions.ref_name.exclude=['refs/heads/main'];
  assert.throws(()=>planJusscoRulesetPreflight(excluded),/unexpected branch selectors/);
});
test('rejects stale PR identity and flags absent native human review',()=>{
  const stale=input();stale.prBaseSha='c'.repeat(40);
  assert.throws(()=>planJusscoRulesetPreflight(stale),/not open against the live main/);
  const invalid=input();invalid.governance.rules[0].parameters.required_approving_review_count=0;
  assert.ok(planJusscoRulesetPreflight(invalid).issues.includes('ONE_INDEPENDENT_HUMAN_APPROVAL_NOT_ENFORCED'));
});
test('retains check producer identity and rejects duplicate contexts',()=>{
  const r=input();r.governance.rules[1].parameters.required_status_checks=[{context:'Repo Reality / exact-head',integration_id:15368}];
  assert.deepEqual(planJusscoRulesetPreflight(r).observations.governance.checks,
    [{context:'Repo Reality / exact-head',integration_id:15368}]);
  r.governance.rules[1].parameters.required_status_checks.push({context:'Repo Reality / exact-head',integration_id:3});
  assert.throws(()=>planJusscoRulesetPreflight(r),/duplicate required checks/);
});
test('only an independent human review on exact head counts',()=>{
  const r=input();
  r.reviews=[
    {user:{login:'independent',type:'User'},state:'APPROVED',commit_id:'b'.repeat(40),submitted_at:'2026-11-10T10:00:00Z'},
    {user:{login:'jussray',type:'User'},state:'APPROVED',commit_id:'b'.repeat(40),submitted_at:'2026-11-10T10:01:00Z'},
    {user:{login:'bot',type:'Bot'},state:'APPROVED',commit_id:'b'.repeat(40),submitted_at:'2026-11-10T10:02:00Z'},
  ];
  assert.equal(planJusscoRulesetPreflight(r).candidate.independentHumanReviewCount,1);
  r.reviews[0].commit_id='a'.repeat(40);
  assert.ok(planJusscoRulesetPreflight(r).issues.includes('EXACT_HEAD_INDEPENDENT_HUMAN_REVIEW_MISSING'));
  r.reviews[0].commit_id='b'.repeat(40);
  r.reviews.push({user:{login:'independent',type:'User'},state:'CHANGES_REQUESTED',
    commit_id:'b'.repeat(40),submitted_at:'2026-11-10T10:05:00Z'});
  assert.ok(planJusscoRulesetPreflight(r).issues.includes('EXACT_HEAD_INDEPENDENT_HUMAN_REVIEW_MISSING'));
});
test('uses only five pinned GET operations and never PUTs',async()=>{
  const data=input();
  const readbacks=[data.governance,data.production,{commit:{sha:MAIN}},
    {state:'open',user:{login:'jussray'},head:{sha:'b'.repeat(40)},base:{sha:MAIN}},[]];
  const requests=[];
  const report=await collectJusscoRulesetPreflight({token:'test-only',request:async(url,options)=>{
    const index=requests.length;requests.push({url,method:options.method});
    return {ok:true,status:200,json:async()=>readbacks[index]};
  }});
  assert.equal(report.repository,'jussray/jussray');
  assert.deepEqual(requests.map(x=>x.method),['GET','GET','GET','GET','GET']);
  assert.deepEqual(requests.map(x=>new URL(x.url).pathname),[
    '/repos/jussray/jussray/rulesets/26857902','/repos/jussray/jussray/rulesets/26428639',
    '/repos/jussray/jussray/branches/main','/repos/jussray/jussray/pulls/74',
    '/repos/jussray/jussray/pulls/74/reviews',
  ]);
});
test('fails closed when trusted GitHub provider readback is absent',async()=>{
  const verbs=[];const request=async(_url,options)=>{verbs.push(options.method);return {ok:false,status:403};};
  await assert.rejects(()=>collectJusscoRulesetPreflight({token:'test',request}),/HTTP 403/);
  await assert.rejects(()=>collectJusscoRulesetPreflight({token:'',request}),/credential unavailable/);
  assert.ok(verbs.every(x=>x==='GET'));
});
