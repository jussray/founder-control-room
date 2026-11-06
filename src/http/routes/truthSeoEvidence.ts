
/** Founder-only SEO & evidence intelligence; no outward site mutation. */
import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {requireFounder} from '../middleware/requireFounder.js';
import {getGscAccessToken,readGscSnapshot,GscReadError} from '../../lib/searchConsoleRead.js';
import {reviewEvidence,ReviewError} from '../../lib/evidenceGatewayReview.js';
export const intelligenceRouter=Router();
intelligenceRouter.use(requireFounder);
const readLimit=rateLimit({windowMs:60_000,limit:12,standardHeaders:true,
  legacyHeaders:false,message:{error:'monitoring_rate_limited'}});
const aiLimit=rateLimit({windowMs:60_000,limit:5,standardHeaders:true,
  legacyHeaders:false,message:{error:'review_rate_limited'}});
let cached:{expires:number;payload:unknown}|null=null;
intelligenceRouter.get('/seo',readLimit,async (_req,res)=>{
 res.set('Cache-Control','no-store');
 if(!process.env.FCR_GSC_OAUTH_JSON)return res.status(503).json({
   state:'not_configured',error:'search_console_connection_required',
   detail:'Configure server-held Google OAuth refresh credentials with webmasters.readonly and property access.'});
 try{
   if(cached&&cached.expires>Date.now())return res.json(cached.payload);
   const token=await getGscAccessToken(process.env.FCR_GSC_OAUTH_JSON);
   const payload=await readGscSnapshot({token});
   cached={expires:Date.now()+15*60_000,payload};
   return res.json(payload);
 }catch(e){
   const reason=e instanceof GscReadError?e.reason:'provider_unavailable';
   const status=reason==='not_configured'?503:reason==='provider_access_denied'?403:
     reason==='provider_quota_exceeded'?429:502;
   return res.status(status).json({state:'unavailable',error:reason});
 }
});
intelligenceRouter.post('/review',aiLimit,async (req,res)=>{
 res.set('Cache-Control','no-store');
 const options={
   accountId:process.env.CF_ACCOUNT_ID??'',
   gatewayId:process.env.FCR_EVIDENCE_GATEWAY_ID??'',
   providerToken:process.env.OPENAI_API_KEY??'',
   gatewayToken:process.env.FCR_EVIDENCE_GATEWAY_TOKEN,
   model:process.env.FCR_EVIDENCE_MODEL??'gpt-4.1-mini',
 };
 // Gateway call cannot proceed unless FCR's own explicit, non-Truth-Weaver
 // gateway is configured; never fall back to an unrelated brand's gateway.
 if(!options.gatewayId||options.gatewayId==='truth-weaver-evidence'||!options.providerToken||!options.gatewayToken)
   return res.status(503).json({state:'not_configured',error:'fcr_gateway_not_configured'});
 try{
   const result=await reviewEvidence(req.body,options);
   return res.json(result);
 }catch(e){
   const reason=e instanceof ReviewError?e.reason:'gateway_unavailable';
   const status=reason==='invalid_input'?400:reason==='not_configured'?503:
     reason==='gateway_rate_limited'?429:502;
   return res.status(status).json({state:'unavailable',error:reason});
 }
});
