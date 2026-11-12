(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const mk=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text??'UNKNOWN');return n};
  const clear=n=>n.replaceChildren();
  const STAGES=['FIND FAILURE','DIAGNOSE','VERIFY','ACCEPT OR BLOCK'];
  const FIELDS=['REALITY','FIX','PROOF','RISK','ROLLBACK','NEXT GATE'];
  let projects=[],selected=null,inspected=null,stage=0,inspectionGeneration=0;
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
  // A project/PR change invalidates every previous evidence surface and
  // every in-flight response, not just the collapsed check list.
  function reset(){
    inspectionGeneration+=1;
    inspected=null;stage=0;el('detail').hidden=true;
    el('go').disabled=false;
    el('source').textContent='UNKNOWN';
    el('next').textContent='Inspect a live PR to identify the next bounded action.';
    const blockers=el('blockers');clear(blockers);
    blockers.append(mk('li','','Exact PR head not yet verified'));
    const gates=el('gates');clear(gates);
    for(const [name,status] of [
      ['GitHub checks','UNKNOWN'],['Required rulesets','UNKNOWN'],
      ['FCR founder approval','NOT GRANTED'],['Cloudflare production','UNKNOWN'],
      ['Supabase / runtime','UNKNOWN']
    ]){
      const row=mk('div','gate');
      row.append(mk('span','',name),mk('b','',status));
      gates.append(row);
    }
    for(const k of FIELDS){
      note[k]='';
      const input=document.getElementById('n-'+k.replaceAll(' ','_'));
      if(input)input.value='';
    }
    renderWitnesses(null);
    pipeline();
    message('');
    return inspectionGeneration;
  }
  function pipeline(){const root=el('pipeline');clear(root);STAGES.forEach((name,i)=>{
    const b=mk('button',stage===i?'active':'',name);b.type='button';b.prepend(mk('span','',String(i+1).padStart(2,'0')));
    b.disabled=i>Math.min(stage+1,STAGES.length-1);b.title='Operator classification only; never a release authorization';
    b.onclick=()=>{stage=i;pipeline()};root.append(b)
  })}
  const WITNESSES=[
    ['Current run','run'],['Runner startup','runner'],['Failure log','logs'],
    ['Live main + merge-base','ancestry'],['Exact-head E2E','e2e'],
    ['Cloudflare deploy identity','deploy'],['Production browser screenshot','browser'],
    ['Independent review','review']
  ];
  function renderWitnesses(d){
    const root=el('witness-grid');clear(root);
    const observed=d?.releaseProof?.witnesses;
    for(const [name,key] of WITNESSES){
      const source=observed && typeof observed==='object' ? observed[key] : null;
      const identity=typeof source?.subjectSha==='string' ? source.subjectSha : null;
      const moved=d && (d.live?.headMatches!==true || d.live?.baseMatches!==true);
      const status=source?.status==='STALE' || (identity && (identity!==d?.exact?.headSha || moved)) ? 'STALE' :
        source?.status==='PASS' && identity && identity===d?.exact?.headSha && !moved ? 'PASS' :
        source?.status==='FAIL' || source?.status==='BLOCKED' ? 'BLOCKED' : 'UNKNOWN';
      const row=mk('div','witness'),top=mk('div','witness-top');
      top.append(mk('strong','',name),mk('b',status.toLowerCase(),status));
      row.append(top,mk('small','',status==='UNKNOWN'?'No authoritative evidence supplied':(source?.observedAt||'Observation time unknown')));
      if(identity)row.append(mk('code','',identity));
      if(typeof source?.url==='string'){
        try{const u=new URL(source.url);
          if(u.protocol==='https:' && ['github.com','www.foundercontrolroom.org','foundercontrolroom.org'].includes(u.hostname)){
            const a=mk('a','','Inspect source ↗');a.href=u.toString();a.target='_blank';a.rel='noopener noreferrer';row.append(a);
          }
        }catch{}
      }
      root.append(row);
    }
  }
  function renderRegistry(){const menu=el('project-nav'),select=el('project');clear(menu);clear(select);for(const p of projects){
    const item=mk('button',p.id===selected?'chosen':'',p.name);item.type='button';item.disabled=!p.repository;
    item.onclick=()=>{selected=p.id;select.value=p.id;reset();renderRegistry();message('Enter a PR number to inspect.')};menu.append(item);
    const opt=mk('option','',p.name);opt.value=p.id;opt.disabled=!p.repository;select.append(opt)
  }if(selected)select.value=selected}
  function render(d){
    inspected=d;el('detail').hidden=false;
    el('identity').textContent=d.project.name+' / PR #'+d.pullRequest
      +(d.pr?.draft?' / DRAFT':'')+(d.pr?.state==='closed'?' / CLOSED':'');
    renderWitnesses(d);
    const sha=el('sha');clear(sha);sha.append(cell('BASE SHA',d.exact.baseSha),cell('HEAD SHA',d.exact.headSha),cell('LIVE BASE',d.live.currentBaseSha),cell('LIVE HEAD',d.live.currentHeadSha));
    const counts=el('counts');clear(counts);counts.append(count('FAILING',d.counts.failing),count('QUEUED',d.counts.queued),count('CANCELLED',d.counts.cancelled),count('DUPLICATES',d.counts.duplicate));
    const checks=el('checks');clear(checks);if(!d.checks.length)checks.append(mk('p','unknown','No check evidence. Unknown is not green.'));
    for(const c of d.checks){const row=mk('div','check'),left=mk('div'),right=mk('div');left.append(mk('b','',c.name),mk('small','',c.observedAt||'Time unverified'));right.append(mk('strong',c.status,c.status));
      try{const url=new URL(c.url);if(url.protocol==='https:'&&url.host==='github.com'){const a=mk('a','','↗');a.href=url.toString();a.target='_blank';a.rel='noopener noreferrer';right.append(a)}}catch{}
      row.append(left,right);checks.append(row)}
    const gates=el('gates');clear(gates);for(const [k,v] of [['GitHub checks',d.gate.observedChecksPassed?'PASS (PARTIAL)':'BLOCKED'],['Required rulesets','UNKNOWN'],['FCR founder approval','NOT GRANTED'],['Cloudflare production','UNKNOWN'],['Supabase / runtime','UNKNOWN']]){
      const row=mk('div','gate');row.append(mk('span','',k),mk('b','',v));gates.append(row)}
    el('next').textContent=d.nextReversibleFix;const bs=el('blockers');clear(bs);for(const b of d.blockers)bs.append(mk('li','',b));
    el('source').textContent=d.evidenceStatus==='partial_current'?'PARTIAL':d.live?.headMatches===false||d.live?.baseMatches===false?'STALE':'UNKNOWN';
    message('Observed '+new Date(d.observedAt).toLocaleString()+'. Release authority remains blocked.');
  }
  function records(){const root=el('fields');for(const name of FIELDS){const box=mk('div'),label=mk('label','',name),area=mk('textarea');area.id='n-'+name.replaceAll(' ','_');label.htmlFor=area.id;area.rows=3;area.maxLength=2500;area.placeholder='Verified / inferred / unknown';area.oninput=()=>{note[name]=area.value};box.append(label,area);root.append(box)}
    el('record').onsubmit=e=>{e.preventDefault();const payload={contract:'fcr/cockpit-operator-handoff@v1',authority:'none',evidenceClassification:'operator_only',observedAt:inspected?.observedAt||null,project:inspected?.project||null,exact:inspected?.exact||null,stage:STAGES[stage],releaseWitnesses:inspected?.releaseProof?.witnesses||null,notes:note};
      const object=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
      const a=mk('a');a.href=object;a.download='fcr-exact-head-record.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);message('Local handoff exported. This is not a verified FCR receipt.')}}
  async function boot(){pipeline();records();try{
      await get('/auth/me');const data=await get('/integration-cockpit/projects');
      if(!Array.isArray(data.projects)||data.projects.length!==9)throw new Error('Registry incomplete');
      projects=data.projects;selected=projects.find(p=>p.repository)?.id||null;
      el('access').hidden=true;el('private').hidden=false;renderRegistry();
      el('project').onchange=()=>{selected=el('project').value;reset();renderRegistry();message('Target changed. Refresh exact-head evidence.')};
      el('inspect').onsubmit=async e=>{
        e.preventDefault();
        const id=el('project').value,n=Number(el('pr').value);
        if(!Number.isSafeInteger(n)||n<=0||n>10000000)return message('Valid PR number required.');
        const requestedRepository=projects.find(p=>p.id===id)?.repository;
        const token=reset();
        el('go').disabled=true;
        message('Reading current GitHub evidence...');
        try{
          const data=await get('/integration-cockpit/inspect/'+encodeURIComponent(id)+'/'+n);
          if(token!==inspectionGeneration||selected!==id)return;
          if(data?.project?.id!==id||data?.project?.repository!==requestedRepository||data?.pullRequest!==n)
            throw new Error('Inspection response does not match the selected PR');
          render(data);
        }catch(error){
          if(token!==inspectionGeneration||selected!==id)return;
          reset();
          message(error.message+'. Merge and deployment remain blocked.');
        }finally{
          if(token===inspectionGeneration)el('go').disabled=false;
        }
      }
    }catch(error){const root=el('access');clear(root);root.append(mk('h2','',error.status===401?'Sign in to Founder Control Room':'Private evidence unavailable'),mk('p','','Private project and engineering data remain hidden until the existing founder session is verified.'));const a=mk('a','','Open FCR sign-in →');a.href='/control-room/';root.append(a)}}
  boot();
})();