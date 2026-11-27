
export const GSC_CONTRACT='fcr/search-console-read@v1';
export const GSC_SITE='https://www.foundercontrolroom.org/';
export const GSC_PAGES=[
 'https://www.foundercontrolroom.org/',
 'https://www.foundercontrolroom.org/juss-rayy/',
 'https://www.foundercontrolroom.org/work.html',
 'https://www.foundercontrolroom.org/guardrails',
 'https://www.foundercontrolroom.org/mom8/'
];

export const GSC_SITE_PROFILES = {
 fcr: {
   property: GSC_SITE,
   pages: GSC_PAGES,
 },
 jussco: {
   // Domain-property inspection covers both apex and www hostnames.
   // Only URLs already declared in the current public Juss & Co sitemap are sampled.
   property: 'sc-domain:jussco.company',
   pages: [
     'https://www.jussco.company/',
     'https://www.jussco.company/services.html',
     'https://www.jussco.company/work.html',
     'https://www.jussco.company/licensing.html',
     'https://www.jussco.company/creative-history.html',
     'https://www.jussco.company/games/',
   ],
 },
} as const;
export type GscSiteKey = keyof typeof GSC_SITE_PROFILES;
export function resolveGscSite(site: string|undefined): {
 property: string; pages: readonly string[]; key: GscSiteKey;
} {
 const key = site ?? 'fcr';
 if (key !== 'fcr' && key !== 'jussco')
   throw new GscReadError('invalid_site_selection');
 const profile = GSC_SITE_PROFILES[key];
 return {key,property:profile.property,pages:profile.pages};
}
export class GscReadError extends Error {
 constructor(public readonly reason:string){super(reason);}
}
type Fetcher=typeof fetch;
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new GscReadError('invalid_provider_data');
 return value as Record<string,unknown>;
}
function text(value:unknown):string|null {
 return typeof value==='string'&&value.length<=2500?value:null;
}
function count(value:unknown):number|null{
 const n=Number(value);
 return value!==null&&value!==undefined&&Number.isSafeInteger(n)&&n>=0?n:null;
}
async function read(fetchFn:Fetcher,url:string,token:string,body?:object):Promise<Record<string,unknown>>{
 const ac=new AbortController();
 const timer=setTimeout(()=>ac.abort(),12000);
 try{
   const r=await fetchFn(url,{method:body?'POST':'GET',redirect:'error',signal:ac.signal,
     headers:{Authorization:'Bearer '+token,Accept:'application/json',
       ...(body?{'Content-Type':'application/json'}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   if(!r.ok)throw new GscReadError(r.status===401||r.status===403?
     'provider_access_denied':r.status===429?'provider_quota_exceeded':'provider_unavailable');
   return record(await r.json());
 }catch(e){if(e instanceof GscReadError)throw e;throw new GscReadError('provider_unavailable');}
 finally{clearTimeout(timer);}
}
export async function getGscAccessToken(secret:string,fetchFn:Fetcher=fetch):Promise<string>{
 let config:Record<string,unknown>;
 try{config=record(JSON.parse(secret));}catch{throw new GscReadError('not_configured');}
 if(typeof config.client_id!=='string'||typeof config.client_secret!=='string'||
   typeof config.refresh_token!=='string'||!config.client_id.endsWith('.apps.googleusercontent.com')||
   config.client_secret.length<10||config.refresh_token.length<10)throw new GscReadError('not_configured');
 const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),12000);
 try{
   const r=await fetchFn('https://oauth2.googleapis.com/token',{
     method:'POST',redirect:'error',signal:ac.signal,
     headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({client_id:config.client_id,
       client_secret:config.client_secret,refresh_token:config.refresh_token,
       grant_type:'refresh_token'} as Record<string,string>).toString()
   });
   if(!r.ok)throw new GscReadError('oauth_refresh_failed');
   const payload=record(await r.json());
   if(typeof payload.access_token!=='string'||payload.access_token.length<20)
     throw new GscReadError('oauth_refresh_failed');
   return payload.access_token;
 }catch(e){if(e instanceof GscReadError)throw e;throw new GscReadError('oauth_refresh_failed');}
 finally{clearTimeout(timer);}
}
export async function readGscSnapshot(params:{
 token:string;fetchFn?:Fetcher;now?:()=>Date;site?:GscSiteKey;
}){
 const {token,fetchFn=fetch,now=()=>new Date()}=params;
 const selected=resolveGscSite(params.site);
 if(typeof token!=='string'||token.length<20)throw new GscReadError('not_configured');
 const site=encodeURIComponent(selected.property);
 const property=await read(fetchFn,'https://www.googleapis.com/webmasters/v3/sites/'+site,token);
 if(!text(property.permissionLevel)||property.permissionLevel==='siteUnverifiedUser')
   throw new GscReadError('provider_access_denied');
 const sitemapsResponse=await read(fetchFn,
   'https://www.googleapis.com/webmasters/v3/sites/'+site+'/sitemaps',token);
 if(sitemapsResponse.sitemap!==undefined&&!Array.isArray(sitemapsResponse.sitemap))
   throw new GscReadError('invalid_provider_data');
 const sitemaps=(sitemapsResponse.sitemap as unknown[]|undefined ?? []).slice(0,100).map(raw=>{
   const v=record(raw);
   if(!text(v.path))throw new GscReadError('invalid_provider_data');
   return {path:v.path,lastSubmitted:text(v.lastSubmitted),lastDownloaded:text(v.lastDownloaded),
     isPending:typeof v.isPending==='boolean'?v.isPending:null,errors:count(v.errors),
     warnings:count(v.warnings),type:text(v.type)};
 });
 const pages=[];
 for(const url of selected.pages){
   try{
     const v=await read(fetchFn,'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
       token,{inspectionUrl:url,siteUrl:selected.property,languageCode:'en-US'});
     const result=record(record(v.inspectionResult).indexStatusResult);
     pages.push({url,status:'reported',verdict:text(result.verdict)??'UNKNOWN',
       coverageState:text(result.coverageState),indexingState:text(result.indexingState),
       lastCrawlTime:text(result.lastCrawlTime),pageFetchState:text(result.pageFetchState)});
   }catch{
     pages.push({url,status:'unavailable',verdict:'UNKNOWN',coverageState:null,
       indexingState:null,lastCrawlTime:null,pageFetchState:null});
   }
 }
 return {contract:GSC_CONTRACT,property:selected.property,checkedAt:now().toISOString(),
   propertyPermission:property.permissionLevel,sitemaps,pages,scope:selected.key==='jussco'?'six_url_sample_only':'five_url_sample_only',
   indexedCount:null,limitations:[
     'Sitemaps processed does not mean their pages are indexed.',
     'A sampled set of inspected URLs does not establish a full sitewide indexed-page count.',
     'Unavailable URL inspections are UNKNOWN, not NOT_INDEXED.']};
}
