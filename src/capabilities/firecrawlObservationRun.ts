import { observeFirecrawlPublicSource, type FirecrawlDependencies } from '../lib/firecrawlPublicSource.js';
const targets = ['fcr','studio','truthweaverShop'] as const;
export type FirecrawlTarget = typeof targets[number];
export type FirecrawlEnv = { FCR_FIRECRAWL_ENABLED?: string; FCR_FIRECRAWL_MONITOR_ENABLED?: string; FCR_FIRECRAWL_API_KEY?: string };
type Receipt = Extract<Awaited<ReturnType<typeof observeFirecrawlPublicSource>>, {status:'OBSERVED_PUBLIC_PAGE'}>['receipt'];
type Stored = { target:FirecrawlTarget; day:string; status:'observed'|'held'; receipt?:Receipt; change?:'initial'|'unchanged'|'changed'; reason?:string };
export interface FirecrawlObservationStore {
  claim(id:string, target:FirecrawlTarget, day:string):Promise<boolean>;
  previous(target:FirecrawlTarget):Promise<string|null>;
  persist(id:string, record:Stored):Promise<boolean>;
}
type Dependencies = Pick<FirecrawlDependencies,'fetchFn'|'now'> & {env:FirecrawlEnv;store:FirecrawlObservationStore};
const hold=(reason:string)=>({status:'held' as const, reason});
async function stableId(value:string) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
export async function runFirecrawlObservation(target:unknown,deps:Dependencies) {
  if(deps.env.FCR_FIRECRAWL_ENABLED!=='true') return hold('DISABLED');
  if(!deps.env.FCR_FIRECRAWL_API_KEY?.trim()) return hold('MISSING_SERVER_CREDENTIAL');
  if(typeof target!=='string'||!targets.includes(target as FirecrawlTarget)) return hold('UNKNOWN_PUBLIC_TARGET');
  const idTarget=target as FirecrawlTarget;
  const day=(deps.now??(()=>new Date()))().toISOString().slice(0,10);
  const claimId=await stableId('fcr-firecrawl-claim:'+target+':'+day);
  const receiptId=await stableId('fcr-firecrawl-receipt:'+target+':'+day);
  try {
    if(!await deps.store.claim(claimId,idTarget,day)) return hold('DAILY_ATTEMPT_ALREADY_CLAIMED');
    const previous=await deps.store.previous(idTarget);
    if(previous!==null&&!/^[a-f0-9]{64}$/.test(previous)) return hold('INVALID_PRIOR_EVIDENCE');
    const observation=await observeFirecrawlPublicSource(target,{apiKey:deps.env.FCR_FIRECRAWL_API_KEY,fetchFn:deps.fetchFn,now:deps.now});
    if(observation.status!=='OBSERVED_PUBLIC_PAGE') {
      if(!await deps.store.persist(receiptId,{target:idTarget,day,status:'held',reason:observation.reason})) return hold('RECEIPT_WRITE_UNVERIFIED');
      return hold(observation.reason);
    }
    const change=previous===null?'initial':previous===observation.receipt.sha256?'unchanged':'changed';
    if(!await deps.store.persist(receiptId,{target:idTarget,day,status:'observed',receipt:observation.receipt,change})) return hold('RECEIPT_WRITE_UNVERIFIED');
    return {status:'observed' as const,receiptId,change,previousFingerprint:previous,receipt:observation.receipt,markdown:observation.markdown};
  } catch {return hold('OBSERVATION_OR_LEDGER_UNVERIFIED');}
}
export async function runFirecrawlMonitorCycle(deps:Dependencies) {
  const now=(deps.now??(()=>new Date()))();
  if(deps.env.FCR_FIRECRAWL_MONITOR_ENABLED!=='true'||deps.env.FCR_FIRECRAWL_ENABLED!=='true'||now.getUTCHours()!==12||now.getUTCMinutes()!==0) return {status:'skipped' as const};
  const outcomes=[];
  for(const target of targets){
    const result=await runFirecrawlObservation(target,{...deps,now:()=>now});
    outcomes.push({target,status:result.status,...(result.status==='held'?{reason:result.reason}:{receiptId:result.receiptId,change:result.change})});
  }
  return {status:'attempted' as const,outcomes};
}
