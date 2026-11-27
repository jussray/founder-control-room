import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const SHA256=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const PRODUCTS=['jbh','truthweaver','chief','sol','promptos','fcr','thinktank'] as const;
const EVENTS=['payment_recorded','refund_hold','dispute_hold','confirmation_accepted','fulfillment_dispatched'] as const;
export type JussPayReceipt={
 schema:'jusspay/commerce-receipt@v1';receiptId:string;orderRefHash:string;
 product:typeof PRODUCTS[number];mode:'live';event:typeof EVENTS[number];
 grossMinor:number|null;currency:'usd';occurredAt:string;releaseSha:string;
};
export type JussPayReceiptStore=(receipt:JussPayReceipt)=>Promise<'stored'|'duplicate'|'conflict'>;

export function parseJussPayReceipt(body:unknown):JussPayReceipt|null{
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const r=body as Record<string,unknown>;
 const keys=['schema','receiptId','orderRefHash','product','mode','event','grossMinor','currency','occurredAt','releaseSha'];
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))return null;
 if(r.schema!=='jusspay/commerce-receipt@v1'||r.mode!=='live'||r.currency!=='usd'||
 typeof r.receiptId!=='string'||!SHA256.test(r.receiptId)||typeof r.orderRefHash!=='string'||!SHA256.test(r.orderRefHash)||
 typeof r.releaseSha!=='string'||!SHA.test(r.releaseSha)||
 !PRODUCTS.includes(r.product as JussPayReceipt['product'])||!EVENTS.includes(r.event as JussPayReceipt['event'])||
 typeof r.occurredAt!=='string'||r.occurredAt.length!==24||!Number.isFinite(Date.parse(r.occurredAt))||new Date(r.occurredAt).toISOString()!==r.occurredAt)return null;
 if(r.event==='payment_recorded'){
  if(typeof r.grossMinor!=='number'||!Number.isSafeInteger(r.grossMinor)||r.grossMinor<1||r.grossMinor>100000000)return null;
 }else if(r.grossMinor!==null)return null;
 return {schema:r.schema,receiptId:r.receiptId,orderRefHash:r.orderRefHash,product:r.product as JussPayReceipt['product'],mode:r.mode,event:r.event as JussPayReceipt['event'],grossMinor:r.grossMinor as number|null,currency:r.currency,occurredAt:r.occurredAt,releaseSha:r.releaseSha};
}

// Use the existing service-role-only durable ledger. This is an observation,
// not a controller request, entitlement, dispatch instruction or settlement proof.
export const persistJussPayReceipt:JussPayReceiptStore=async receipt=>{
 const {supabase}=await import('../../lib/supabaseClient.js');
 const {data:project,error:projectError}=await supabase.from('projects').select('id').eq('slug','jusspay').eq('status','active').maybeSingle();
 if(projectError||typeof project?.id!=='string')throw Error('jusspay_project_unavailable');
 const id='jusspay:'+receipt.receiptId;
 const row={provider:'system',project_id:project.id,provider_event_id:id,event_type:'jusspay_commerce_receipt',resource_type:'commerce-order',resource_id:receipt.orderRefHash,payload:receipt,processing_status:'processed',processed_at:new Date().toISOString()};
 const {error}=await supabase.from('provider_events').insert(row);
 if(!error)return 'stored';
 if(error.code!=='23505')throw Error('receipt_store_unavailable');
 const {data:existing,error:readError}=await supabase.from('provider_events').select('project_id,event_type,resource_type,resource_id,payload').eq('provider','system').eq('provider_event_id',id).maybeSingle();
 if(readError||!existing)throw Error('receipt_lookup_unavailable');
 const prior=parseJussPayReceipt(existing.payload);
 return existing.project_id===project.id&&existing.event_type===row.event_type&&existing.resource_type===row.resource_type&&existing.resource_id===row.resource_id&&prior&&JSON.stringify(prior)===JSON.stringify(receipt)?'duplicate':'conflict';
};

export function createJussPayReceiptHandler(store:JussPayReceiptStore=persistJussPayReceipt, secret:()=>string|undefined=()=>process.env.JUSSPAY_RECEIPT_INGEST_KEY):RequestHandler{
 return async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  const key=secret();
  if(!key||key.length<32||key.length>512){res.status(503).json({accepted:false,error:'receipt_ingest_unconfigured'});return;}
  const supplied=req.get('x-jusspay-receipt-key')||'';
  const a=Buffer.from(supplied),b=Buffer.from(key);
  if(a.length!==b.length||!timingSafeEqual(a,b)){res.status(401).json({accepted:false,error:'unauthorized'});return;}
  const receipt=parseJussPayReceipt(req.body);
  if(!receipt){res.status(400).json({accepted:false,error:'invalid_receipt'});return;}
  try{
   const state=await store(receipt);
   if(state==='conflict'){res.status(409).json({accepted:false,error:'receipt_conflict'});return;}
   res.status(state==='stored'?201:200).json({accepted:true,receiptId:receipt.receiptId,duplicate:state==='duplicate'});
  }catch{res.status(503).json({accepted:false,error:'receipt_store_unavailable'});}
 };
}
export const handleJussPayReceiptIngest=createJussPayReceiptHandler();
