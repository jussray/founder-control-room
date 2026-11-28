import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrowserActionDependencies } from './authorizedBrowserAction.js';

type LedgerPorts = Pick<BrowserActionDependencies,'reserve'|'persist'>;
type Receipt = Parameters<LedgerPorts['persist']>[1];
interface LedgerScope {
  projectId: string;
  missionId: string;
  actor: string;
}
const uuid = (s:string):boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const digest = (s:string):boolean => /^[a-f0-9]{64}$/.test(s);
const actionType = 'browser_action';

/** Server-only adapter for the existing service-role approval_executions table.
 * Scope must originate from the authenticated founder and approved mission.
 * This adapter neither resolves approval nor issues an authority envelope.
 * Instantiate once per execution; uncertain writes require reconciliation. */
export function browserExecutionLedger(
  client: Pick<SupabaseClient,'from'>, scope: LedgerScope,
): LedgerPorts {
  if (!uuid(scope.projectId) || !uuid(scope.missionId) || !scope.actor.trim() || scope.actor.length > 254) {
    throw new Error('INVALID_BROWSER_LEDGER_SCOPE');
  }
  const {projectId,missionId,actor} = scope;
  let attempted = false;
  let claim: {id:string; key:string; envelopeHash:string} | null = null;
  let receiptAttempted = false;
  return {
    async reserve(key,envelopeHash) {
      if (attempted || !/^[a-zA-Z0-9._:-]{1,160}$/.test(key) || !digest(envelopeHash)) return false;
      attempted = true;
      try {
        const {data,error}=await client.from('approval_executions').insert({
          project_id:projectId,mission_id:missionId,executed_by:actor,
          action_type:actionType,idempotency_key:key,status:'pending',
          request:{envelopeHash},
        }).select('id').single();
        if(error || typeof data?.id!=='string' || !uuid(data.id)) return false;
        claim={id:data.id,key,envelopeHash};
        return true;
      } catch { return false; }
    },
    async persist(key,receipt:Receipt) {
      if (!claim || receiptAttempted || key!==claim.key || receipt.envelopeHash!==claim.envelopeHash
          || !digest(receipt.beforeFingerprint)
          || (receipt.outcome!=='verified' && receipt.outcome!=='unverified')
          || (receipt.outcome==='verified' && (typeof receipt.afterFingerprint!=='string'
              || !digest(receipt.afterFingerprint) || receipt.beforeFingerprint===receipt.afterFingerprint))
          || (receipt.outcome==='unverified' && receipt.afterFingerprint!==null)) return false;
      receiptAttempted=true;
      const verified=receipt.outcome==='verified';
      const result:Receipt={
        envelopeHash:receipt.envelopeHash,outcome:receipt.outcome,
        beforeFingerprint:receipt.beforeFingerprint,afterFingerprint:receipt.afterFingerprint,
      };
      try {
        const {data,error}=await client.from('approval_executions').update({
          status:verified?'succeeded':'pending',success:verified?true:null,
          executed_at:verified?new Date().toISOString():null,result,
        }).eq('id',claim.id).eq('project_id',projectId).eq('mission_id',missionId)
          .eq('executed_by',actor).eq('action_type',actionType).eq('idempotency_key',key)
          .eq('status','pending').eq('request->>envelopeHash',claim.envelopeHash)
          .is('result->>outcome',null).select('id').maybeSingle();
        return !error && data?.id===claim.id;
      } catch { return false; }
    },
  };
}
