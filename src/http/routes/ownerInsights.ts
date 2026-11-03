import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import {
  InsightsError, OWNER_INTELLIGENCE_CONTRACT,
  readSearchConsole, reviewEvidenceWithGateway, validateClaimInput,
} from '../../owner-intelligence/ownerInsights.js';

export const ownerInsightsRouter = Router();
const ownerInsightsRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { contract: OWNER_INTELLIGENCE_CONTRACT, status: 'BLOCKED', code: 'OWNER_INSIGHTS_RATE_LIMITED' },
});
// Restrict both authentication attempts and expensive provider calls.
ownerInsightsRouter.use(ownerInsightsRateLimit, requireFounder);
ownerInsightsRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  next();
});
function fail(res:Response,error:unknown) {
  if(error instanceof InsightsError)return res.status(error.status).json({contract:OWNER_INTELLIGENCE_CONTRACT,status:'BLOCKED',code:error.code});
  // Provider exceptions and stack traces are never disclosed to a client.
  return res.status(502).json({contract:OWNER_INTELLIGENCE_CONTRACT,status:'BLOCKED',code:'OWNER_INSIGHTS_UNAVAILABLE'});
}
// This is a founder-owned project tool, not a public multi-tenant endpoint.
// A generic owner membership model is not yet present in FCR; do not infer
// authority from an untrusted user-supplied projectSlug.
ownerInsightsRouter.get('/search-console',async(_req:FounderRequest,res)=>{
  try {
    const result=await readSearchConsole({
      property:process.env.GSC_SITE_PROPERTY,
      serviceAccountJson:process.env.GSC_SERVICE_ACCOUNT_JSON,
    });
    return res.status(200).json(result);
  } catch(error){return fail(res,error);}
});
ownerInsightsRouter.post('/claims/review',async(req:FounderRequest,res)=>{
  let input;
  try{input=validateClaimInput(req.body);}
  catch(error){return fail(res,error);}
  try{
    const {data:project,error}=await supabase.from('projects').select('id,slug').eq('slug',input.projectSlug).maybeSingle();
    if(error)return res.status(503).json({contract:OWNER_INTELLIGENCE_CONTRACT,status:'BLOCKED',code:'PROJECT_REGISTRY_UNAVAILABLE'});
    if(!project)return res.status(404).json({contract:OWNER_INTELLIGENCE_CONTRACT,status:'BLOCKED',code:'PROJECT_NOT_REGISTERED'});
    const advisory=await reviewEvidenceWithGateway(input,{
      accountId:process.env.FCR_AI_GATEWAY_ACCOUNT_ID,
      token:process.env.FCR_AI_GATEWAY_TOKEN,
      gatewayId:process.env.FCR_AI_GATEWAY_ID,
      model:process.env.FCR_AI_GATEWAY_MODEL,
    });
    return res.status(200).json(advisory);
  } catch(error){return fail(res,error);}
});
ownerInsightsRouter.get('/contract',(_req,res)=>res.status(200).json({
  contract:OWNER_INTELLIGENCE_CONTRACT,
  searchConsole:{site:'https://www.foundercontrolroom.org/',scope:'bounded Search Console sitemaps and five URL inspections',
    needs:['GSC_SITE_PROPERTY','GSC_SERVICE_ACCOUNT_JSON'],access:'founder-only; Google read-only permission'},
  claimReview:{scope:'registered FCR projects, authenticated founder only',provider:'Cloudflare AI Gateway',
    needs:['FCR_AI_GATEWAY_ACCOUNT_ID','FCR_AI_GATEWAY_TOKEN'],consentRequired:true,
    maxEvidenceItems:8,authority:'ADVISORY_ONLY',releaseAuthorized:false},
}));
