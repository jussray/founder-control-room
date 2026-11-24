// Existing Founder Truth Console owns navigation; these panels make no client-side provider calls.
const BASE='/dashboard/truth/intelligence';
function node(tag,text='',className=''){
 const e=document.createElement(tag);
 if(text)e.textContent=text;
 if(className)e.className=className;
 return e;
}
function row(label,value){
 const wrap=node('div','','truth-receipt-row');
 wrap.append(node('span',label),node('strong',String(value??'Unknown')));
 return wrap;
}
function panel(root,title,subtitle){
 const area=node('section','','panel');
 area.dataset.truthScreen='true';
 area.append(node('h2',title),node('p',subtitle,'muted'));
 root.replaceChildren(area);
 return area;
}
async function request(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',
   cache:'no-store',headers:{Accept:'application/json',
     ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(String(data.error??'provider_unavailable'));
 return data;
}
function section(parent,title,items){
 parent.append(node('h3',title));
 const group=node('div','','truth-operation-receipt');
 if(!items.length)group.append(node('p','No verified data returned.','muted'));
 for(const item of items)group.append(item);
 parent.append(group);
}
export async function renderSeoIntelligence(root){
 const view=panel(root,'Search Console · indexing and sitemap health',
   'Read-only Google Search Console evidence for the published FCR website. Sitemap processing and indexing are separate.');
 const state=node('p','Checking authorized Search Console connection…','muted');
 state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 view.append(state);
 try{
   const data=await request(BASE+'/seo');
   state.textContent='Observed '+String(data.checkedAt??'unknown')+' · '+String(data.property??'unknown');
   section(view,'Submitted sitemaps',(data.sitemaps??[]).map(item=>{
     const article=node('article','','truth-evidence-card');
     article.append(row('Path',item.path),row('Pending',item.isPending===true?'Yes':
       item.isPending===false?'No':'Unknown'),row('Errors',item.errors),
       row('Warnings',item.warnings),row('Last submitted',item.lastSubmitted),
       row('Last downloaded',item.lastDownloaded));
     return article;
   }));
   section(view,'Google URL inspection · fixed five-page sample',(data.pages??[]).map(item=>{
     const article=node('article','','truth-evidence-card');
     article.append(row('URL',item.url),row('Inspection',item.status),
       row('Google verdict',item.verdict),row('Coverage',item.coverageState),
       row('Indexing policy',item.indexingState),row('Last crawl',item.lastCrawlTime));
     return article;
   }));
   section(view,'Evidence limits',(data.limitations??[]).map(str=>node('p',str,'muted')));
   view.append(node('p','Sitewide indexed-page count: Not available from this API sample.','muted'));
   view.append(node('p','SEO: confirm canonical URLs, crawlable pages, structured data, and sitemap accuracy. AEO/GEO: only verified public claims should be made AI-discoverable; private app content stays excluded.','muted'));
 }catch(e){
   state.textContent='Search Console not connected or unavailable: '+String(e.message??'provider_unavailable');
   view.append(node('p','The panel does not invent sitemap or indexing results. An authorized Google Search Console OAuth connection with webmasters.readonly access is required.','muted'));
 }
}
function evidenceFields(parent,index){
 const group=node('fieldset');
 group.append(node('legend','Evidence '+index));
 const source=node('input');source.name='source';source.maxLength=400;source.required=true;
 source.placeholder='Evidence source / citation';source.setAttribute('aria-label','Evidence source '+index);
 const text=node('textarea');text.name='text';text.maxLength=1200;text.required=true;
 text.placeholder='What the evidence actually establishes';text.setAttribute('aria-label','Evidence text '+index);
 group.append(source,text);parent.append(group);
 return group;
}
function list(parent,title,values){
 const box=node('section');box.append(node('h3',title));
 const ul=node('ul');for(const str of values)ul.append(node('li',str));
 box.append(ul);parent.append(box);
}
export async function renderEvidenceIntelligence(root){
 const view=panel(root,'Owner Evidence Challenger · AI Gateway',
   'Supply a claim and supporting evidence. The model identifies gaps and next verification gates; it cannot grant approval or independently verify your sources.');
 const form=node('form','','stack');
 const label=node('label','Claim to examine');const claim=node('textarea');
 claim.required=true;claim.maxLength=3000;claim.placeholder='One falsifiable claim; keep private customer information out.';
 label.append(claim);form.append(label);
 const group=node('div');const add=node('button','Add evidence');
 add.type='button';const submit=node('button','Analyze evidence gaps');
 submit.type='submit';
 const fields=[];
 const addField=()=>{
   if(fields.length>=12){add.disabled=true;return;}
   fields.push(evidenceFields(group,fields.length+1));
   if(fields.length===12)add.disabled=true;
 };
 add.addEventListener('click',addField);addField();
 const consentLabel=node('label','I explicitly authorize sending this claim and evidence to the configured AI model. I have removed secrets and unrelated personal data.');
 const consent=node('input');
 consent.type='checkbox';consent.required=true;consent.setAttribute('aria-label','Authorize evidence transfer to AI Gateway');
 consentLabel.prepend(consent);
 const status=node('p','FCR does not save or publish this submission. Your claim and evidence are sent through Cloudflare AI Gateway to the configured model provider, which may process them under its policies. Do not enter secrets or private customer data.','muted');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const result=node('section');
 form.append(group,add,consentLabel,submit,status);
 view.append(form,result);
 form.addEventListener('submit',async ev=>{
   ev.preventDefault();submit.disabled=true;result.replaceChildren();
   status.textContent='Reviewing untrusted evidence through the configured gateway…';
   const evidence=fields.map((field,i)=>({
     id:'e'+(i+1),
     source:field.querySelector('[name=source]').value,
     text:field.querySelector('[name=text]').value
   })).filter(x=>x.source.trim()&&x.text.trim());
   try{
     const data=await request(BASE+'/review',{claim:claim.value,evidence,shareEvidenceWithModel:consent.checked});
     status.textContent='Advisory result · '+String(data.checkedAt??'unknown')+
       ' · '+String(data.model??'model unavailable');
     list(result,'Evidence gaps',(data.gaps??[]).map(x=>String(x.issue)+' · refs: '+
       (x.evidenceIds??[]).join(', ')));
     list(result,'Attack questions',data.attackQuestions??[]);
     result.append(row('Recommended gate',data.nextGate?.gate),
       node('p',String(data.nextGate?.reason??'')));
     list(result,'Proof required next',data.nextGate?.requiredEvidence??[]);
     result.append(node('p','Input fingerprint: '+String(data.receipt?.inputSha256??'unknown'),'muted'),
       node('p','MODEL ANALYSIS, NOT INDEPENDENT FACT VERIFICATION. No deploy, merge, publication or payment authority.','muted'));
   }catch(e){
     status.textContent='Review unavailable: '+String(e.message??'gateway_unavailable')+
       '. No model conclusions were invented.';
   }finally{submit.disabled=false;}
 });
}
