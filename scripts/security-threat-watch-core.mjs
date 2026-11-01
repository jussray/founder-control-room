// JUSS & CO first-party defensive monitoring. Every external input remains untrusted.
const LIMIT = 300000;
const unique = (values, limit=40) => [...new Set(values)].slice(0,limit);
const unescapeXml = (s) => s.replace(/&(?:amp|lt|gt|quot|apos);/gi, x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[x.toLowerCase()]);
const clean = (value) => unescapeXml(String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,1200);
function xmlText(block,tag) {
  const p=new RegExp('<(?:[\\w-]+:)?'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+tag+'\\s*>','i');
  return clean(block.match(p)?.[1]||'');
}
export function parseSyndication(xml) {
  if (typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>LIMIT) throw Error('Feed too large');
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw Error('XML entities forbidden');
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw Error('Unsupported feed');
  const entries=[];
  for (const match of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const atom=match[1].toLowerCase()==='entry', body=match[2];
    const rawLink=atom ? (body.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1]||'') : xmlText(body,'link');
    const link=clean(rawLink);
    entries.push({title:xmlText(body,'title').slice(0,200),
      summary:(xmlText(body,'description')||xmlText(body,'summary')||xmlText(body,'content')).slice(0,900),
      link:link.startsWith('https://')?link:''});
    if(entries.length===40)break;
  }
  return entries;
}
export function extractIndicators(value) {
  const text=String(value||'').slice(0,20000);
  const urls=unique((text.match(/https?:\/\/[^\s<>"')\]]+/gi)||[]).map(s=>s.replace(/[.,;!?]+$/,'')));
  const cves=unique((text.match(/\bCVE-\d{4}-\d{4,}\b/gi)||[]).map(s=>s.toUpperCase()));
  const ghsas=unique(text.match(/\bGHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/gi)||[]);
  const ips=unique((text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)||[]).filter(ip=>ip.split('.').every(octet=>Number(octet)<256)));
  const domains=unique([...urls.map(s=>{try{return new URL(s).hostname}catch{return ''}}),
    ...(text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)||[])].map(x=>x.toLowerCase())
    .filter(x=>x.length<=253&&!/^\d+\.\d+\.\d+\.\d+$/.test(x)));
  return {urls,cves,ghsas,ips,domains};
}
export function detectPromptInjection(text) {
  const s=String(text||'').slice(0,20000);
  const patterns=[
    /ignore (?:all |the |your )?(?:previous|prior|above|system|developer) instructions/i,
    /(?:system|developer|tool)\s*(?:message|role|override|prompt)/i,
    /(?:bypass|disable|skip) (?:founder|approval|authorization|security|guardrails|safety)/i,
    /(?:deploy|merge|execute|delete|exfiltrate) without (?:approval|permission|authorization)/i,
    /(?:reveal|print|send) (?:your |the )?(?:secrets|system prompt|credentials|tokens)/i
  ];
  const markers=patterns.flatMap((p,i)=>p.test(s)?['marker-'+(i+1)]:[]);
  return {suspected:markers.length>0,markers,trustedInstruction:false};
}
export function classifySecuritySignal(signal) {
  const severity=String(signal?.severity||'').toLowerCase();
  return {priority:['critical','high'].includes(severity)?'review-now': ['moderate','medium'].includes(severity)?'review':'observe',
    category:String(signal?.issue_class||'uncategorized').replace(/[^a-z0-9_-]/gi,'').slice(0,64),
    verifiedCompromise:false, approvalRequired:true, executionAllowed:false};
}
export function routeSecuritySkills({kind='general',severity='low'}={}) {
  const skills=['broke-founder','juss-founder-os','portfolio-control-plane','control-room-skill-router','control-room-proof-ladder'];
  if(/incident|intrusion|abuse|prompt-injection|indicator|access|threat/.test(kind)||/critical|high/.test(severity)) {
    skills.push('control-room-incident-triage','typescript-audit','devil');
  }
  if(kind==='prompt-injection') skills.push('truth-decay-audit','goalfix');
  return {skills:unique(skills),executionAllowed:false,nextGate:'Founder authorization and exact-head provider/runtime evidence'};
}
export function brokeFounderGate({incrementalMonthlyCost=0,incrementalOneTimeCost=0,founderCostApproval=false,providerAvailable=true,firstPartyFeasible=true}={}) {
  if(!Number.isFinite(incrementalMonthlyCost)||!Number.isFinite(incrementalOneTimeCost)||incrementalMonthlyCost<0||incrementalOneTimeCost<0)
    return {allowed:false,reason:'INVALID_COST_EVIDENCE'};
  if((incrementalMonthlyCost>0||incrementalOneTimeCost>0)&&!founderCostApproval)
    return {allowed:false,reason:'FOUNDER_COST_APPROVAL_REQUIRED'};
  if(!providerAvailable)
    return {allowed:firstPartyFeasible,reason:firstPartyFeasible?'BUILD_FIRST_PARTY_ADAPTER':'CAPABILITY_GAP'};
  return {allowed:true,reason:'ZERO_INCREMENTAL_COST'};
}
export function summarizePortfolioObservation({zoneCount=0,issues=[],feedEntries=[],articleCount=0,indicatorCount=0,blockedSources=[]}={}) {
  const counts={zones:zoneCount,issues:issues.length,critical:issues.filter(i=>String(i.severity).toLowerCase()==='critical').length,
    moderate:issues.filter(i=>['moderate','medium'].includes(String(i.severity).toLowerCase())).length,
    feedEntries:feedEntries.length,articles:articleCount,indicators:indicatorCount,sourceBlocks:blockedSources.length,
    suspectedPromptInjections:feedEntries.filter(e=>detectPromptInjection((e.title||'')+' '+(e.summary||'')).suspected).length};
  return {schema:'juss/fcr-threat-observation@v1',status:blockedSources.length?'PARTIAL':'OBSERVED',
    counts,action:counts.critical||counts.suspectedPromptInjections?'REVIEW_REQUIRED':'OBSERVE',
    sourceBlocks:unique(blockedSources.map(x=>String(x).replace(/[^a-z0-9_-]/gi,'').slice(0,40))),
    proof:{compromiseVerified:false,sourceChangesApplied:false,productionVerified:false},
    skills:routeSecuritySkills({kind:'threat',severity:counts.critical?'critical':'low'}).skills};
}