// Read-only, bounded exact-head PR observation. No private identities leave this module.
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[-\w.]+\/[-\w.]+$/;
const FAIL = new Set(['failure','timed_out','startup_failure','action_required']);
const TERMINAL = new Set(['success','neutral','skipped','cancelled',...FAIL]);
const MAX_PRS = 20, MAX_RUNS = 100, MAX_JOBS = 100;
const id = n => Number.isSafeInteger(n) && n > 0;
const eligible = (p,repo) => p?.state === 'open' && id(p.number) && SHA.test(p.head?.sha ?? '') && p.head?.repo?.full_name === repo;
export function createPullScanBudget({repositories=100,pulls=60,jobs=60}={}) {
 if (![repositories,pulls,jobs].every(n=>Number.isSafeInteger(n)&&n>=0)) throw Error('INVALID_BUDGET');
 return {repositories,pulls,jobs};
}
export async function scanPullRequests(repo, read, budget=createPullScanBudget()) {
 const out={state:'INCOMPLETE',observedPulls:0,runnerlessIncidents:0,runnerlessFailures:0,unclassifiedFailures:0,incompletePulls:0,authority:'observation_only',mutationAuthorized:false,mergeAuthorized:false,deployAuthorized:false};
 if(!REPO.test(repo)||typeof read!=='function'||!Number.isSafeInteger(budget?.repositories)||budget.repositories<1)return out;
 budget.repositories--;
 const root='/repos/'+repo.split('/').map(encodeURIComponent).join('/');
 let prs;
 try { prs=await read(root+'/pulls?state=open&per_page='+MAX_PRS); } catch {return out;}
 if(!Array.isArray(prs)||prs.length>MAX_PRS)return out;
 let incomplete=prs.length===MAX_PRS;
 const seen=new Set();
 for(const p of prs){
  if(!eligible(p,repo)||seen.has(p.number)||!Number.isSafeInteger(budget.pulls)||budget.pulls<1){incomplete=true;out.incompletePulls++;continue;}
  seen.add(p.number);budget.pulls--;
  const head=p.head.sha;
  let runnerless=0,unclassified=0,partial=false;
  try{
   const page=await read(root+'/actions/runs?head_sha='+head+'&per_page='+MAX_RUNS);
   if(!Array.isArray(page?.workflow_runs)||page.workflow_runs.length>MAX_RUNS||page.total_count!==page.workflow_runs.length||!page.workflow_runs.length)throw Error('RUNS_INCOMPLETE');
   const latest=new Map();
   for(const r of page.workflow_runs){
    if(r?.head_sha!==head||!id(r.id)||!id(r.run_attempt)){partial=true;continue;}
    const old=latest.get(r.id);
    if(!old||r.run_attempt>old.run_attempt)latest.set(r.id,r);
    else if(r.run_attempt===old.run_attempt&&(r.status!==old.status||r.conclusion!==old.conclusion))partial=true;
   }
   if(!latest.size||![...latest.values()].some(r=>r.status==='completed'&&(r.conclusion==='success'||FAIL.has(r.conclusion))))partial=true;
   for(const r of latest.values()){
    if(r.status!=='completed'||!TERMINAL.has(r.conclusion)||r.conclusion==='cancelled'){partial=true;continue;}
    if(!FAIL.has(r.conclusion))continue;
    if(!Number.isSafeInteger(budget.jobs)||budget.jobs<1){partial=true;unclassified++;continue;}
    budget.jobs--;
    let j;
    try{j=await read(root+'/actions/runs/'+r.id+'/attempts/'+r.run_attempt+'/jobs?per_page='+MAX_JOBS);}catch{partial=true;unclassified++;continue;}
    const jobIds=new Set();
    const valid=Array.isArray(j?.jobs)&&j.jobs.length<=MAX_JOBS&&j.total_count===j.jobs.length&&j.jobs.every(x=>x&&id(x.id)&&!jobIds.has(x.id)&&jobIds.add(x.id)&&x.run_id===r.id&&(x.run_attempt==null||x.run_attempt===r.run_attempt)&&x.head_sha===head&&x.status==='completed'&&TERMINAL.has(x.conclusion));
    if(!valid){partial=true;unclassified++;continue;}
    const failed=j.jobs.filter(x=>FAIL.has(x.conclusion));
    if(failed.length&&failed.every(x=>Object.hasOwn(x,'runner_name')&&(x.runner_name===null||x.runner_name==='')&&Array.isArray(x.steps)&&x.steps.length===0))runnerless++;
    else unclassified++;
   }
   const again=await read(root+'/pulls/'+p.number);
   if(!eligible(again,repo)||again.number!==p.number||again.head.sha!==head)throw Error('PR_HEAD_CHANGED');
   out.observedPulls++;
   out.runnerlessFailures+=runnerless;
   out.runnerlessIncidents+=runnerless?1:0;
   out.unclassifiedFailures+=unclassified;
   if(partial){incomplete=true;out.incompletePulls++;}
  }catch{incomplete=true;out.incompletePulls++;}
 }
 out.state=incomplete?'INCOMPLETE':out.runnerlessFailures||out.unclassifiedFailures?'ATTENTION':'OBSERVED_CHECKS_ONLY';
 return out;
}
