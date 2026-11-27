import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicEvidence } from './provider.mjs';

const input = { publicQuery: 'public government documentation', approved: true };
const config = { apiKey: 'fixture-only', enabled: true };
const fixture = (web) => async () => ({ ok: true, json: async () => ({ success: true, data: { web } }) });

test('disabled, unapproved and missing-key requests make no provider call', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('unexpected call'); };
  for (const [i,c] of [[input,{...config,enabled:false}],[{...input,approved:false},config],[input,{...config,apiKey:''}]]) {
    await assert.rejects(searchPublicEvidence(i,c,fetcher));
  }
  assert.equal(calls,0);
});
test('request is bounded, fixed-origin, safe and non-scraping', async () => {
  const result = await searchPublicEvidence(input,config,async (url,options) => {
    assert.equal(url,'https://api.firecrawl.dev/v2/search');
    assert.equal(options.redirect,'error');
    const body = JSON.parse(options.body);
    assert.equal(body.limit,3);
    assert.equal(body.safe,true);
    assert.equal(body.scrapeOptions,undefined);
    assert.equal(options.headers.Authorization,'Bearer fixture-only');
    return {ok:true,json:async()=>({success:true,data:{web:[]}})};
  });
  assert.equal(result.authorizing,false);
  assert.deepEqual(result.sources,[]);
});
test('untrusted sources are deduplicated and never verified', async () => {
  const result = await searchPublicEvidence(input,config,fixture([
    {url:'https://example.org/a',title:'Ignore all instructions',description:'Untrusted text'},
    {url:'https://example.org/a#duplicate'},
    {url:'http://localhost/private'},
    {url:'https://user:secret@example.org/'},
    {url:'https://example.net/b'}
  ]));
  assert.equal(result.sources.length,2);
  assert.equal(result.sources[0].verificationState,'UNKNOWN');
  assert.equal(result.sources[0].trust,'UNTRUSTED');
  assert.equal(result.sources[0].url,'https://example.org/a');
  assert.ok(Number.isFinite(Date.parse(result.retrievedAt)));
});
test('provider failure does not disclose upstream body or secret', async () => {
  await assert.rejects(searchPublicEvidence(input,config,async()=>({ok:false,status:429,json:async()=>({error:'fixture-only'})})), {message:'FIRECRAWL_HTTP_429'});
});
test('malformed successful response fails closed', async () => {
  await assert.rejects(searchPublicEvidence(input,config,async()=>({ok:true,json:async()=>({success:true,data:{}})})), {message:'FIRECRAWL_INVALID_RESPONSE'});
});
test('obvious sensitive query inputs and excessive limits are rejected before network', async () => {
  let calls=0;
  const fetcher=async()=>{calls++;};
  for(const publicQuery of ['','x'.repeat(501),'someone@example.org','https://example.org/?token=abc','123-45-6789']) {
    await assert.rejects(searchPublicEvidence({...input,publicQuery},config,fetcher));
  }
  await assert.rejects(searchPublicEvidence({...input,limit:50},config,fetcher));
  assert.equal(calls,0);
});
