import {describe,expect,it,vi} from 'vitest';
import {getGscAccessToken,readGscSnapshot,GSC_PAGES,GSC_SITE,GSC_SITE_PROFILES,resolveGscSite} from '../searchConsoleRead.js';
const mockJson=(data:unknown)=>({ok:true,status:200,json:async()=>data}) as Response;
describe('Search Console founder read model',()=>{
 it('reports submitted sitemaps and sampled URLs without claiming sitewide indexed counts',async()=>{
   const calls:Array<{url:string;init:RequestInit|undefined}>=[];
   const fetchFn=vi.fn(async (url:string|URL|Request,init?:RequestInit)=>{
     calls.push({url:String(url),init});
     if(String(url).endsWith('/sitemaps'))return mockJson({sitemap:[{
       path:GSC_SITE+'sitemap.xml',isPending:false,errors:'0',warnings:'2',
       lastSubmitted:'2026-10-30T00:00:00.000Z'}]});
     if(String(url).includes('urlInspection'))return mockJson({inspectionResult:{
       indexStatusResult:{verdict:'PASS',coverageState:'Submitted and indexed',indexingState:'INDEXING_ALLOWED'}}});
     return mockJson({permissionLevel:'siteOwner'});
   }) as unknown as typeof fetch;
   const output=await readGscSnapshot({token:'test-access-token-with-length',fetchFn,
     now:()=>new Date('2026-11-02T21:00:00.000Z')});
   expect(output.sitemaps).toMatchObject([{isPending:false,errors:0,warnings:2}]);
   expect(output.pages).toHaveLength(GSC_PAGES.length);
   expect(output.indexedCount).toBe(null);
   expect(output.scope).toBe('five_url_sample_only');
   const inspections=calls.filter(x=>x.url.includes('urlInspection'));
   expect(inspections).toHaveLength(GSC_PAGES.length);
   expect(inspections[0].init?.method).toBe('POST');
   expect(JSON.parse(String(inspections[0].init?.body)).siteUrl).toBe(GSC_SITE);
 });

 it('uses only declared Juss & Co sitemap URLs for a separate read-only GSC domain property',async()=>{
   const calls:Array<{url:string;init?:RequestInit}>=[];
   const fetchFn=vi.fn(async (url:string|URL|Request,init?:RequestInit)=>{
     calls.push({url:String(url),init});
     if(String(url).endsWith('/sitemaps'))return mockJson({sitemap:[{
       path:'https://www.jussco.company/sitemap.xml',isPending:true,errors:0,warnings:0
     }]});
     if(String(url).includes('/urlInspection/'))return mockJson({inspectionResult:{
       indexStatusResult:{verdict:'NEUTRAL',coverageState:'Discovered - currently not indexed'}
     }});
     return mockJson({permissionLevel:'siteFullUser'});
   }) as unknown as typeof fetch;
   const observed=await readGscSnapshot({token:'test-access-token-with-length',site:'jussco',fetchFn});
   expect(observed.property).toBe('sc-domain:jussco.company');
   expect(observed.pages.map(p=>p.url)).toEqual(GSC_SITE_PROFILES.jussco.pages);
   expect(observed.scope).toBe('six_url_sample_only');
   expect(observed.indexedCount).toBeNull();
   expect(calls.filter(x=>x.url.includes('urlInspection'))).toHaveLength(6);
   expect(calls.filter(x=>x.url.includes('urlInspection')).every(x=>
     JSON.parse(String(x.init?.body)).siteUrl==='sc-domain:jussco.company')).toBe(true);
   expect(calls.some(x=>x.url.includes(encodeURIComponent('sc-domain:jussco.company')))).toBe(true);
 });
 it('rejects arbitrary Search Console property selections without any provider request',()=>{
   expect(() => resolveGscSite('https://outside.example')).toThrowError('invalid_site_selection');
   expect(resolveGscSite('jussco')).toMatchObject({property:'sc-domain:jussco.company'});
 });
 it('preserves unavailable inspection as UNKNOWN, not not-indexed',async()=>{
   const result=await readGscSnapshot({token:'test-access-token-with-length',fetchFn:(
     async (url:string)=>{
       if(url.includes('/sitemaps'))return mockJson({});
       if(url.includes('urlInspection'))return {ok:false,status:429,json:async()=>({})} as Response;
       return mockJson({permissionLevel:'siteOwner'});
     }) as typeof fetch});
   expect(result.pages.every(x=>x.status==='unavailable'&&x.verdict==='UNKNOWN')).toBe(true);
 });
 it('does not silently treat provider permission failures as empty indexing',async()=>{
   await expect(readGscSnapshot({token:'test-access-token-with-length',
     fetchFn:(async()=>({ok:false,status:403,json:async()=>({})} as Response)) as typeof fetch}))
     .rejects.toMatchObject({reason:'provider_access_denied'});
 });
 it('uses server-owned OAuth refresh grant and never returns refresh secrets',async()=>{
   let body='';
   const config=JSON.stringify({client_id:'project.apps.googleusercontent.com',
     client_secret:'test-secret-long',refresh_token:'test-refresh-token'});
   const token=await getGscAccessToken(config,(async (_url:string,opts:RequestInit)=>{
     body=String(opts.body);
     return mockJson({access_token:'fresh-test-token-with-length'});
   }) as typeof fetch);
   expect(token).toBe('fresh-test-token-with-length');
   expect(body).toContain('grant_type=refresh_token');
   expect(body).not.toContain('webmasters.write');
 });
});
