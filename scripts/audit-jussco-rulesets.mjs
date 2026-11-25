import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// FCR read-only reconciliation. Never PUT an existing ruleset without a provider-side
// atomic precondition; GitHub currently offers no documented CAS for this endpoint.
export const CONTRACT = 'fcr/jussco-ruleset-preflight@v1';
export const REPOSITORY = 'jussray/jussray';
export const RULESETS = Object.freeze({ Governance: 26857902, Production: 26428639 });
export const PROTECTED_REFS = Object.freeze([
  'refs/heads/main', 'refs/heads/Production', 'refs/heads/releases', 'refs/heads/Deployed',
]);
const SHA40 = /^[a-f\d]{40}$/i;
const fail = message => { throw new Error('JUSSCO_RULESET_PREFLIGHT_BLOCKED: ' + message); };
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function snapshot(raw, name) {
  if (!isObject(raw) || raw.id !== RULESETS[name] || raw.name !== name
    || raw.source !== REPOSITORY || raw.target !== 'branch' || raw.enforcement !== 'active')
    fail('untrusted ' + name + ' identity or enforcement');
  const refs = raw.conditions?.ref_name;
  if (!Array.isArray(refs?.include) || !Array.isArray(refs.exclude)
    || !Array.isArray(raw.rules) || !Array.isArray(raw.bypass_actors))
    fail(name + ' has incomplete provider readback');
  if (new Set(refs.include).size !== refs.include.length || new Set(refs.exclude).size !== refs.exclude.length)
    fail(name + ' has duplicate ref selectors');
  for (const type of ['pull_request', 'required_status_checks']) {
    if (raw.rules.filter(r => r?.type === type).length !== 1)
      fail(name + ' needs exactly one ' + type + ' rule');
  }
  const pull = raw.rules.find(r => r.type === 'pull_request');
  const status = raw.rules.find(r => r.type === 'required_status_checks');
  const checks = status.parameters?.required_status_checks;
  if (!Array.isArray(checks) || checks.some(x => typeof x?.context !== 'string' || !x.context))
    fail(name + ' has unverified required check definitions');
  if (new Set(checks.map(x => x.context)).size !== checks.length)
    fail(name + ' has duplicate required checks');
  return {
    id:raw.id, name, fingerprint:createHash('sha256').update(JSON.stringify(canonical(raw))).digest('hex'),
    updatedAt:raw.updated_at ?? null, include:[...refs.include], exclude:[...refs.exclude],
    approvals:pull.parameters?.required_approving_review_count,
    strict:status.parameters?.strict_required_status_checks_policy === true,
    checks:checks.map(x => ({ context:x.context, integration_id:x.integration_id ?? null })),
    bypassActors:raw.bypass_actors.length,
    creation:raw.rules.some(x => x.type === 'creation'),
    forcePushProtection:raw.rules.some(x => x.type === 'non_fast_forward'),
    deletionProtection:raw.rules.some(x => x.type === 'deletion'),
    deployments:raw.rules.find(x => x.type === 'required_deployments')
      ?.parameters?.required_deployment_environments?.length ?? 0,
    ruleTypes:raw.rules.map(x => x.type),
  };
}
export function planJusscoRulesetPreflight(input) {
  const { governance, production, mainSha, prHeadSha, prBaseSha, prState, prAuthor, reviews } = input;
  if (![mainSha, prHeadSha, prBaseSha].every(x => typeof x === 'string' && SHA40.test(x)))
    fail('main and pull request identity must have exact provider SHAs');
  if (prState !== 'open' || prBaseSha !== mainSha)
    fail('PR #74 is not open against the live main SHA');
  if (typeof prAuthor !== 'string' || !prAuthor || !Array.isArray(reviews))
    fail('PR author and live reviewer readback are mandatory');
  const gov = snapshot(governance, 'Governance');
  const prod = snapshot(production, 'Production');
  if (JSON.stringify(gov.include) !== JSON.stringify(['refs/heads/main']) || gov.exclude.length)
    fail('Governance branch scope drift requires manual review');
  const included = new Set(prod.include);
  if (prod.exclude.length || prod.include.some(x => x !== '~ALL' && !PROTECTED_REFS.includes(x))
    || PROTECTED_REFS.some(x => !included.has(x)))
    fail('Production has unexpected branch selectors; do not widen or narrow automatically');
  const latest = new Map();
  for (const review of reviews) {
    if (!isObject(review) || typeof review.user?.login !== 'string' || typeof review.state !== 'string')
      fail('invalid provider review readback');
    if (!Number.isFinite(Date.parse(review.submitted_at || '')))
      fail('review submission timestamp missing');
    const login = review.user.login.toLowerCase();
    const prev = latest.get(login);
    if (!prev || Date.parse(review.submitted_at) >= Date.parse(prev.submitted_at)) latest.set(login,review);
  }
  const independent = [...latest.values()].filter(r => r.state === 'APPROVED'
    && r.commit_id === prHeadSha && r.user.login.toLowerCase() !== prAuthor.toLowerCase()
    && r.user.type === 'User');
  const issues = [];
  if (!independent.length) issues.push('EXACT_HEAD_INDEPENDENT_HUMAN_REVIEW_MISSING');
  if (gov.approvals !== 1 || prod.approvals !== 1)
    issues.push('ONE_INDEPENDENT_HUMAN_APPROVAL_NOT_ENFORCED');
  if (!gov.strict) issues.push('GOVERNANCE_STRICT_STATUS_CHECKS_DISABLED');
  if (!gov.checks.some(x => x.context === 'Review Gate Unit Tests'))
    issues.push('GOVERNANCE_REVIEW_GATE_CONTEXT_MISSING');
  if (prod.include.includes('~ALL')) issues.push('PRODUCTION_ALL_BRANCH_CREATION_LOCKOUT_RISK');
  if (!prod.forcePushProtection) issues.push('PRODUCTION_FORCE_PUSH_PROTECTION_MISSING');
  if (prod.bypassActors) issues.push('PRODUCTION_BYPASS_ACTORS_REQUIRE_INDEPENDENT_REVIEW');
  if (!gov.forcePushProtection || !gov.deletionProtection || !prod.deletionProtection)
    issues.push('PROTECTED_BRANCH_BASELINE_INCOMPLETE');
  if (!prod.strict || !prod.checks.length) issues.push('PRODUCTION_REQUIRED_CHECKS_INCOMPLETE');
  return {
    contract:CONTRACT, repository:REPOSITORY,
    candidate:{mainSha,prNumber:74,prHeadSha,prBaseSha,independentHumanReviewCount:independent.length},
    observations:{governance:gov,production:prod}, issues,
    actionOrder:[
      'Verify check producer integration IDs and branch coverage before adding contexts',
      'Narrow Production ~ALL to the four approved protected ref selectors; preserve every other rule',
      'Review bypass actor purpose before changing the bypass list',
      'Strengthen Governance checks without removing existing integrations or required deployments',
      'Preserve one independent GitHub human approval on the final head',
      'Get fresh GitHub administrator readback after separately authorized changes',
    ],
    authority:{observationOnly:true,providerMutationAuthority:false,mergeAuthority:false,deployAuthority:false},
    disposition:issues.length ? 'BLOCKED_PROVIDER_ATOMIC_PRECONDITION_UNAVAILABLE' : 'NO_CHANGE_REQUIRED',
    mutation:null,
  };
}
export async function collectJusscoRulesetPreflight({ token, request=fetch }) {
  if (typeof token !== 'string' || !token.trim()) fail('trusted GitHub read credential unavailable');
  const paths = [
    '/rulesets/26857902', '/rulesets/26428639', '/branches/main',
    '/pulls/74', '/pulls/74/reviews?per_page=100',
  ];
  const get = async path => {
    const result = await request('https://api.github.com/repos/' + REPOSITORY + path, {
      method:'GET', headers:{
        Accept:'application/vnd.github+json', Authorization:'Bearer ' + token,
        'X-GitHub-Api-Version':'2022-11-28',
      },
    });
    if (!result.ok) fail('GitHub readback unavailable at ' + path.split('?')[0] + ': HTTP ' + result.status);
    return result.json();
  };
  const [governance,production,main,pr,reviews] = await Promise.all(paths.map(get));
  if (reviews.length === 100) fail('review list may be truncated; pagination required before assessment');
  return planJusscoRulesetPreflight({
    governance,production,mainSha:main.commit?.sha,prHeadSha:pr.head?.sha,
    prBaseSha:pr.base?.sha,prState:pr.state,prAuthor:pr.user?.login,reviews,
  });
}
// Historical v1 exports remain for receipt compatibility. Current CLI uses v2.
export function assessCurrentJussco({mainSha,pull,commit,timeline,rulesets}) {
  const sha=/^[a-f0-9]{40}$/i;
  if(!sha.test(mainSha)||!sha.test(pull?.head?.sha)||!sha.test(pull?.base?.sha)||!Number.isSafeInteger(pull?.number)||pull.number<1||pull.state!=="open"||pull.base.ref!=="main"||commit?.sha!==pull.head.sha||!Array.isArray(timeline)||!Array.isArray(rulesets)) throw Error("Incomplete provider evidence");
  const issues=[];
  if(pull.base.sha!==mainSha)issues.push("PR_BASE_STALE");
  if(pull.draft!==false)issues.push("PR_NOT_READY");
  const created=Date.parse(commit.commit?.committer?.date||"");
  const events=timeline.filter(e=>/^auto_(merge|squash|rebase)_(enabled|disabled)$/.test(e?.event||""));
  if(events.some(e=>!Number.isFinite(Date.parse(e.created_at))))throw Error("Invalid event timestamp");
  const latest=events.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).at(-1);
  const ui=latest?.event.endsWith("_enabled")&&latest.actor?.login==="jussray"&&Object.hasOwn(latest,"performed_via_github_app")&&latest.performed_via_github_app===null&&pull.auto_merge?.enabled_by?.login==="jussray";
  const approval=!ui||!Number.isFinite(created)?"FOUNDER_SIGNAL_NOT_PROVEN":Date.parse(latest.created_at)<created?"STALE_FOUNDER_SIGNAL":"FOUNDER_SIGNAL_OBSERVED_PUSH_FRESHNESS_UNVERIFIED";
  if(approval!=="FOUNDER_SIGNAL_OBSERVED_PUSH_FRESHNESS_UNVERIFIED")issues.push(approval);
  const mainRefs=new Set(["~DEFAULT_BRANCH","~ALL","refs/heads/main"]);
  const known=new Set([...mainRefs,"refs/heads/Production","refs/heads/releases","refs/heads/Deployed"]);
  const active=[];
  for(const r of rulesets){
    if(r.target!=="branch"||r.enforcement==="disabled"||r.enforcement==="evaluate")continue;
    const refs=r.conditions?.ref_name;
    if(r.enforcement!=="active"||!Array.isArray(refs?.include)||!Array.isArray(refs?.exclude)||!Array.isArray(r.rules)||!Array.isArray(r.bypass_actors))throw Error("Incomplete active ruleset");
    if([...refs.include,...refs.exclude].some(x=>!known.has(x))){issues.push("UNKNOWN_RULESET_SCOPE");continue;}
    if(refs.include.some(x=>mainRefs.has(x))&&!refs.exclude.some(x=>mainRefs.has(x)))active.push(r);
  }
  const rules=active.flatMap(r=>r.rules),pr=rules.filter(r=>r.type==="pull_request"),checks=rules.filter(r=>r.type==="required_status_checks");
  const mandatory=["Independent Review Evidence","Review Gate Unit Tests","Juss & Co Site Browser Proof","Repo Reality / exact-head"];
  const contexts=new Set(checks.flatMap(r=>r.parameters?.required_status_checks||[]).filter(c=>c.integration_id===15368).map(c=>c.context));
  if(!active.length)issues.push("NO_ACTIVE_MAIN_RULESET");
  if(active.some(r=>r.bypass_actors.length))issues.push("MAIN_BYPASS_ACTORS");
  if(!pr.length||pr.some(r=>r.parameters?.required_approving_review_count!==0||r.parameters?.require_code_owner_review!==false||r.parameters?.require_last_push_approval!==false)||!pr.some(r=>r.parameters?.required_review_thread_resolution===true))issues.push("NATIVE_REVIEW_CONFLICT");
  if(!checks.some(r=>r.parameters?.strict_required_status_checks_policy===true)||mandatory.some(c=>!contexts.has(c)))issues.push("REQUIRED_EXACT_HEAD_CHECKS_MISSING");
  if(!rules.some(r=>r.type==="non_fast_forward")||!rules.some(r=>r.type==="deletion"))issues.push("MAIN_REF_PROTECTION_MISSING");
  if(rules.some(r=>r.type==="required_deployments"&&(r.parameters?.required_deployment_environments?.length||0)>0))issues.push("PREMERGE_DEPLOYMENT_REQUIREMENTS_REVIEW");
  return {contract:"fcr/jussco-current-ruleset-preflight@v2",repository:"jussray/jussray",candidate:{prNumber:pull.number,mainSha,prBaseSha:pull.base.sha,prHeadSha:pull.head.sha,approval,founderSignalAt:latest?.created_at??null},activeRulesets:active.map(r=>({id:r.id,name:r.name})),issues:[...new Set(issues)],authority:{observationOnly:true,providerMutationAuthority:false,mergeAuthority:false,deployAuthority:false},mutation:null,disposition:"OBSERVATION_ONLY"};
}
export async function collectCurrentJussco({token,prNumber,request=fetch}){
  if(typeof token!=="string"||!token.trim())throw Error("trusted GitHub read credential unavailable");
  if(!Number.isSafeInteger(prNumber)||prNumber<1)throw Error("Specify current PR number");
  const root="https://api.github.com/repos/jussray/jussray";
  async function get(path){const r=await request(root+path,{method:"GET",headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"}});if(!r.ok)throw Error("GitHub read HTTP "+r.status);return r.json();}
  async function list(path){const all=[];for(let p=1;p<=10;p++){const batch=await get(path+(path.includes("?")?"&":"?")+"per_page=100&page="+p);if(!Array.isArray(batch))throw Error("Invalid provider list");all.push(...batch);if(batch.length<100)return all;}throw Error("Provider pagination incomplete");}
  const [main,pull,summaries,timeline]=await Promise.all([get("/branches/main"),get("/pulls/"+prNumber),list("/rulesets?includes_parents=true"),list("/issues/"+prNumber+"/timeline")]);
  if(pull.number!==prNumber||!/^[a-f0-9]{40}$/i.test(pull.head?.sha)||summaries.some(r=>!Number.isSafeInteger(r.id)||r.id<1))throw Error("Invalid provider identity");
  const [commit,rulesets]=await Promise.all([get("/commits/"+pull.head.sha),Promise.all(summaries.map(r=>get("/rulesets/"+r.id)))]);
  if(rulesets.some((r,i)=>r.id!==summaries[i].id))throw Error("Ruleset identity changed");
  const [latestMain,latestPull]=await Promise.all([get("/branches/main"),get("/pulls/"+prNumber)]);
  if(latestMain.commit?.sha!==main.commit?.sha||latestPull.head?.sha!==pull.head.sha||latestPull.base?.sha!==pull.base.sha||latestPull.state!==pull.state||latestPull.draft!==pull.draft||latestPull.auto_merge?.enabled_by?.login!==pull.auto_merge?.enabled_by?.login)throw Error("Candidate moved during audit");
  return assessCurrentJussco({mainSha:main.commit?.sha,pull,commit,timeline,rulesets});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);
    if(args.length!==3||args[0]!=='--read-only'||args[1]!=='--pr'||!/^\d+$/.test(args[2]))fail('use --read-only --pr NUMBER; writes unsupported');
    const report=await collectCurrentJussco({token:process.env.GITHUB_TOKEN,prNumber:Number(args[2])});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.issues.length)process.exitCode=2;
  }catch(error){process.stderr.write((error instanceof Error?error.message:'GitHub preflight failed')+'\n');process.exitCode=2;}
}
