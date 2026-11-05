import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import { providerForProject, providerConfigurationError } from '../../providers/providerFactory.js';
import type { VerificationSignal, ReviewSignal, Diff } from '../../providers/RepositoryProvider.js';

// Read-only, same-origin companion. FCR owns authentication, GitHub credentials,
// review, merge, deployment and persistence. No new credential or authority class.
export const exactHeadCockpitRouter = Router();
const SHA = /^[0-9a-f]{40}$/i;
const PROJECTS = [
  { id:'fcr', name:'Founder Control Room', repo:'jussray/founder-control-room' },
  { id:'bip', name:'Se’kret Bip', repo:'jussray/Sekret-Bip' },
  { id:'chief', name:'Chief AI Machine', repo:'jussray/chief-ai-machine' },
  { id:'story', name:'StoryEngine / L99', repo:'jussray/StoryEngine' },
  { id:'sol', name:'SolContinuity', repo:'jussray/solcontinuity' },
  { id:'promptos', name:'PromptOS', repo:'jussray/promptos' },
  { id:'games', name:'Games Hub', repo:null },
  { id:'video', name:'MakeVideo', repo:'jussray/make-video-' },
  { id:'image', name:'MakeImage', repo:'jussray/make-image' },
] as const;

exactHeadCockpitRouter.use(requireFounder, (_req,res,next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy','no-referrer');
  next();
});
exactHeadCockpitRouter.get('/projects', (_req,res) => res.json({
  contract:'fcr/exact-head-cockpit@v1',
  observedAt:new Date().toISOString(),
  projects:PROJECTS.map(p=>({
    id:p.id,name:p.name,repository:p.repo,
    evidenceStatus:p.repo?'catalog_only':'unresolved',
  })),
  actionAuthority:{merge:false,deploy:false}, source:'fcr-allowlisted-catalog',
}));

exactHeadCockpitRouter.get('/inspect/:id/:number', async(req,res)=>{
  const project=PROJECTS.find(p=>p.id===req.params.id);
  const number=Number(req.params.number);
  if(!project||!project.repo) return res.status(404).json({code:'REPOSITORY_UNRESOLVED'});
  if(!Number.isSafeInteger(number)||number<=0||number>10000000)
    return res.status(400).json({code:'INVALID_PULL_REQUEST'});
  const config={slug:project.id,repo_provider:'github',repo_identifier:project.repo};
  if(providerConfigurationError(config))
    return res.status(503).json({code:'GITHUB_PROVIDER_NOT_CONFIGURED',evidenceStatus:'unknown'});
  try {
    const provider=providerForProject(config);
    if(!provider.observePullRequest||!provider.listReviewSignals)
      return res.status(503).json({code:'PROVIDER_READ_NOT_SUPPORTED'});
    // The separate read-only observation includes drafts and closed PRs.
    // It does not populate FCR's strict independent-review / merge context.
    let ctx;
    try { ctx=await provider.observePullRequest(project.id,number); }
    catch { return res.status(503).json({code:'PR_OBSERVATION_UNAVAILABLE',detail:'PR identity cannot be independently verified.'}); }
    if(!SHA.test(ctx.baseSha)||!SHA.test(ctx.headSha)||ctx.repository.toLowerCase()!==project.repo.toLowerCase())
      return res.status(503).json({code:'PR_IDENTITY_MISMATCH'});
    const responses=await Promise.allSettled([
      provider.resolveRef(project.id,ctx.baseRef),
      provider.observePullRequest(project.id,number),
      provider.listVerificationSignals(project.id,ctx.headSha),
      provider.listReviewSignals(project.id,number),
      provider.compare(project.id,ctx.baseRef,ctx.headSha),
    ] as const);
    const read=<T>(r:PromiseSettledResult<T>):T|null=>r.status==='fulfilled'?r.value:null;
    const currentBase=read(responses[0]);
    const currentObservation=read(responses[1]);
    const currentHead=currentObservation?.headSha??null;
    const verifiedSignals=read(responses[2]);
    const reviewSignals=read(responses[3]);
    const comparison=read(responses[4]) as Diff|null;
    const baseMatches=currentBase?currentBase.toLowerCase()===ctx.baseSha.toLowerCase():null;
    const headMatches=currentObservation
      ? currentObservation.headSha.toLowerCase()===ctx.headSha.toLowerCase()
        && currentObservation.headRepository.toLowerCase()===ctx.headRepository.toLowerCase()
        && currentObservation.baseRef===ctx.baseRef
      : null;
    const checks=(verifiedSignals||[]).filter((v:VerificationSignal)=>v.commitSha.toLowerCase()===ctx.headSha.toLowerCase());
    const counts={
      failing:checks.filter(v=>v.status==='failed').length,
      queued:checks.filter(v=>v.status==='queued'||v.status==='running').length,
      cancelled:checks.filter(v=>v.status==='cancelled').length,
      unknown:checks.filter(v=>v.status==='unknown').length,
      duplicate:null, // latest-only Check Run evidence cannot establish duplicate count
    };
    const reviews=(reviewSignals||[]).filter((v:ReviewSignal)=>v.state==='approved'&&v.commitSha.toLowerCase()===ctx.headSha.toLowerCase()).length;
    const allPassed=checks.length>0&&checks.every(v=>v.status==='passed');
    const blockers=[
      ctx.state!=='open'?'PR is closed and cannot be reviewed or merged':'',
      ctx.draft?'PR is draft and not review eligible':'',
      headMatches!==true?'Current PR head could not be confirmed':'',
      baseMatches!==true?'PR base differs from live base or is unknown':'',
      !comparison?'Branch relationship unavailable':'',
      !verifiedSignals||!checks.length?'Exact-head checks unavailable':'',
      counts.failing?'Failing checks':'',
      counts.queued?'Queued/running checks':'',
      counts.cancelled?'Cancelled checks':'',
      !reviewSignals?'Review evidence unavailable':'',
      'Required ruleset checks and duplicate jobs not independently verified',
      'FCR founder-final review is not established',
      'Cloudflare and Supabase runtime proof not established',
    ].filter(Boolean);
    const nextReversibleFix=ctx.state!=='open'?'Confirm whether this closed PR is intentionally retained as history.':
      headMatches!==true?'Re-read the live PR head before any changes.':
      baseMatches!==true?'Reconcile this PR with current main, then reverify its exact head.':
      counts.failing?'Inspect the first failing check and patch one evidenced cause.':
      counts.queued?'Finish queued checks; avoid duplicate reruns.':
      counts.cancelled?'Investigate cancelled workflows before rerunning.':
      'Revalidate required rulesets, independent review and FCR authority.';
    return res.json({
      contract:'fcr/exact-head-cockpit-inspection@v1',observedAt:new Date().toISOString(),
      project:{id:project.id,name:project.name,repository:project.repo},
      pullRequest:number,pr:{state:ctx.state,draft:ctx.draft,merged:ctx.merged,headRepository:ctx.headRepository},
      exact:{baseSha:ctx.baseSha,headSha:ctx.headSha,baseRef:ctx.baseRef,headRef:ctx.headRef},
      live:{currentBaseSha:currentBase,currentHeadSha:currentHead,baseMatches,headMatches,
        branchRelationship:comparison?{aheadBy:comparison.aheadBy,behindBy:comparison.behindBy}:null},
      counts, checks:checks.map(v=>({name:v.name,status:v.status,headSha:v.commitSha,
        url:v.detailsUrl??null,observedAt:v.completedAt??v.startedAt??null})),
      reviews:{exactHeadApprovals:reviews,readbackVerified:reviewSignals!==null},
      gate:{observedChecksPassed:allPassed,requiredChecksVerified:false,merge:false,deploy:false,
        cloudflare:'unknown',supabase:'unknown',productionProof:'unknown'},
      evidenceStatus:baseMatches===true&&headMatches===true?'partial_current':'stale_or_unknown',
      blockers,nextReversibleFix,authority:'read_only',
    });
  } catch {
    return res.status(503).json({code:'GITHUB_READ_FAILED',evidenceStatus:'unknown',blocked:true});
  }
});
