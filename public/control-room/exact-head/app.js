(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const mk=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text??'UNKNOWN');return n};
  const clear=n=>n.replaceChildren();
  const STAGES=['Find failure','Diagnose','Fix','Verify','Harden','Reverify','Deploy','Production proof'];
  const FIELDS=['REALITY','FIX','PROOF','RISK','ROLLBACK','NEXT GATE'];
  let projects=[],selected=null,inspected=null,stage=0;
  const note={};
  for(const k of FIELDS)note[k]='';
  async function get(path){
    const r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(d.detail||d.code||'Source unavailable'),{status:r.status});
    return d;
  }
  function message(s){const n=el('message');n.hidden=!s;n.textContent=s||''}
  function cell(key,v){const d=mk('div');d.append(mk('small','',key),mk('code','',v||'NOT VERIFIED'));return d}
  function count(key,v){const d=mk('div');d.append(mk('strong','',v===null?'?':v),mk('small','',key));return d}
  function reset(){inspected=null;stage=0;el('detail').hidden=true;for(const k of FIELDS){note[k]='';const input=document.getElementById('n-'+k.replaceAll(' ','_'));if(input)input.value=''}pipeline()}
  function pipeline(){const root=el('pipeline');clear(root);STAGES.forEach((name,i)=>{
    const b=mk('button',stage===i?'active':'',name);b.type='button';b.prepend(mk('span','',String(i+1).padStart(2,'0')));
    b.disabled=i>Math.min(stage+1,5);b.title=i>=6?'Requires FCR production proof':'Operator work stage only';
    b.onclick=()=>{stage=i;pipeline()};root.append(b)
  })}
  function renderRegistry(){const menu=el('project-nav'),select=el('project');clear(menu);clear(select);for(const p of projects){
    const item=mk('button',p.id===selected?'chosen':'',p.name);item.type='button';item.disabled=!p.repository;
    item.onclick=()=>{selected=p.id;select.value=p.id;reset();renderRegistry();message('Enter a PR number to inspect.')};menu.append(item);
    const opt=mk('option','',p.name);opt.value=p.id;opt.disabled=!p.repository;select.append(opt)
  }if(selected)select.value=selected}
  function render(d){
    inspected=d;el('detail').hidden=false;
    el('identity').textContent=d.project.name+' / PR #'+d.pullRequest
      +(d.pr?.draft?' / DRAFT':'')+(d.pr?.state==='closed'?' / CLOSED':'');
    const sha=el('sha');clear(sha);sha.append(cell('BASE SHA',d.exact.baseSha),cell('HEAD SHA',d.exact.headSha),cell('LIVE BASE',d.live.currentBaseSha),cell('LIVE HEAD',d.live.currentHeadSha));
    const counts=el('counts');clear(counts);counts.append(count('FAILING',d.counts.failing),count('QUEUED',d.counts.queued),count('CANCELLED',d.counts.cancelled),count('DUPLICATES',d.counts.duplicate));
    const checks=el('checks');clear(checks);if(!d.checks.length)checks.append(mk('p','unknown','No check evidence. Unknown is not green.'));
    for(const c of d.checks){const row=mk('div','check'),left=mk('div'),right=mk('div');left.append(mk('b','',c.name),mk('small','',c.observedAt||'Time unverified'));right.append(mk('strong',c.status,c.status));
      try{const url=new URL(c.url);if(url.protocol==='https:'&&url.host==='github.com'){const a=mk('a','','↗');a.href=url.toString();a.target='_blank';a.rel='noopener noreferrer';right.append(a)}}catch{}
      row.append(left,right);checks.append(row)}
    const gates=el('gates');clear(gates);for(const [k,v] of [['GitHub checks',d.gate.observedChecksPassed?'PASS (PARTIAL)':'BLOCKED'],['Required rulesets','UNKNOWN'],['FCR founder approval','NOT GRANTED'],['Cloudflare production','UNKNOWN'],['Supabase / runtime','UNKNOWN']]){
      const row=mk('div','gate');row.append(mk('span','',k),mk('b','',v));gates.append(row)}
    el('next').textContent=d.nextReversibleFix;const bs=el('blockers');clear(bs);for(const b of d.blockers)bs.append(mk('li','',b));
    el('source').textContent=d.evidenceStatus==='partial_current'?'PARTIAL':'STALE';
    message('Observed '+new Date(d.observedAt).toLocaleString()+'. Release authority remains blocked.');
  }
  function records(){const root=el('fields');for(const name of FIELDS){const box=mk('div'),label=mk('label','',name),area=mk('textarea');area.id='n-'+name.replaceAll(' ','_');label.htmlFor=area.id;area.rows=3;area.maxLength=2500;area.placeholder='Verified / inferred / unknown';area.oninput=()=>{note[name]=area.value};box.append(label,area);root.append(box)}
    el('record').onsubmit=e=>{e.preventDefault();const payload={contract:'fcr/cockpit-operator-handoff@v1',authority:'none',evidenceClassification:'operator_only',observedAt:inspected?.observedAt||null,project:inspected?.project||null,exact:inspected?.exact||null,stage:STAGES[stage],notes:note};
      const object=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
      const a=mk('a');a.href=object;a.download='fcr-exact-head-record.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);message('Local handoff exported. This is not a verified FCR receipt.')}}
  async function boot(){pipeline();records();try{
      await get('/auth/me');const data=await get('/integration-cockpit/projects');
      if(!Array.isArray(data.projects)||data.projects.length!==9)throw new Error('Registry incomplete');
      projects=data.projects;selected=projects.find(p=>p.repository)?.id||null;
      el('access').hidden=true;el('private').hidden=false;renderRegistry();
      el('project').onchange=()=>{selected=el('project').value;reset();renderRegistry();message('Target changed. Refresh exact-head evidence.')};
      el('inspect').onsubmit=async e=>{e.preventDefault();const id=el('project').value,n=Number(el('pr').value);if(!Number.isSafeInteger(n)||n<=0)return message('Valid PR number required.');
        el('go').disabled=true;reset();message('Reading current GitHub evidence...');
        try{render(await get('/integration-cockpit/inspect/'+encodeURIComponent(id)+'/'+n))}catch(error){el('source').textContent='UNKNOWN';message(error.message+'. Merge and deployment remain blocked.')}finally{el('go').disabled=false}}
    }catch(error){const root=el('access');clear(root);root.append(mk('h2','',error.status===401?'Sign in to Founder Control Room':'Private evidence unavailable'),mk('p','','Private project and engineering data remain hidden until the existing founder session is verified.'));const a=mk('a','','Open FCR sign-in →');a.href='/control-room/';root.append(a)}}
  boot();
})();