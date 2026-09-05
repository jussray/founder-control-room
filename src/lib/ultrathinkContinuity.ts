import { createHash } from 'node:crypto';

export const ULTRATHINK_CONTINUITY_CONTRACT = 'fcr/ultrathink-continuity@v1' as const;
export const ULTRATHINK_PROOF_COOKIE_CONTRACT = 'fcr/ultrathink-proof-cookie@v1' as const;
export type ContinuityClassification = 'UNCHANGED'|'ADVANCED'|'DIVERGED'|'STALE'|'CONFLICTING'|'REVOKED'|'BLOCKED';
export type HistoricalReceiptStatus = 'verified'|'inferred'|'unknown'|'contradicted';
export type TruthPlane = 'source'|'execution'|'runtime'|'outcome';
export type AuthorityRelation = 'same'|'advanced'|'diverged'|'unknown';

export interface AuthorityIdentity { repo:string; branch:string; sha:string|null; runtime:string|null; externalRef:string|null }
export interface EvidenceRef { kind:string; ref:string; checksum:string }
export interface CrossSystemLink { targetNamespace:string; relationship:string; authorityScope:'none'|'read'|'evidence'; continuationAllowed:false }
export interface Revocation { revokedAt:string; revokedBy:string; reason:string }
export interface ProofCookie {
  contract:typeof ULTRATHINK_PROOF_COOKIE_CONTRACT; truthPlane:TruthPlane; historicalReceiptStatus:HistoricalReceiptStatus;
  observedAt:string; evidenceRefs:EvidenceRef[]; cookieHash:string; browserCookie:false; actionAuthority:false;
}
export interface ContinuityRecord {
  contract:typeof ULTRATHINK_CONTINUITY_CONTRACT; schemaVersion:1; namespace:string; missionId:string; continuationId:string;
  parentContinuationId:string|null; parentStateHash:string|null; stateHash:string; createdAt:string; createdBy:string;
  freshnessPolicyMs:number; observedAt:string; authorityIdentity:AuthorityIdentity; evidenceRefs:EvidenceRef[];
  crossSystemLinks:CrossSystemLink[]; continuationStatus:'active'|'stale'|'superseded'|'conflicted';
  historicalReceiptStatus:HistoricalReceiptStatus; proofCookie:ProofCookie; executionAuthority:false;
}
export interface CreateContinuityInput extends Omit<ContinuityRecord,'contract'|'schemaVersion'|'parentContinuationId'|'parentStateHash'|'stateHash'|'proofCookie'|'executionAuthority'|'evidenceRefs'|'crossSystemLinks'|'continuationStatus'> {
  continuationStatus?:ContinuityRecord['continuationStatus']; parent:Pick<ContinuityRecord,'continuationId'|'stateHash'>|null; evidenceRefs:readonly EvidenceRef[];
  crossSystemLinks?:readonly CrossSystemLink[]; truthPlane:TruthPlane;
}
export interface CurrentAuthorityObservation { authorityIdentity:AuthorityIdentity; observedAt:string; relation:AuthorityRelation }
export interface ContinuityReader {
  get(id:string):Promise<ContinuityRecord|null>; children(parentId:string):Promise<ContinuityRecord[]>; getRevocation(id:string):Promise<Revocation|null>;
}
export interface EvidenceResolver { checksum(ref:EvidenceRef):Promise<string|null> }
export interface ContinuityInspection {
  classification:ContinuityClassification; reasons:string[]; record:ContinuityRecord|null; chain:ContinuityRecord[];
  revokedContinuationId:string|null; forkedParentIds:string[]; continuityMayAuthorizeAction:false;
  historicalReceiptStatus:HistoricalReceiptStatus|null;
}

const ID=/^[A-Za-z0-9._:/-]{1,160}$/; const REF=/^[A-Za-z0-9._:/#@?=&-]{1,300}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/; const SHA=/^[0-9a-f]{40}$/i; const H=/^sha256:[0-9a-f]{64}$/i;
const SECRET=[/-----BEGIN [A-Z ]*PRIVATE KEY-----/i,/\bgh[pousr]_[A-Za-z0-9]{20,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/,/\bAKIA[0-9A-Z]{16}\b/,/\b(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|password)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{12,}/i];
const MAX_FRESH=30*24*60*60*1000; const MAX_DEPTH=100;
const iso=(v:string)=>{const n=Date.parse(v); if(!Number.isFinite(n)) throw new Error('ULTRATHINK_CONTINUITY_TIMESTAMP_INVALID'); return new Date(n).toISOString()};
const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
export const continuityHash=(v:unknown)=>`sha256:${createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
export const containsSecret=(v:unknown)=>SECRET.some((p)=>p.test(JSON.stringify(v)));
const evidence=(xs:readonly EvidenceRef[])=>xs.map(x=>({kind:x.kind.trim(),ref:x.ref.trim(),checksum:x.checksum.trim().toLowerCase()})).sort((a,b)=>`${a.kind}:${a.ref}:${a.checksum}`.localeCompare(`${b.kind}:${b.ref}:${b.checksum}`));
const links=(xs:readonly CrossSystemLink[])=>xs.map(x=>({targetNamespace:x.targetNamespace.trim(),relationship:x.relationship.trim(),authorityScope:x.authorityScope,continuationAllowed:false as const})).sort((a,b)=>`${a.targetNamespace}:${a.relationship}:${a.authorityScope}`.localeCompare(`${b.targetNamespace}:${b.relationship}:${b.authorityScope}`));
const authority=(x:AuthorityIdentity):AuthorityIdentity=>({repo:x.repo.trim().toLowerCase(),branch:x.branch.trim(),sha:x.sha?.trim().toLowerCase()??null,runtime:x.runtime?.trim()??null,externalRef:x.externalRef?.trim()??null});

function cookie(input:{truthPlane:TruthPlane; historicalReceiptStatus:HistoricalReceiptStatus; observedAt:string; evidenceRefs:readonly EvidenceRef[]}):ProofCookie{
  const body={contract:ULTRATHINK_PROOF_COOKIE_CONTRACT,truthPlane:input.truthPlane,historicalReceiptStatus:input.historicalReceiptStatus,observedAt:iso(input.observedAt),evidenceRefs:evidence(input.evidenceRefs),browserCookie:false as const,actionAuthority:false as const};
  const out={...body,cookieHash:continuityHash(body)}; if(containsSecret(out)) throw new Error('ULTRATHINK_CONTINUITY_SECRET_REJECTED'); return out;
}
function body(input:CreateContinuityInput,proofCookie:ProofCookie){return {contract:ULTRATHINK_CONTINUITY_CONTRACT,schemaVersion:1 as const,namespace:input.namespace.trim(),missionId:input.missionId.trim(),continuationId:input.continuationId.trim(),parentContinuationId:input.parent?.continuationId??null,parentStateHash:input.parent?.stateHash??null,createdAt:iso(input.createdAt),createdBy:input.createdBy.trim(),freshnessPolicyMs:input.freshnessPolicyMs,observedAt:iso(input.observedAt),authorityIdentity:authority(input.authorityIdentity),evidenceRefs:evidence(input.evidenceRefs),crossSystemLinks:links(input.crossSystemLinks??[]),continuationStatus:input.continuationStatus??'active',historicalReceiptStatus:input.historicalReceiptStatus,proofCookie,executionAuthority:false as const}}
export function createContinuityRecord(input:CreateContinuityInput):ContinuityRecord{
  const proofCookie=cookie({truthPlane:input.truthPlane,historicalReceiptStatus:input.historicalReceiptStatus,observedAt:input.observedAt,evidenceRefs:input.evidenceRefs}); const b=body(input,proofCookie); const out={...b,stateHash:continuityHash(b)};
  const errors=validateContinuityRecord(out,input.parent??undefined); if(errors.length) throw new Error(errors.join('; ')); return Object.freeze(out);
}

export function validateContinuityRecord(record:ContinuityRecord,parent?:Pick<ContinuityRecord,'continuationId'|'stateHash'>,expected?:{namespace?:string;missionId?:string}):string[]{
  const e:string[]=[]; const add=(x:string)=>{if(!e.includes(x))e.push(x)};
  if(record.contract!==ULTRATHINK_CONTINUITY_CONTRACT||record.schemaVersion!==1)add('continuity contract/schema unsupported');
  for(const [k,v] of [['namespace',record.namespace],['missionId',record.missionId],['continuationId',record.continuationId],['createdBy',record.createdBy]] as const)if(!ID.test(v))add(`${k} invalid`);
  if(expected?.namespace&&record.namespace!==expected.namespace)add('continuity namespace mismatch'); if(expected?.missionId&&record.missionId!==expected.missionId)add('continuity mission mismatch');
  if((record.parentContinuationId===null)!==(record.parentStateHash===null))add('parent identity/hash must coexist'); if(record.parentStateHash&&!H.test(record.parentStateHash))add('parent state hash invalid');
  if(parent&&(record.parentContinuationId!==parent.continuationId||record.parentStateHash!==parent.stateHash))add('parent hash chain mismatch');
  if(!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.observedAt)))add('continuity timestamp invalid');
  if(!Number.isSafeInteger(record.freshnessPolicyMs)||record.freshnessPolicyMs<=0||record.freshnessPolicyMs>MAX_FRESH)add('freshness policy invalid');
  const a=record.authorityIdentity; if(!REPO.test(a.repo)||!ID.test(a.branch)||a.sha!==null&&!SHA.test(a.sha)||a.runtime!==null&&!REF.test(a.runtime)||a.externalRef!==null&&!REF.test(a.externalRef))add('authority identity invalid');
  if(record.evidenceRefs.length<1||record.evidenceRefs.length>40)add('evidenceRefs count invalid'); const keys=new Set<string>(); for(const x of record.evidenceRefs){if(!ID.test(x.kind)||!REF.test(x.ref)||!H.test(x.checksum))add('evidence ref invalid'); const k=`${x.kind}:${x.ref}`; if(keys.has(k))add('duplicate evidence identity'); keys.add(k)}
  if(record.crossSystemLinks.length>20)add('cross-system link count invalid'); for(const x of record.crossSystemLinks)if(!ID.test(x.targetNamespace)||!ID.test(x.relationship)||!['none','read','evidence'].includes(x.authorityScope)||x.continuationAllowed!==false)add('cross-system link cannot transfer authority');
  if(record.executionAuthority!==false)add('continuity cannot carry execution authority'); if(record.proofCookie.browserCookie!==false||record.proofCookie.actionAuthority!==false)add('proof cookie cannot carry browser/action authority');
  const cb={contract:record.proofCookie.contract,truthPlane:record.proofCookie.truthPlane,historicalReceiptStatus:record.proofCookie.historicalReceiptStatus,observedAt:record.proofCookie.observedAt,evidenceRefs:evidence(record.proofCookie.evidenceRefs),browserCookie:false,actionAuthority:false}; if(record.proofCookie.contract!==ULTRATHINK_PROOF_COOKIE_CONTRACT||record.proofCookie.cookieHash!==continuityHash(cb))add('proof cookie invalid');
  if(record.proofCookie.historicalReceiptStatus!==record.historicalReceiptStatus||record.proofCookie.observedAt!==record.observedAt||JSON.stringify(evidence(record.proofCookie.evidenceRefs))!==JSON.stringify(evidence(record.evidenceRefs)))add('proof cookie binding mismatch');
  const b={contract:record.contract,schemaVersion:record.schemaVersion,namespace:record.namespace,missionId:record.missionId,continuationId:record.continuationId,parentContinuationId:record.parentContinuationId,parentStateHash:record.parentStateHash,createdAt:record.createdAt,createdBy:record.createdBy,freshnessPolicyMs:record.freshnessPolicyMs,observedAt:record.observedAt,authorityIdentity:authority(record.authorityIdentity),evidenceRefs:evidence(record.evidenceRefs),crossSystemLinks:links(record.crossSystemLinks),continuationStatus:record.continuationStatus,historicalReceiptStatus:record.historicalReceiptStatus,proofCookie:record.proofCookie,executionAuthority:false}; if(!H.test(record.stateHash)||record.stateHash!==continuityHash(b))add('continuity state hash mismatch'); if(containsSecret(record))add('continuity record contains secret-shaped material'); return e;
}

function currentClass(record:ContinuityRecord,current:CurrentAuthorityObservation|null,now:Date):{classification:ContinuityClassification;reasons:string[]}{
  if(record.continuationStatus==='conflicted')return{classification:'CONFLICTING',reasons:['record_conflicted']}; if(record.continuationStatus==='superseded'||record.continuationStatus==='stale')return{classification:'STALE',reasons:[`record_${record.continuationStatus}`]};
  if(!current)return now.getTime()>=Date.parse(record.observedAt)+record.freshnessPolicyMs?{classification:'STALE',reasons:['freshness_lease_expired']}:{classification:'UNCHANGED',reasons:['within_freshness_lease']};
  if(!Number.isFinite(Date.parse(current.observedAt)))return{classification:'BLOCKED',reasons:['current_authority_observation_time_invalid']}; const prior=authority(record.authorityIdentity),next=authority(current.authorityIdentity);
  if(prior.repo!==next.repo||prior.branch!==next.branch)return{classification:'CONFLICTING',reasons:['authority_identity_changed']}; if(current.relation==='diverged')return{classification:'DIVERGED',reasons:['authority_diverged']}; if(current.relation==='advanced')return{classification:'ADVANCED',reasons:['authority_advanced']}; if(current.relation==='unknown')return{classification:'STALE',reasons:['authority_relation_unknown']};
  return JSON.stringify(prior)===JSON.stringify(next)?{classification:'UNCHANGED',reasons:['authority_reobserved_unchanged']}:{classification:'CONFLICTING',reasons:['same_relation_identity_mismatch']};
}
const result=(classification:ContinuityClassification,reasons:string[],record:ContinuityRecord|null,chain:ContinuityRecord[],revokedContinuationId:string|null,forkedParentIds:string[]):ContinuityInspection=>({classification,reasons,record,chain,revokedContinuationId,forkedParentIds,continuityMayAuthorizeAction:false,historicalReceiptStatus:record?.historicalReceiptStatus??null});

export async function inspectContinuity(reader:ContinuityReader,id:string,options:{namespace:string;missionId:string;currentAuthority?:CurrentAuthorityObservation|null;evidenceResolver?:EvidenceResolver;now?:Date}):Promise<ContinuityInspection>{
  const first=await reader.get(id); if(!first)return result('BLOCKED',['continuation_not_found'],null,[],null,[]); const chain:ContinuityRecord[]=[]; const seen=new Set<string>(); const forks:string[]=[]; let revoked:string|null=null; let cursor:ContinuityRecord|null=first; let child:ContinuityRecord|null=null;
  while(cursor){if(chain.length>=MAX_DEPTH)return result('BLOCKED',['continuation_chain_too_deep'],first,chain,revoked,forks); if(seen.has(cursor.continuationId))return result('DIVERGED',['continuation_cycle_detected'],first,chain,revoked,forks); seen.add(cursor.continuationId); const errs=validateContinuityRecord(cursor,undefined,{namespace:options.namespace,missionId:options.missionId}); if(errs.length)return result('BLOCKED',errs,first,chain,revoked,forks); if(child&&(child.parentContinuationId!==cursor.continuationId||child.parentStateHash!==cursor.stateHash))return result('DIVERGED',['parent_hash_chain_mismatch'],first,chain,revoked,forks); chain.push(cursor); if(await reader.getRevocation(cursor.continuationId))revoked??=cursor.continuationId;
    if(cursor.parentContinuationId){const siblings=(await reader.children(cursor.parentContinuationId)).filter(x=>x.namespace===options.namespace&&x.missionId===options.missionId); if(new Set(siblings.map(x=>x.stateHash)).size>1)forks.push(cursor.parentContinuationId); const parent=await reader.get(cursor.parentContinuationId); if(!parent)return result('BLOCKED',['parent_continuation_missing'],first,chain,revoked,[...new Set(forks)]); child=cursor; cursor=parent}else cursor=null;
  }
  const unique=[...new Set(forks)].sort(); if(revoked)return result('REVOKED',[revoked===first.continuationId?'continuation_revoked':'revoked_ancestor'],first,chain,revoked,unique); if(unique.length)return result('DIVERGED',['fork_detected'],first,chain,null,unique);
  if(options.evidenceResolver)for(const item of chain)for(const ref of item.evidenceRefs){const c=await options.evidenceResolver.checksum(ref); if(c===null)return result('BLOCKED',[`evidence_missing:${ref.ref}`],first,chain,null,unique); if(c.toLowerCase()!==ref.checksum.toLowerCase())return result('CONFLICTING',[`evidence_checksum_mismatch:${ref.ref}`],first,chain,null,unique)}
  const x=currentClass(first,options.currentAuthority??null,options.now??new Date()); return result(x.classification,x.reasons,first,chain,null,unique);
}

// Compatibility names keep the existing FCR continuity vocabulary explicit at call sites.
export type ContinuityRevocation = Revocation;
export type UltrathinkContinuityRecord = ContinuityRecord;
export const createUltrathinkContinuityRecord = createContinuityRecord;
export const inspectUltrathinkContinuity = inspectContinuity;
export const ultrathinkContinuityContainsSecret = containsSecret;
export const ultrathinkContinuityHash = continuityHash;
export const validateUltrathinkContinuityRecord = validateContinuityRecord;
