/**
 * Cryptographic origin ACK verifier for the pinned Council Bus verifyAck port.
 * Trusts only registered server-owned public keys for the exact tenant,
 * principal, agent and symbolic route. Never accepts caller-supplied URLs.
 */
import { canonicalizeRelayJsonV3 } from '../founder-os-lab/federatedRelayV3.js';

export const COUNCIL_BUS_SIGNED_ACK = 'juss/council-bus-signed-ack@v1';
type Principal = { authenticated:boolean;subject:string;tenant:string };
type Origin = {agent:string;route:string;threadId:string;correlationId:string};
export interface CouncilBusAckKey {
  keyId:string;
  publicKeyJwk:JsonWebKey;
  state:'active'|'revoked';
  subject:string;tenant:string;agent:string;route:string;
  validFrom:string;validUntil?:string|null;
}
export type ResolveCouncilBusAckKey = (input:{
  keyId:string;principal:Principal;origin:Origin;
})=>Promise<CouncilBusAckKey|null>;
export interface SignedCouncilBusAck {
  contract:typeof COUNCIL_BUS_SIGNED_ACK;
  status:'ACK';idempotencyKey:string;correlationId:string;
  receiptId:string;agent:string;route:string;threadId:string;
  keyId:string;issuedAt:string;expiresAt:string;signature:string;
}
const SHA=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-z][a-z0-9-]{0,79}$/;
const KEY=/^[a-zA-Z0-9:._-]{3,128}$/;
const RECEIPT=/^[A-Za-z0-9_-]{1,128}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{64,172}$/;

/** Encode an authenticated UUID founder ID as an opaque, stable Bus principal.
 * Council v1 principal IDs require a leading letter; never expose the raw ID
 * or use a claimed display name as a substitute for authenticated identity.
 */
export async function canonicalBusPrincipalSubject(founderUserId:string):Promise<string>{
  if(typeof founderUserId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(founderUserId))
    throw new Error('Invalid authenticated founder UUID');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(founderUserId.toLowerCase()));
  return 'fcr-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,40);
}

const FIELDS=['contract','status','idempotencyKey','correlationId','receiptId',
  'agent','route','threadId','keyId','issuedAt','expiresAt','signature'];
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,fields:string[])=>record(v)&&Object.keys(v).length===fields.length&&
  Object.keys(v).every(k=>fields.includes(k));
const iso=(s:unknown):number=>{
  if(typeof s!=='string'||s.length<20||s.length>40)return NaN;
  const t=Date.parse(s);
  return Number.isFinite(t)&&new Date(t).toISOString()===s?t:NaN;
};
function decodeBase64Url(value:string):Uint8Array{
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
/**
 * Returns false, never a positive ACK on absent signer/readback,
 * timestamp drift, invalid key custody, or cryptographic failure.
 * A key registry is authoritative only when supplied by the owner.
 */
export function createSignedCouncilBusAckVerifier(
  resolveKey:ResolveCouncilBusAckKey,
  now:()=>Date=()=>new Date(),
):({ack:unknown;principal:Principal;origin:Origin;key:string})=>Promise<boolean>{
  return async({ack,principal,origin,key})=>{
    try{
      if(typeof resolveKey!=='function'||!principal||principal.authenticated!==true||
        !TOKEN.test(principal.subject)||!TOKEN.test(principal.tenant)||
        !origin||!exact(ack,FIELDS))return false;
      const a=ack as unknown as SignedCouncilBusAck;
      if(a.contract!==COUNCIL_BUS_SIGNED_ACK||a.status!=='ACK'||!SHA.test(key)||
        a.idempotencyKey!==key||a.correlationId!==origin.correlationId||
        a.agent!==origin.agent||a.route!==origin.route||a.threadId!==origin.threadId||
        !RECEIPT.test(a.receiptId)||!KEY.test(a.keyId)||
        !SIGNATURE.test(a.signature))return false;
      const issued=iso(a.issuedAt),expires=iso(a.expiresAt),time=now().getTime();
      if(!Number.isFinite(time)||!Number.isFinite(issued)||!Number.isFinite(expires)||
        expires<=issued||expires-issued>300_000||issued>time+45_000||
        issued<time-300_000||expires<=time)return false;
      const registered=await resolveKey({keyId:a.keyId,principal,origin});
      if(!registered||registered.keyId!==a.keyId||registered.state!=='active'||
        registered.subject!==principal.subject||registered.tenant!==principal.tenant||
        registered.agent!==origin.agent||registered.route!==origin.route||
        !(iso(registered.validFrom)<=time)||
        (registered.validUntil!=null&&!(time<iso(registered.validUntil))))return false;
      const {signature,...unsigned}=a;
      const publicKey=await crypto.subtle.importKey('jwk',registered.publicKeyJwk,
        {name:'Ed25519'},false,['verify']);
      return await crypto.subtle.verify({name:'Ed25519'},publicKey,
        decodeBase64Url(signature),new TextEncoder().encode(canonicalizeRelayJsonV3(unsigned)));
    }catch{return false;}
  };
}
