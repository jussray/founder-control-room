import type { SupabaseClient } from '@supabase/supabase-js';
import type { FirecrawlObservationStore } from './firecrawlObservationRun.js';

const source='firecrawl_public_web';
const claimType='firecrawl_daily_attempt';
const receiptType='firecrawl_observation_receipt';

export function firecrawlEventStore(client:Pick<SupabaseClient,'from'>):FirecrawlObservationStore {
  return {
    async claim(id,target,day) {
      const {data,error}=await client.from('events').upsert({
        id, source, lane_id:'founder-os',event_type:claimType,processed:true,
        payload:{target,day,status:'CLAIMED_NOT_OBSERVED',authorityEffect:'none'},
      },{onConflict:'id',ignoreDuplicates:true}).select('id');
      if(error) throw Error('firecrawl_claim_write_failed');
      return data?.length===1&&data[0]?.id===id;
    },
    async previous(target) {
      const {data,error}=await client.from('events').select('payload')
        .eq('source',source).eq('event_type',receiptType)
        .filter('payload->>target','eq',target).filter('payload->>status','eq','observed')
        .order('observed_at',{ascending:false}).limit(1);
      if(error) throw Error('firecrawl_prior_read_failed');
      if(!data?.length) return null;
      const payload=data[0]?.payload as {receipt?:{sha256?:unknown}}|undefined;
      if(typeof payload?.receipt?.sha256!=='string') throw Error('firecrawl_prior_invalid');
      return payload.receipt.sha256;
    },
    async persist(id,record) {
      const {data,error}=await client.from('events').insert({
        id,source,lane_id:'founder-os',event_type:receiptType,processed:true,payload:record,
      }).select('id').single();
      if(error) throw Error('firecrawl_receipt_write_failed');
      return data?.id===id;
    },
  };
}
