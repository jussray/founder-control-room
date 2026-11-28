import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPullRequests, createPullScanBudget } from './portfolio-pr-triage.mjs';
const head = 'a'.repeat(40), repo = 'example/private-fixture';
const pr = {number: 96,state:'open',head:{sha:head,repo:{full_name:repo}}};
const run = (i, overrides={}) => ({id:i,run_attempt:2,head_sha:head,status:'completed',conclusion:'failure',...overrides});
const job = (i,overrides={}) => ({id:i,run_id:i,run_attempt:2,head_sha:head,status:'completed',conclusion:'failure',runner_name:null,steps:[],...overrides});
function reader({runs=Array.from({length:13},(_,i)=>run(i+1)),jobs={},pulls=[pr],after=pr,denied=false,total,jobTotal}={}) {
 return async p=>{ if(denied)throw Error('private error'); if(p.includes('/pulls?'))return pulls;if(p.endsWith('/pulls/96'))return after;if(p.includes('/actions/runs?'))return {total_count:total??runs.length,workflow_runs:runs};const id=Number(p.match(/runs\/(\d+)\//)?.[1]);const list=jobs[id]??[job(id)];return {total_count:jobTotal??list.length,jobs:list}; };
}
test('groups thirteen runnerless failures in one incident without exporting private identifiers',async()=>{const x=await scanPullRequests(repo,reader());assert.equal(x.state,'ATTENTION');assert.equal(x.runnerlessIncidents,1);assert.equal(x.runnerlessFailures,13);assert.equal(x.unclassifiedFailures,0);assert.equal(x.mutationAuthorized,false);assert.doesNotMatch(JSON.stringify(x),/example|private-fixture|aaaaaaaa|runId|jobId/);});
test('missing job steps are unknown not runnerless',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],jobs:{1:[job(1,{steps:undefined})]}}));assert.equal(x.runnerlessIncidents,0);assert.equal(x.unclassifiedFailures,1);});
test('runner with recorded failed step requires reproduction',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],jobs:{1:[job(1,{runner_name:'host',steps:[{number:1,conclusion:'failure'}]})]}}));assert.equal(x.unclassifiedFailures,1);});
test('head movement invalidates observations',async()=>{const x=await scanPullRequests(repo,reader({after:{...pr,head:{...pr.head,sha:'b'.repeat(40)}}}));assert.equal(x.state,'INCOMPLETE');assert.equal(x.runnerlessFailures,0);});
test('no access fails closed without exporting errors',async()=>{const x=await scanPullRequests(repo,reader({denied:true}));assert.equal(x.state,'INCOMPLETE');assert.doesNotMatch(JSON.stringify(x),/private error/);});
test('truncated job list remains unknown',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],jobTotal:2}));assert.equal(x.state,'INCOMPLETE');assert.equal(x.runnerlessFailures,0);});
test('truncated run list remains incomplete',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],total:101}));assert.equal(x.state,'INCOMPLETE');});
test('foreign fork is not inspected and does not count green',async()=>{const x=await scanPullRequests(repo,reader({pulls:[{...pr,head:{...pr.head,repo:{full_name:'other/repo'}}}]}));assert.equal(x.state,'INCOMPLETE');});
test('wrong attempt or head cannot establish runnerless failure',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],jobs:{1:[job(1,{run_attempt:1})]}}));assert.equal(x.state,'INCOMPLETE');assert.equal(x.runnerlessFailures,0);});
test('historical failed attempt superseded by a successful newer attempt',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1,{run_attempt:1}),run(1,{run_attempt:2,conclusion:'success'})]}));assert.equal(x.state,'OBSERVED_CHECKS_ONLY');assert.equal(x.runnerlessFailures,0);});
test('pending and empty checks never count as verified success',async()=>{for(const runs of [[],[run(1,{status:'in_progress',conclusion:null})]]){const x=await scanPullRequests(repo,reader({runs}));assert.equal(x.state,'INCOMPLETE');}});
test('bounded pagination cannot silently report complete coverage',async()=>{const x=await scanPullRequests(repo,reader({pulls:Array(20).fill(pr)}));assert.equal(x.state,'INCOMPLETE');});
test('all skipped checks are incomplete, not success',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1,{conclusion:'skipped'})]}));assert.equal(x.state,'INCOMPLETE');});
test('attempt-specific endpoint supports documented missing job attempt field',async()=>{const x=await scanPullRequests(repo,reader({runs:[run(1)],jobs:{1:[job(1,{run_attempt:undefined})]}}));assert.equal(x.runnerlessFailures,1);});
test('shared request budget prevents unbounded scanning',async()=>{const b=createPullScanBudget({repositories:1,pulls:1,jobs:1});const x=await scanPullRequests(repo,reader(),b);assert.equal(x.state,'INCOMPLETE');assert.equal(x.runnerlessFailures,1);assert.equal(x.unclassifiedFailures,12);const y=await scanPullRequests(repo,reader(),b);assert.equal(y.state,'INCOMPLETE');assert.equal(y.observedPulls,0);});
test('no open pull requests is an observation, not merge authority',async()=>{const x=await scanPullRequests(repo,reader({pulls:[]}));assert.equal(x.state,'OBSERVED_CHECKS_ONLY');assert.equal(x.observedPulls,0);assert.equal(x.mergeAuthorized,false);});
