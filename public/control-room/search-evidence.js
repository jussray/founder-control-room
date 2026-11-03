// Compatibility alias: the main Truth Console owns both live feature paths.
// Preserve earlier UI source for audit, but navigate to the single guarded panel.
window.location.replace('/control-room/?tab=truth-seo');
const text=(value)=>String(value??'');
function node(tag,content){const el=document.createElement(tag);el.textContent=text(content);return el;}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
function status(el,content,state){el.textContent=text(content);el.dataset.state=state||'unknown';}
function section(parent,title){const h=node('h3',title);parent.append(h);return parent;}
function line(parent,lead,detail){const item=document.createElement('div');item.className='item';item.append(node('strong',lead),node('span',detail));parent.append(item);}
async function request(path,options){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...(options?.body?{'Content-Type':'application/json'}:{}),...options?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.code||body.error||('HTTP_'+response.status));
  return body;
}
const refresh=document.getElementById('search-refresh');
refresh.addEventListener('click',async()=>{
  const result=document.getElementById('search-results');
  const banner=document.getElementById('search-status');
  refresh.disabled=true;clear(result);status(banner,'Reading Search Console…');
  try{
    const value=await request('/owner-insights/search-console');
    if(value.contract!=='fcr/owner-intelligence@v1'||value.status!=='OBSERVED')throw Error('CONTRACT_MISMATCH');
    status(banner,'Observed '+value.observedAt+' · '+value.property,'observed');
    section(result,'Sitemaps submitted in Google Search Console');
    if(!value.sitemaps?.length)line(result,'None reported','No sitemap entry returned. This is not proof that a sitemap was processed.');
    for(const map of value.sitemaps||[]){
      line(result,map.path, 'Pending: '+text(map.isPending)+' · errors: '+text(map.errors??'unknown')+' · warnings: '+text(map.warnings??'unknown')+' · last downloaded: '+text(map.lastDownloaded??'unknown'));
    }
    section(result,'Google URL Inspection — five published pages (sample only)');
    for(const page of value.pages||[]){
      line(result,page.url,'Verdict: '+text(page.state)+' · coverage: '+text(page.coverageState??page.reason??'unknown')+' · crawled: '+text(page.lastCrawlTime??'unknown'));
    }
  }catch(error){status(banner,'BLOCKED: '+text(error.message)+'. No indexed status can be inferred.','blocked');}
  finally{refresh.disabled=false;}
});
const list=document.getElementById('evidence-list');
document.getElementById('add-evidence').addEventListener('click',()=>{
  if(list.children.length>=8)return;
  const item=document.createElement('div');item.className='evidence-item';
  const sourceLabel=node('label','Source');const source=document.createElement('input');source.name='source';source.maxLength=400;source.required=true;
  const evidenceLabel=node('label','Observed fact');const observation=document.createElement('textarea');observation.name='observation';observation.maxLength=1000;observation.required=true;
  const remove=node('button','Remove evidence');remove.type='button';remove.className='secondary';remove.addEventListener('click',()=>item.remove());
  sourceLabel.append(source);evidenceLabel.append(observation);item.append(sourceLabel,evidenceLabel,remove);list.append(item);
});
const form=document.getElementById('claim-form');
form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const submit=document.getElementById('claim-submit'),banner=document.getElementById('claim-status'),result=document.getElementById('claim-results');
  const data=new FormData(form);
  const evidence=[...list.children].map(item=>({source:item.querySelector('[name="source"]').value.trim(),observation:item.querySelector('[name="observation"]').value.trim()}));
  const payload={projectSlug:text(data.get('projectSlug')).trim(),claim:text(data.get('claim')).trim(),evidence,shareEvidenceWithModel:data.get('shareEvidenceWithModel')==='on'};
  submit.disabled=true;clear(result);status(banner,'Requesting advisory model review…');
  try{
    const reply=await request('/owner-insights/claims/review',{method:'POST',body:JSON.stringify(payload)});
    if(reply.contract!=='fcr/owner-intelligence@v1'||reply.authority!=='ADVISORY_ONLY'||reply.releaseAuthorized!==false)throw Error('INVALID_AUTHORITY_RESPONSE');
    status(banner,'ADVISORY ONLY · '+text(reply.source)+' · '+text(reply.observedAt),'observed');
    section(result,'Evidence gaps');
    const gaps=document.createElement('ul');for(const gap of reply.gaps||[])gaps.append(node('li',gap));result.append(gaps);
    section(result,'Attack questions');
    const questions=document.createElement('ul');for(const question of reply.attackQuestions||[])questions.append(node('li',question));result.append(questions);
    line(result,'Recommended next gate: '+text(reply.nextGate),text(reply.rationale));
    line(result,'Release authority','None. This model did not verify the source or authorize action.');
  }catch(error){status(banner,'BLOCKED: '+text(error.message)+'. No AI verdict was produced.','blocked');}
  finally{submit.disabled=false;}
});
