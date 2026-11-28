import { describe, expect, it, vi } from 'vitest';
import { observeFirecrawlPublicSource } from '../firecrawlPublicSource.js';
const url = 'https://foundercontrolroom.org/';
const apiKey = 'fixture-only';
const payload = {success:true, data:{markdown:'# public', metadata:{sourceURL:url,url,statusCode:200,creditsUsed:5}}};
const json = (body: unknown = payload, status = 200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}});
const run = (fn: typeof fetch, target: unknown = 'fcr', key = apiKey) => observeFirecrawlPublicSource(target,{apiKey:key,fetchFn:fn});

describe('Firecrawl public-source adapter (provider boundary fixtures)', () => {
  it('rejects caller URLs, prototype keys and missing credentials without provider calls', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    for (const target of ['https://localhost/', '__proto__', 'constructor', null]) {
      expect((await run(fetchFn,target)).status).toBe('HOLD_UNVERIFIED');
    }
    expect((await run(fetchFn,'fcr','')).status).toBe('HOLD_UNVERIFIED');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('returns content receipt without authority or deployment proof', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json());
    const result = await run(fetchFn);
    expect(result.status).toBe('OBSERVED_PUBLIC_PAGE');
    if (result.status !== 'OBSERVED_PUBLIC_PAGE') throw Error('Expected observation');
    expect(result.receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt).toMatchObject({authorizesDraft:false,authorizesPublish:false,authorizesExecution:false,sourceClaimVerified:false,deploymentVerified:false,proofOfBusinessOutcome:false});
    expect(result.markdown).toBe('# public');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [endpoint,options] = fetchFn.mock.calls[0];
    expect(endpoint).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(String(options?.body))).toMatchObject({url,maxAge:0,storeInCache:false,redactPII:true});
  });
  it('rejects HTTP errors, malformed payloads and missing provider success', async () => {
    for (const response of [json({},429),new Response('bad',{headers:{'content-type':'application/json'}}),new Response('{}'),json({success:false})]) {
      expect((await run(vi.fn<typeof fetch>().mockResolvedValue(response))).status).toBe('HOLD_UNVERIFIED');
    }
  });
  it('rejects unexpected source or canonical URLs and non-200 target status', async () => {
    for (const metadata of [{...payload.data.metadata,url:'https://example.com/'},{...payload.data.metadata,sourceURL:'https://example.com/'},{...payload.data.metadata,statusCode:403}]) {
      expect((await run(vi.fn<typeof fetch>().mockResolvedValue(json({success:true,data:{...payload.data,metadata}})))).status).toBe('HOLD_UNVERIFIED');
    }
  });
  it('cancels oversized streamed response', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(524289));},cancel(){cancelled=true;}});
    const response = new Response(stream,{headers:{'content-type':'application/json'}});
    expect((await run(vi.fn<typeof fetch>().mockResolvedValue(response))).status).toBe('HOLD_UNVERIFIED');
    expect(cancelled).toBe(true);
  });
  it('rejects empty and oversized markdown', async () => {
    for(const markdown of ['  ','x'.repeat(200001)]) {
      expect((await run(vi.fn<typeof fetch>().mockResolvedValue(json({success:true,data:{...payload.data,markdown}})))).status).toBe('HOLD_UNVERIFIED');
    }
  });
  it('keeps thrown provider errors and credentials out of result', async () => {
    const result = await run(vi.fn<typeof fetch>().mockRejectedValue(new Error(apiKey)));
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
  it('accepts the explicitly allowed studio canonical URL', async () => {
    const metadata = {...payload.data.metadata,sourceURL:'https://jussco.company/',url:'https://www.jussco.company/'};
    expect((await run(vi.fn<typeof fetch>().mockResolvedValue(json({success:true,data:{...payload.data,metadata}})),'studio')).status).toBe('OBSERVED_PUBLIC_PAGE');
  });
});
