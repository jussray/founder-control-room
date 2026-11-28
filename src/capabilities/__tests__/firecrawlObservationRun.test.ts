import { describe, expect, it, vi } from 'vitest';
import { runFirecrawlObservation, runFirecrawlMonitorCycle, type FirecrawlObservationStore } from '../firecrawlObservationRun.js';

const now = () => new Date('2026-11-27T12:00:00Z');
const enabled = { FCR_FIRECRAWL_ENABLED:'true', FCR_FIRECRAWL_MONITOR_ENABLED:'true', FCR_FIRECRAWL_API_KEY:'fixture-only' };
function store(): FirecrawlObservationStore {
  const claimed = new Set<string>();
  return {
    claim: vi.fn(async (id: string) => { if(claimed.has(id)) return false; claimed.add(id); return true; }),
    previous: vi.fn(async () => null),
    persist: vi.fn(async () => true),
  };
}
function provider() {
  return vi.fn<typeof fetch>().mockImplementation(async (_u, init) => {
    const url = JSON.parse(String(init?.body)).url;
    return new Response(JSON.stringify({success:true,data:{markdown:'# public',metadata:{sourceURL:url,url,statusCode:200,creditsUsed:5}}}),{headers:{'content-type':'application/json'}});
  });
}
describe('bounded Firecrawl capability run',()=>{
  it('does no network or ledger work when disabled, missing credential or target is invalid',async()=>{
    const s=store(), fetchFn=provider();
    for(const [target,env] of [['fcr',{}],['fcr',{FCR_FIRECRAWL_ENABLED:'true'}],['https://example.com',enabled]] as const) {
      expect((await runFirecrawlObservation(target,{store:s,env,fetchFn,now})).status).toBe('held');
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(s.claim).not.toHaveBeenCalled();
  });
  it('permits at most one request per target per UTC day and persists metadata only',async()=>{
    const s=store(), fetchFn=provider(), deps={store:s,env:enabled,fetchFn,now};
    const first=await runFirecrawlObservation('fcr',deps);
    expect(first.status).toBe('observed');
    expect((await runFirecrawlObservation('fcr',deps)).status).toBe('held');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(s.persist).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(s.persist).mock.calls)).not.toContain('# public');
    expect(JSON.stringify(vi.mocked(s.persist).mock.calls)).not.toContain('fixture-only');
  });
  it('does not return observed if persistence fails',async()=>{
    const s=store();vi.mocked(s.persist).mockResolvedValue(false);
    expect((await runFirecrawlObservation('fcr',{store:s,env:enabled,fetchFn:provider(),now})).status).toBe('held');
  });
  it('does not scrape when durable claim fails',async()=>{
    const s=store(), fetchFn=provider();vi.mocked(s.claim).mockRejectedValue(new Error('private fixture'));
    expect((await runFirecrawlObservation('fcr',{store:s,env:enabled,fetchFn,now})).status).toBe('held');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('compares only against stored prior evidence',async()=>{
    const s=store();vi.mocked(s.previous).mockResolvedValue('a'.repeat(64));
    const result=await runFirecrawlObservation('fcr',{store:s,env:enabled,fetchFn:provider(),now});
    expect(result.status).toBe('observed');
    if(result.status==='observed') expect(result.change).toBe('changed');
  });
  it('monitor stays off by default and outside its UTC window',async()=>{
    const s=store(), fetchFn=provider();
    expect((await runFirecrawlMonitorCycle({store:s,env:{...enabled,FCR_FIRECRAWL_MONITOR_ENABLED:'false'},fetchFn,now})).status).toBe('skipped');
    expect((await runFirecrawlMonitorCycle({store:s,env:enabled,fetchFn,now:()=>new Date('2026-11-27T13:00:00Z')})).status).toBe('skipped');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('reports scheduled provider failures without treating duplicate claims as failures',async()=>{
    const s=store(), fetchFn=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(null,{status:503}));
    const deps={store:s,env:enabled,fetchFn,now};
    const first=await runFirecrawlMonitorCycle(deps);
    expect(first.status).toBe('failed');
    if(first.status!=='skipped') expect(first.outcomes).toEqual(['fcr','studio','truthweaverShop'].map(target=>({target,status:'held',reason:'PROVIDER_HTTP_FAILURE'})));
    const second=await runFirecrawlMonitorCycle(deps);
    expect(second.status).toBe('attempted');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('scheduled and manual runs share a daily budget',async()=>{
    const s=store(), fetchFn=provider(), deps={store:s,env:enabled,fetchFn,now};
    await runFirecrawlObservation('fcr',deps);
    await runFirecrawlMonitorCycle(deps);
    await runFirecrawlMonitorCycle(deps);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
