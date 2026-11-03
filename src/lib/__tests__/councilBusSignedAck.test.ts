import {describe,it,expect} from 'vitest';
import {createSignedCouncilBusAckVerifier,canonicalBusPrincipalSubject,canonicalCouncilAckPayload,COUNCIL_BUS_SIGNED_ACK,type CouncilBusAckKey} from '../councilBusSignedAck.js';

async function fixture(){
  const pair=(await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify'])) as CryptoKeyPair;
  const now=new Date('2026-11-02T20:00:00.000Z');
  const key='a'.repeat(64);
  const principal={authenticated:true,subject:'founder',tenant:'juss'};
  const origin={agent:'chatgpt',route:'founder-relay',threadId:'thread-one',correlationId:'case-one'};
  const signed={contract:COUNCIL_BUS_SIGNED_ACK,status:'ACK',
    idempotencyKey:key,correlationId:origin.correlationId,
    receiptId:'receipt-one',agent:origin.agent,route:origin.route,threadId:origin.threadId,
    keyId:'key-origin-one',issuedAt:'2026-11-02T19:59:00.000Z',
    expiresAt:'2026-11-02T20:02:00.000Z'};
  const exportedKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
  if(!('kty' in exportedKey)||exportedKey.kty!=='OKP')throw new Error('Expected Ed25519 JWK');
  const keyEntry:CouncilBusAckKey={
    keyId:signed.keyId,publicKeyJwk:exportedKey as JsonWebKey,
    state:'active',subject:principal.subject,tenant:principal.tenant,
    agent:origin.agent,route:origin.route,validFrom:'2026-11-01T00:00:00.000Z'
  };
  const make=async(payload:Record<string,unknown>)=>{
    const {signature:_previousSignature,...unsigned}=payload;
    const raw=new TextEncoder().encode(canonicalCouncilAckPayload(unsigned));
    const sig=await crypto.subtle.sign('Ed25519',pair.privateKey,raw);
    const signature=Buffer.from(sig).toString('base64url');
    return {...payload,signature};
  };
  const ack=await make(signed);
  const verify=createSignedCouncilBusAckVerifier(async()=>keyEntry,()=>now);
  const input={ack,principal,origin,key};
  return {ack,verify,input,keyEntry,make,now};
}
describe('Council Bus signed origin ACK',()=>{
 it('converts an authenticated founder UUID into a deterministic opaque principal',async()=>{
   const userId='123e4567-e89b-42d3-a456-426614174000';
   const p=await canonicalBusPrincipalSubject(userId);
   expect(p).toMatch(/^fcr-[a-f0-9]{40}$/);
   expect(p).toBe(await canonicalBusPrincipalSubject(userId.toUpperCase()));
   await expect(canonicalBusPrincipalSubject('founder-display-name')).rejects.toThrow(/UUID/);
 });

 it('accepts exact route-bound Ed25519 receipt from registered origin key',async()=>{
   const f=await fixture();expect(await f.verify(f.input)).toBe(true);
 });
 it('rejects self-asserted ACK and modified signed fields',async()=>{
   const f=await fixture();
   for(const patch of [{route:'wrong'},{receiptId:'fake'},{correlationId:'other'},
     {idempotencyKey:'b'.repeat(64)},{agent:'other'},{threadId:'other'}]){
     expect(await f.verify({...f.input,ack:{...f.ack,...patch}})).toBe(false);
   }
   expect(await f.verify({...f.input,ack:{...f.ack,grantsExecutionAuthority:true}})).toBe(false);
 });
 it('denies revoked, foreign tenant or unbound recipient keys',async()=>{
   const f=await fixture();
   for(const patch of [{state:'revoked' as const},{tenant:'other'},{subject:'other'},
      {route:'wrong'},{agent:'other'},{validUntil:'2026-11-02T19:00:00.000Z'}]){
     const verify=createSignedCouncilBusAckVerifier(async()=>({...f.keyEntry,...patch}),()=>f.now);
     expect(await verify(f.input)).toBe(false);
   }
 });
 it('rejects untrusted identity and missing key registry',async()=>{
   const f=await fixture();
   expect(await f.verify({...f.input,principal:{...f.input.principal,authenticated:false}})).toBe(false);
   const missing=createSignedCouncilBusAckVerifier(async()=>null,()=>f.now);
   expect(await missing(f.input)).toBe(false);
 });
 it('rejects unsigned, stale, future, expired and excessive-life messages',async()=>{
   const f=await fixture();
   expect(await f.verify({...f.input,ack:{...f.ack,signature:'not-a-signature'}})).toBe(false);
   for(const patch of [
     {issuedAt:'2026-11-02T18:00:00.000Z',expiresAt:'2026-11-02T18:03:00.000Z'},
     {issuedAt:'2026-11-02T20:02:00.000Z',expiresAt:'2026-11-02T20:04:00.000Z'},
     {issuedAt:'2026-11-02T19:55:00.000Z',expiresAt:'2026-11-02T20:00:00.000Z'},
     {issuedAt:'2026-11-02T19:59:00.000Z',expiresAt:'2026-11-02T20:10:00.000Z'}
   ]){
      const ack=await f.make({...f.ack,...patch} as Record<string,unknown>);
      expect(await f.verify({...f.input,ack})).toBe(false);
   }
 });
 it('fails closed on key-provider errors',async()=>{
   const f=await fixture();
   const verify=createSignedCouncilBusAckVerifier(async()=>{throw Error('provider down');},()=>f.now);
   expect(await verify(f.input)).toBe(false);
 });
});
