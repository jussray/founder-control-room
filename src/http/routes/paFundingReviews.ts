import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

// Private preparation records only. Never grants eligibility, funds, or application authority.
export const paFundingReviewsRouter = Router();
// Rate-limit private review access independently of the upstream general limiter.
paFundingReviewsRouter.use(rateLimit({windowMs:60_000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}),requireFounder);
const PROGRAM_IDS = new Set(['cea-growth','cea-impact','kiz','contracts','apex','alphalab','bftp','ssbci','creative-loan']);
const VALID_STAGES = new Set(['REVIEW','VERIFY','PREPARE']);

type Stage = 'REVIEW' | 'VERIFY' | 'PREPARE';
interface Review { stage: Stage; checks: Record<string, boolean>; evidenceNote: string }
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parsePaFundingReview(value: unknown): Review | null {
  if (!isRecord(value) || Object.keys(value).some(key => !['stage','checks','evidenceNote'].includes(key))) return null;
  if (!VALID_STAGES.has(String(value.stage)) || !isRecord(value.checks)) return null;
  const checks: Record<string, boolean> = {};
  const entries = Object.entries(value.checks);
  if (entries.length > 25 || entries.some(([k,v]) => !/^(?:[0-9]|1[0-9]|2[0-4])$/.test(k) || typeof v !== 'boolean')) return null;
  for (const [key,value] of entries) checks[key] = value as boolean;
  if (typeof value.evidenceNote !== 'string' || value.evidenceNote.length > 1500) return null;
  return { stage: value.stage as Stage, checks, evidenceNote: value.evidenceNote.trim() };
}
function publicRecord(row: Record<string, unknown>) {
  const p=parsePaFundingReview({stage:row.stage,checks:row.checks,evidenceNote:row.evidence_note});
  return p && PROGRAM_IDS.has(String(row.opportunity_id))
    ? {id:row.opportunity_id,...p,updatedAt:row.updated_at}
    : null;
}
paFundingReviewsRouter.get('/reviews', async (req: FounderRequest,res) => {
  res.setHeader('Cache-Control','private, no-store');
  if (!req.founder?.userId) return res.status(401).json({error:'Founder identity required'});
  const {data,error}=await supabase.from('founder_pa_funding_reviews')
    .select('opportunity_id,stage,checks,evidence_note,updated_at')
    .eq('founder_user_id',req.founder.userId);
  if (error) return res.status(503).json({error:'Private funding storage unavailable'});
  return res.json({records:(data??[]).map(row=>publicRecord(row as Record<string,unknown>)).filter(Boolean),applicationAuthorized:false});
});
paFundingReviewsRouter.put('/reviews/:opportunityId', async (req: FounderRequest,res) => {
  res.setHeader('Cache-Control','private, no-store');
  if (!req.founder?.userId) return res.status(401).json({error:'Founder identity required'});
  const opportunityId=String(req.params.opportunityId??'');
  if (!PROGRAM_IDS.has(opportunityId)) return res.status(404).json({error:'Unknown funding opportunity'});
  const review=parsePaFundingReview(req.body as unknown);
  if (!review) return res.status(400).json({error:'Invalid review; APPLY and eligibility declarations are forbidden'});
  const {data,error}=await supabase.from('founder_pa_funding_reviews').upsert({
    founder_user_id:req.founder.userId,opportunity_id:opportunityId,
    stage:review.stage,checks:review.checks,evidence_note:review.evidenceNote,
    updated_at:new Date().toISOString()
  },{onConflict:'founder_user_id,opportunity_id'})
    .select('opportunity_id,stage,checks,evidence_note,updated_at').single();
  if (error || !data) return res.status(503).json({error:'Private review not persisted'});
  return res.json({record:publicRecord(data as Record<string,unknown>),applicationAuthorized:false});
});
