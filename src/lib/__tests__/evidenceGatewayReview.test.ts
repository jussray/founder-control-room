import {describe,it,expect} from 'vitest';
import {validateClaimInput,parseModelReview,reviewEvidence} from '../evidenceGatewayReview.js';
const answer={gaps:[{issue:'No independent corroboration',evidenceIds:['one']}],
  attackQuestions:['Could the source be outdated?'],
  nextGate:{gate:'COLLECT_EVIDENCE',reason:'Needs independent witness',
    requiredEvidence:['Unrelated signed source']}};
const input={claim:'Our site is indexed',evidence:[{id:'one',source:'Google report',text:'My manual observation'}]};
describe('Evidence Gateway bounded analysis',()=>{
 it('rejects unauthorized fields, duplicated evidence IDs, oversized input',()=>{
   expect(()=>validateClaimInput({...input,mode:'publish'})).toThrow(/invalid_input/);
   expect(()=>validateClaimInput({...input,evidence:[input.evidence[0],input.evidence[0]]}))
     .toThrow(/invalid_input/);
   expect(()=>validateClaimInput({claim:'a'.repeat(3100),evidence:[]})).toThrow(/invalid_input/);
 });
 it('will not let model invent evidence IDs or release gates',()=>{
   expect(()=>parseModelReview(JSON.stringify({...answer,
     gaps:[{issue:'gap',evidenceIds:['made-up']}] }),['one'])).toThrow(/invalid_model_response/);
   expect(()=>parseModelReview(JSON.stringify({...answer,
     nextGate:{...answer.nextGate,gate:'DEPLOY'}}),['one'])).toThrow(/invalid_model_response/);
 });
 it('calls FCR gateway, returns advisory only, hashes input and never grants execution authority',async()=>{
   let seenUrl='';let body:Record<string,any>={};
   const fetchFn=(async (url:string,init:RequestInit)=>{
     seenUrl=url;body=JSON.parse(String(init.body));
     return {ok:true,status:200,json:async()=>({
       choices:[{message:{content:JSON.stringify(answer)}}]
     })} as Response;
   }) as typeof fetch;
   const result=await reviewEvidence(input,{accountId:'a'.repeat(32),gatewayId:'fcr-evidence',
     providerToken:'server-test-provider-key',fetchFn,
     now:()=>new Date('2026-11-02T21:00:00.000Z')});
   expect(seenUrl).toContain('/fcr-evidence/openai/chat/completions');
   expect(body.messages[1].content).toContain('Our site is indexed');
   expect(result).toMatchObject({authorityGranted:false,basis:'MODEL_ANALYSIS_NOT_VERIFIED',
     nextGate:{gate:'COLLECT_EVIDENCE'}});
   expect(result.receipt.inputSha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it('fails closed on a refused provider response',async()=>{
   await expect(reviewEvidence(input,{accountId:'a'.repeat(32),gatewayId:'fcr-evidence',
     providerToken:'server-test-key',fetchFn:(async()=>({ok:false,status:403} as Response)) as typeof fetch}))
     .rejects.toMatchObject({reason:'gateway_access_denied'});
 });
});
