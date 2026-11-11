
'use strict';
// Public program facts only. No applicant documents or account details are bundled here.
// Founder session is checked before displaying the workspace. Checklist flags are tab-session only.
const REVIEWED_AT = '2026-11-11';
const CEA_GUIDELINES = 'https://www.pa.gov/content/dam/copapwp-pagov/en/coa/documents/2026-2027%20creative%20entrepreneur%20accelerator%20application%20guidelines%20(pdf).pdf';
const PROGRAMS = [
  {
    id:'cea-growth', name:'Creative Entrepreneur Accelerator · Growth', lane:'grants', type:'Non-dilutive grant',
    amount:'Up to $4,000', deadline:'Dec 31, 2026 · 9 p.m. ET', window:'OPEN · CONFIRMED',
    open:true, label:'2026–27 cycle', source:CEA_GUIDELINES, agency:'PA Creative Industries / Bridgeway Capital',
    summary:'Funding for creative-business sustainability and market expansion, not a general grant for any AI startup.',
    eligibility:'Applicant at least 18, PA resident and operating a PA creative business for at least one year; annual business revenue $10,000–$2,000,000; tax documentation; creative authorship must qualify. 2025–26 grant recipients and unresolved non-current prior grantees are ineligible for this cycle.',
    cea:'UNKNOWN · revenue, tenure and creative-fit evidence needed', kiz:'NOT A PREREQUISITE',
    materials:['Confirm 18+ age eligibility and creative business type','Check prior CEA grant history and non-current restrictions','Confirm business type and original creative output','Locate business start date and PA operating proof','Confirm annual revenue range with tax records','Outline creative-business growth goal, narrative and project budget','Start at Keystone Creatives; review the linked Blackbaud screener and official terms'],
    facts:[['VERIFIED','2026–27 Growth tier has a $10k–$2m revenue band; up to $4k.'],['VERIFIED','Application closes December 31, 2026, 9 p.m. ET.'],['UNKNOWN','Juss & Co. business revenue, age, creative-sector acceptance and tax documentation are not established.']],
    proof:'Current 2026–27 application guidelines, pp. 1, 5, 6, 8–9. Older 2025–26 CEA summaries are not controlling.',
    next:'Privately confirm revenue band, one-year business history and creative industry fit against the 2026–27 guidelines.',
    risk:'A creative game/design component does not automatically make a broader AI/software business eligible.',
    materialNote:'Tax returns, W-9 and bank details may be required after selection; this site does not collect them.'
  },
  {
    id:'cea-impact',name:'Creative Entrepreneur Accelerator · Impact',lane:'grants',type:'Non-dilutive grant',
    amount:'Up to $17,000',deadline:'Dec 31, 2026 · 9 p.m. ET',window:'OPEN · CONFIRMED',
    open:true,label:'2026–27 cycle',source:CEA_GUIDELINES,agency:'PA Creative Industries / Bridgeway Capital',
    summary:'Competitive funding for established creative businesses pursuing sustainability plus measurable community benefit.',
    eligibility:'Applicant at least 18, PA residency and creative business operation at least one year; annual business revenue $50,000–$2,000,000 with tax documentation; community impact rationale. 2025–26 grantees and unresolved non-current prior recipients are ineligible this cycle.',
    cea:'UNKNOWN · $50k revenue and impact evidence needed',kiz:'NOT A PREREQUISITE',
    materials:['Confirm 18+ age eligibility','Check prior CEA grant history and non-current restrictions','Verify annual creative-business revenue and operating history','Map a concrete community-impact project','Prepare budget and narrative about proposed use','Read peer-cohort and coaching commitments','Start at Keystone Creatives, then review the linked Blackbaud eligibility screener'],
    facts:[['VERIFIED','Impact tier up to $17k; annual revenue $50k–$2m.'],['VERIFIED','Deadline December 31, 2026, 9 p.m. ET.'],['UNKNOWN','Applicant’s revenue, eligible creative activity and cohort capacity are unverified.']],
    proof:'Current 2026–27 CEA guidelines, pp. 1, 4, 6, 8–9.',
    next:'Check the $50k revenue floor and whether the software or game project can demonstrate the required creative/community impact.',
    risk:'Higher award does not imply higher likelihood; award and cohort obligations are conditional.',
    materialNote:'Selection later requires tax documentation, agreement, coaching/cohort steps, W-9 and direct-deposit documents; do not store them here.'
  },
  {
    id:'kiz',name:'Keystone Innovation Zone · Tax Credit',lane:'grants',type:'Tax incentive · non-grant',
    amount:'Up to $100,000 / year',deadline:'Dec 1 annually · 2026 materials published',window:'DEADLINE PUBLISHED',
    open:false,label:'Location-based gate',source:'https://dced.pa.gov/programs/keystone-innovation-zone-tax-credit-program/',agency:'PA Department of Community & Economic Development',
    summary:'Potential Pennsylvania tax credit for young technology businesses operating inside a designated KIZ.',
    eligibility:'For-profit business under eight years old, inside the precise boundary of an eligible KIZ, in its targeted industry, with qualifying preceding-year revenue growth.',
    cea:'NOT A PREREQUISITE',kiz:'UNKNOWN · precise site, zone sector and revenue history needed',
    materials:['Verify actual business operating address within an official KIZ boundary','Confirm KIZ coordinator and targeted sector','Document founding date and eligible operating history','Review 2026 KIZ worksheet(s) and coordinator certification','Review taxable-year revenue figures, tax-clearance and required forms'],
    facts:[['VERIFIED','DCED publishes December 1 annual deadline and 2026 forms.'],['VERIFIED','KIZ requires physical zone location, industry match and business age under eight years.'],['UNKNOWN','Applicant location, coordinator qualification and credit calculation are unverified.']],
    proof:'DCED KIZ Tax Credit Program page, Eligibility, Funding, How to Apply and 2026 Forms.',
    next:'Check the business operating location against the official KIZ map and coordinator before estimating any tax credit.',
    risk:'A mailing address or tech product does not satisfy the KIZ geographic gate; check any earlier coordinator-specific deadlines.',
    materialNote:'Credit value depends on revenue growth. Never treat the $100,000 cap as an expected award.'
  },
  {
    id:'contracts',name:'PA eMarketplace · Technology solicitations',lane:'contracts',type:'Paid contract discovery',
    amount:'Solicitation-specific',deadline:'UNKNOWN · per posted solicitation',window:'DISCOVERY CHANNEL',
    open:false,label:'State procurement',source:'https://www.pa.gov/agencies/dgs/doing-business-with-the-commonwealth/business-inclusion-and-supplier-development/finding-opportunities',agency:'PA Department of General Services',
    summary:'Official procurement source for state-agency solicitations, including professional services and potential technology work.',
    eligibility:'Requirements depend on a specific procurement. Supplier registration, scope, insurance, certifications and proposal rules must be verified individually.',
    cea:'NOT A PREREQUISITE',kiz:'NOT A PREREQUISITE',
    materials:['Identify one live, relevant AI/software solicitation','Record solicitation ID and submission deadline','Check vendor registration requirements','Read mandatory proposal attachments and terms','Compare scope and staffing against existing product capability'],
    facts:[['VERIFIED','DGS directs vendors to eMarketplace for most state-agency solicitations.'],['UNKNOWN','No exact live bid, due date, contract value or Juss & Co. eligibility confirmed.']],
    proof:'PA DGS Find Opportunities and Supplier Service Center pages.',
    next:'Find one current software/AI scope and save its official solicitation ID before preparing a bid.',
    risk:'A procurement search channel is not a paid pilot, contract award or currently open bid.',
    materialNote:'Scope, deadlines and bid materials cannot be known until an actual solicitation is identified.'
  },
  {
    id:'apex',name:'APEX Accelerators · Contract readiness',lane:'contracts',type:'Government contracting support',
    amount:'Advisory support · not a grant',deadline:'UNKNOWN · local intake',window:'SUPPORT CHANNEL',
    open:false,label:'Procurement assistance',source:'https://hub.business.pa.gov/Home/QuickAction/9bdd5099-eeb5-4a40-820e-8531020c2e95',agency:'PA Business Hub',
    summary:'A route to contracting assistance for businesses considering federal, Pennsylvania or local procurement.',
    eligibility:'Specific advisor coverage, intake and services depend on the assigned APEX Accelerator.',
    cea:'NOT A PREREQUISITE',kiz:'NOT A PREREQUISITE',
    materials:['Identify the APEX advisor for the business region','List existing AI/software service capabilities','Note vendor-registration blockers','Define one contract-fit question for review'],
    facts:[['VERIFIED','PA Business Hub directs prospective contractors to APEX Accelerators.'],['UNKNOWN','Current local intake, advisor assignment and readiness remain unverified.']],
    proof:'PA Business Hub Government Contracting Assistance resource.',
    next:'Identify the appropriate APEX region and review its published intake process without contacting anyone.',
    risk:'Advisory eligibility and resulting contract opportunities are not guaranteed.',
    materialNote:'No outreach or advisor meeting will be initiated from this workspace.'
  },
  {
    id:'alphalab',name:'AlphaLab · 2027 Startup Cohort',lane:'partners',type:'Accelerator + potential investment',
    amount:'Up to $100,000 investment',deadline:'Jul 17, 2026 · passed',window:'2027 COHORT · CLOSED',
    open:false,label:'AI/software startup fit',source:'https://www.innovationworks.org/about/news/alphalab-opens-application-window-for-2027-cohort/',agency:'Innovation Works / AlphaLab',
    summary:'Pittsburgh-based accelerator emphasizing software and AI-native founders, customer acquisition and fundraising preparation.',
    eligibility:'Startup and cohort residency, stage, attendance, founder eligibility and current application timing need confirmation in current terms.',
    cea:'NOT A PREREQUISITE',kiz:'NOT A PREREQUISITE',
    materials:['Check whether a new cohort cycle has been announced; 2027 intake closed Jul 17, 2026','Review location and participation requirements','Select one existing product for fit evaluation','Prepare existing product demo and market evidence inventory','Check equity/investment terms before any commitment'],
    facts:[['VERIFIED','Innovation Works announced the 2027 application window on April 20, 2026.'],['VERIFIED','Announcement describes up to $100k in investment, not grant funding.'],['VERIFIED','2027 cohort application deadline was July 17, 2026 and has passed.'],['UNKNOWN','Future intake dates and applicant fit have not been established.']],
    proof:'Innovation Works 2027 cohort launch announcement, April 20, 2026.',
    next:'Watch for an officially announced future AlphaLab cohort; the 2027 deadline has passed. Review participation and investment terms only when new intake opens.',
    risk:'Investment terms, equity dilution and travel obligations must be reviewed before any application.',
    materialNote:'No acceptance, funding or open intake is inferred from the announcement alone.'
  },
  {
    id:'bftp',name:'Ben Franklin Technology Partners · Early-stage capital',lane:'capital',type:'Regional tech investment + mentorship',
    amount:'Terms vary by region',deadline:'UNKNOWN · regional process',window:'REGIONAL INTAKE',
    open:false,label:'Technology startups',source:'https://benfranklin.org/for-founders/',agency:'Ben Franklin Technology Partners',
    summary:'Pennsylvania’s regional technology-startup funding and commercialization network.',
    eligibility:'PA technology company, matching regional partner, company stage and investment criteria. Individual terms are regional.',
    cea:'NOT A PREREQUISITE',kiz:'NOT A PREREQUISITE',
    materials:['Confirm current registered operating region','Identify the corresponding Ben Franklin regional partner','Select existing AI/software product and proof of progress','Review current investment requirements and capital terms','Organize existing pitch deck and product evidence'],
    facts:[['VERIFIED','Statewide four-region network supports Pennsylvania tech startups.'],['UNKNOWN','Funding size, current intake, terms and Juss & Co. eligibility not established.']],
    proof:'Ben Franklin Technology Partners For Founders page.',
    next:'Identify the regional Ben Franklin partner and verify its current startup intake and terms.',
    risk:'Funding can involve investment or other financial obligations and is not automatically non-dilutive.',
    materialNote:'No speculative funding amount is attached to the applicant.'
  },
  {
    id:'ssbci',name:'PA-SSBCI · Loans and tech equity',lane:'capital',type:'State-backed financing network',
    amount:'Region- and administrator-specific',deadline:'UNKNOWN · administrator-specific',window:'FINANCING NETWORK',
    open:false,label:'Loan or equity',source:'https://dced.pa.gov/pa-state-small-business-credit-initiative-pa-ssbci/',agency:'PA Department of Community & Economic Development',
    summary:'Financing through regional administrators, including small-business lending and equity for technology companies.',
    eligibility:'Company region, finance need, existing-stage criteria, repayment or equity terms vary by program administrator.',
    cea:'NOT A PREREQUISITE',kiz:'NOT A PREREQUISITE',
    materials:['Select loan versus equity route for an existing product','Identify county program administrator','Review borrower or investor criteria','List documents required by that administrator','Evaluate repayment and ownership implications privately'],
    facts:[['VERIFIED','DCED lists regionally administered loans and equity routes under PA-SSBCI.'],['UNKNOWN','Terms, rate, specific available capital and applicant eligibility.']],
    proof:'DCED PA-SSBCI program and administrator pages.',
    next:'Use DCED’s county/financing-type lookup to locate the relevant program administrator and current terms.',
    risk:'No interest rate, award size or financing approval has been verified.',
    materialNote:'Never submit financial documents or approve loan terms from this screen.'
  },
  {
    id:'creative-loan',name:'Creative Business Loan Fund',lane:'capital',type:'Creative-sector loan',
    amount:'Few thousand to $250,000',deadline:'Rolling · lender-specific',window:'LOAN PROGRAM',
    open:false,label:'Creative businesses',source:'https://www.pa.gov/agencies/coa/funding/creative-business-loan-fund',agency:'PA Creative Industries',
    summary:'Affordable and flexible loan program for qualified Pennsylvania creative small businesses.',
    eligibility:'Creative-business qualification, lender service area, underwriting and proposed use; actual rates and availability must be verified.',
    cea:'RELATED SECTOR · not an eligibility prerequisite',kiz:'NOT A PREREQUISITE',
    materials:['Confirm business qualifies as creative','Identify lending partner for operating region','Review loan purposes and permitted uses','Verify up-to-date rate, collateral, terms and repayment','Evaluate fit for existing software/game product rather than AI Center property'],
    facts:[['VERIFIED','PA Creative Industries describes lending from a few thousand dollars to $250k.'],['VERIFIED','State grant calendar lists the loan program as rolling.'],['UNKNOWN','Borrower eligibility, exact rate, term and current lender capacity.']],
    proof:'PA Creative Industries Creative Business Loan Fund and Due Dates for Grants pages.',
    next:'Verify regional lending partner and current underwriting terms before considering finance applications.',
    risk:'Loan proceeds are repayable; website range is not an offer or approval.',
    materialNote:'No financing commitment or credit application can occur here.'
  }
];
const LANES = {grants:'Grants & non-dilutive',contracts:'Paid pilots & contracts',partners:'Accelerators & partnerships',capital:'Investment & financing'};
const stageOrder=['REVIEW','VERIFY','PREPARE'];
const stageNotes={
  REVIEW:'Scan the official program details. Listed does not mean eligible.',
  VERIFY:'Match every material eligibility claim to an official source and founder documents.',
  PREPARE:'Organize a private readiness checklist. Preparation does not authorize an application.'
};
let selected='cea-growth';
let activeTab='checklist';
let selectionFilter='all';
let searchValue='';
let sessionData={};
let sessionKey=null;
const root=document.getElementById('workspace');
const access=document.getElementById('access');
const list=document.getElementById('list');
const details=document.getElementById('details');
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
function getProgram(){return PROGRAMS.find(function(x){return x.id===selected;})||PROGRAMS[0];}
function state(id){return sessionData[id]||{checks:{},stage:'REVIEW'};}
function save(){
  try{if(sessionKey)sessionStorage.setItem(sessionKey,JSON.stringify(sessionData));}
  catch(_error){/* Read-only browsing remains available when storage is disabled. */}
}
function load(){
  try{
    const saved=JSON.parse(sessionKey?sessionStorage.getItem(sessionKey)||'{}':'{}');
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){sessionData=saved;}
  }catch(_error){sessionData={};}
}
function headline(){
  document.getElementById('total-count').textContent=String(PROGRAMS.length);
  document.getElementById('open-count').textContent=String(PROGRAMS.filter(function(p){return p.open;}).length);
}
function renderList(){
  const q=searchValue.toLowerCase().trim();
  const visible=PROGRAMS.filter(function(p){
    return (selectionFilter==='all'||p.lane===selectionFilter)&&
      (!q||(p.name+' '+p.type+' '+p.eligibility+' '+p.agency+' '+p.summary).toLowerCase().includes(q));
  });
  if(!visible.length){list.innerHTML='<div class="empty">No opportunities match that search. Try another funding lane.</div>';return;}
  list.innerHTML=visible.map(function(p,index){
    const saved=state(p.id);
    return '<button type="button" class="op-card '+(p.id===selected?'selected':'')+'" data-id="'+esc(p.id)+'" aria-pressed="'+String(p.id===selected)+'">'+
      '<div class="card-row"><div class="card-title">'+esc(p.name)+'</div><span class="amount">'+esc(p.amount)+'</span></div>'+
      '<div class="tagline">'+esc(p.summary)+'</div>'+
      '<div class="card-footer"><span class="chip">'+esc(LANES[p.lane])+'</span><span class="chip '+(p.open?'verified':'unknown')+'">'+esc(p.window)+'</span><span class="chip inferred">'+esc(saved.stage||'REVIEW')+'</span>'+
      '<span class="card-deadline">'+esc(p.deadline)+'</span></div></button>';
  }).join('');
}
function renderDetail(){
  const p=getProgram(),s=state(p.id);
  const known=typeof s.checks==='object'&&s.checks?s.checks:{};
  const complete=p.materials.filter(function(_x,i){return known[i]===true;}).length;
  const stage=stageOrder.includes(s.stage)?s.stage:'REVIEW';
  const pills=p.facts.map(function(f){
    return '<div class="fact"><strong class="'+(f[0]==='VERIFIED'?'good':f[0]==='INFERRED'?'purple':'warn')+'">'+esc(f[0])+'</strong><span>'+esc(f[1])+'</span></div>';
  }).join('');
  let body='';
  if(activeTab==='checklist'){
    body='<p class="step-hint">Private review flags only · '+complete+'/'+p.materials.length+' prepared · session-only, not saved to FCR records.</p>'+
      p.materials.map(function(m,i){
        const id='check-'+esc(p.id)+'-'+i;
        return '<div class="checkrow"><input type="checkbox" id="'+id+'" data-check="'+i+'" '+(known[i]?'checked':'')+'><label for="'+id+'"><span>'+esc(m)+'</span><small>A check mark means reviewed/prepared, not verified eligibility.</small></label></div>';
      }).join('')+
      '<div class="eyebrow" style="margin-top:20px">REVIEW → VERIFY → PREPARE → APPLY</div>'+
      '<div class="stage-flow">'+stageOrder.map(function(v){return '<button type="button" class="stage '+(v===stage?'active':'')+'" data-stage="'+v+'" aria-pressed="'+String(v===stage)+'">'+v+'</button>';}).join('')+
      '<button type="button" class="stage locked" disabled title="Applications require separate authorization">APPLY 🔒</button></div>'+
      '<p class="step-hint">'+esc(stageNotes[stage])+'</p>';
  }else if(activeTab==='evidence'){
    body='<p class="step-hint">Official observations as of '+esc(REVIEWED_AT)+'. Source-backed program rules do not prove applicant eligibility.</p>'+
      '<div class="facts">'+pills+'</div>'+
      '<div class="eyebrow" style="margin-top:14px">SOURCE PROVENANCE</div>'+
      '<p class="summary">'+esc(p.proof)+'</p>'+
      '<a class="source-link" href="'+esc(p.source)+'" target="_blank" rel="noopener noreferrer">Open official evidence ↗</a>'+
      '<p class="step-hint">Estimated award or eligibility: none. Recheck before any decision. Source changes and deadlines can invalidate this review.</p>';
  }else{
    const receipt={
      REALITY:p.open?'Program application window confirmed at review time; applicant eligibility UNKNOWN.':'Official program or discovery route confirmed; current intake and applicant eligibility UNKNOWN.',
      FIX:'Investigate the exact gate, rather than marking this company eligible without proof.',
      PROOF:p.proof,
      RISK:p.risk,
      ROLLBACK:'Undo session-only checklist or stage flags. No external state, filing, money or commitment was changed.',
      'NEXT GATE':p.next
    };
    body='<p class="step-hint">Local review receipt · state '+esc(stage)+' · no execution authority.</p><div class="receipt">'+
      Object.entries(receipt).map(function(entry){return '<div class="receipt-item"><strong>'+esc(entry[0])+'</strong><span>'+esc(entry[1])+'</span></div>';}).join('')+'</div>';
  }
  details.innerHTML=
    '<div class="details-head"><span class="eyebrow">OPPORTUNITY / '+esc(p.id.toUpperCase())+'</span><span class="chip">'+esc(p.label)+'</span></div>'+
    '<h3>'+esc(p.name)+'</h3><p class="summary">'+esc(p.eligibility)+'</p>'+
    '<div class="detail-meta"><div><span class="meta-label">Program type</span><span class="meta-value">'+esc(p.type)+'</span></div><div><span class="meta-label">Deadline</span><span class="meta-value">'+esc(p.deadline)+'</span></div>'+
    '<div><span class="meta-label">Administrator</span><span class="meta-value">'+esc(p.agency)+'</span></div><div><span class="meta-label">Application readiness</span><span class="meta-value">UNKNOWN · '+complete+'/'+p.materials.length+' flags prepared</span></div></div>'+
    '<hr class="divider"><div class="eyebrow">ELIGIBILITY GATES</div>'+
    '<div class="gate"><strong>Creative Entrepreneur Accelerator</strong><span class="'+(p.cea.includes('NOT A')?'na':'')+'">'+esc(p.cea)+'</span></div>'+
    '<div class="gate"><strong>Keystone Innovation Zone</strong><span class="'+(p.kiz.includes('NOT A')?'na':'')+'">'+esc(p.kiz)+'</span></div>'+
    '<p class="action-note"><strong>Smallest useful next step:</strong> '+esc(p.next)+'</p>'+
    '<a class="source-link" href="'+esc(p.source)+'" target="_blank" rel="noopener noreferrer">Official program source ↗</a>'+
    '<hr class="divider"><div class="tabs" role="tablist" aria-label="Selected opportunity sections">'+
    [['checklist','Private checklist'],['evidence','Evidence'],['receipt','Decision record']].map(function(t){return '<button type="button" role="tab" class="tab" aria-selected="'+String(activeTab===t[0])+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>'+
    '<div id="tab-content" role="tabpanel">'+body+'</div>'+
    '<hr class="divider"><p class="step-hint">'+esc(p.materialNote)+'</p>';
}
function refresh(){headline();renderList();renderDetail();}
async function start(){
  let response;
  try{response=await fetch('/auth/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});}
  catch(_error){response=null;}
  let identity=null;
  if(response&&response.ok){
    try{const payload=await response.json();const data=payload&&payload.success===true?payload.data:payload;identity=data&&data.founder&&typeof data.founder.email==='string'&&data.founder.email.trim()?data.founder.email.trim():null;}catch(_error){identity=null;}
  }
  if(!identity){
    try{sessionStorage.removeItem('juss-pa-funding-2026-session');}catch(_error){}
    access.innerHTML='<div class="access-denied"><p class="eyebrow">FOUNDER-ONLY WORKSPACE</p><h2>Founder session required.</h2><p>Funding preparation records stay behind the existing Founder Control Room session. No program list or private checklist is displayed until sign-in.</p><a href="/control-room/">Return to Founder Control Room ↗</a></div>';
    root.hidden=true;return;
  }
  sessionKey='juss-pa-funding-2026-session:'+encodeURIComponent(identity.toLowerCase());
  load();
  access.hidden=true;root.hidden=false;
  refresh();
  const query=document.getElementById('query');
  query.addEventListener('input',function(e){searchValue=e.target.value;renderList();});
  document.getElementById('lane-filter').addEventListener('change',function(e){selectionFilter=e.target.value;renderList();});
  list.addEventListener('click',function(e){
    const btn=e.target.closest('button[data-id]');if(!btn)return;
    selected=btn.getAttribute('data-id');activeTab='checklist';refresh();
    if(window.matchMedia('(max-width: 950px)').matches)details.scrollIntoView({behavior:'smooth',block:'start'});
  });
  details.addEventListener('click',function(e){
    const tab=e.target.closest('button[data-tab]');
    if(tab){activeTab=tab.getAttribute('data-tab');renderDetail();return;}
    const stageBtn=e.target.closest('button[data-stage]');
    if(stageBtn){
      const stage=stageBtn.getAttribute('data-stage');
      if(!stageOrder.includes(stage))return;
      const current=state(selected);
      sessionData[selected]={checks:current.checks||{},stage:stage};
      save();refresh();
    }
  });
  details.addEventListener('change',function(e){
    if(!e.target.matches('input[type=checkbox][data-check]'))return;
    const i=Number(e.target.getAttribute('data-check'));
    if(!Number.isInteger(i)||i<0||i>=getProgram().materials.length)return;
    const current=state(selected);
    const checks=Object.assign({},current.checks||{});
    checks[i]=e.target.checked;
    sessionData[selected]={checks:checks,stage:stageOrder.includes(current.stage)?current.stage:'REVIEW'};
    save();renderDetail();renderList();
  });
}
void start();
