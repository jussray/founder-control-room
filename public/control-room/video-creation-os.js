// FCR / ULTRATHINK Video Creation OS
// Standalone browser-safe planning layer. No render, spend, publish, merge, deploy, or truth authority.

export const VIDEO_CREATION_OS_CONTRACT = 'l99/video-creation-os@v1';
export const VIDEO_CREATION_HANDOFF_CONTRACT = 'fcr/video-creation-handoff@v1';

export const VIDEO_CREATION_OS = Object.freeze({
  contract: VIDEO_CREATION_OS_CONTRACT,
  workflow: 'LEEVIZE',
  formula: Object.freeze(['subject','scene','camera','angle','action','composition','effect','focus','color','lighting','output_intent']),
  stack: Object.freeze(['intent','story_beat','shot_design','visual_finish','continuity_check']),
  rules: Object.freeze([
    'One primary camera movement per shot.',
    'Choose angle before decorative effect.',
    'Effects support the story beat instead of hiding weak footage.',
    'Color and light communicate emotion without changing product truth.',
    'Preserve subject, world, geography and continuity across adjacent shots.'
  ]),
  categories: Object.freeze({
    camera: Object.freeze({ label:'Camera & Movement', commands:Object.freeze({
      '/pushin':'controlled move toward the subject','/pullback':'controlled reveal away from the subject','/followshot':'track with the moving subject','/orbit':'motivated arc around the subject','/dolly':'smooth physical tracking move','/handheld':'restrained natural handheld motion','/drone':'motivated aerial movement','/timelapse':'compress visible time progression'
    })}),
    angle: Object.freeze({ label:'Camera Angles', commands:Object.freeze({
      '/groundlevel':'low ground-level perspective','/birdseye':'high overhead perspective','/lowangle':'upward-looking perspective','/highangle':'downward-looking context','/overhead':'clean top-down composition','/dutchtilt':'intentional tilted horizon','/firstperson':'subjective first-person view','/shoulder':'over-the-shoulder view'
    })}),
    action: Object.freeze({ label:'Motion & Action', commands:Object.freeze({
      '/sprintmode':'high-energy motivated action','/strollmode':'relaxed natural movement','/spinreveal':'controlled rotating reveal','/slowmotion':'slow the decisive moment','/fastforward':'compress a passage of time','/timestop':'hold the peak story moment','/weightless':'gentle floating movement','/dropaction':'urgent downward movement'
    })}),
    composition: Object.freeze({ label:'Composition & Framing', commands:Object.freeze({
      '/fullscene':'show environmental context','/closecrop':'tight subject framing','/thirdgrid':'balanced thirds composition','/innerframe':'frame with scene elements','/leadinglines':'guide attention with geometry','/cleanframe':'minimal uncluttered frame','/symmetry':'intentional symmetrical balance','/negative':'use breathing room intentionally'
    })}),
    effect: Object.freeze({ label:'Camera Effects', commands:Object.freeze({
      '/speedblur':'motivated motion blur','/softbokeh':'soft defocused highlights','/sunflare':'restrained motivated flare','/edgefade':'subtle edge falloff','/duotone':'two-tone visual treatment','/filmgrain':'light film texture','/glitch':'brief story-motivated distortion','/prismsplit':'subtle prism color separation'
    })}),
    focus: Object.freeze({ label:'Focus & Depth', commands:Object.freeze({
      '/isolatefocus':'separate subject with controlled depth','/gazepoint':'prioritize eyes or a named gaze target','/rackfocus':'shift focus once between named planes','/shallowdof':'selective shallow depth','/deepfocus':'keep story planes readable','/macro':'show an extreme close detail','/tiltshift':'selective miniature-like focus','/focuspull':'motivated focus transition'
    })}),
    color: Object.freeze({ label:'Color Grading', commands:Object.freeze({
      '/amberlook':'warm amber-biased grade','/icylook':'cool clean grade','/coalteal':'dark neutral and teal contrast','/highcontrast':'bold controlled contrast','/mutedtone':'restrained low-saturation palette','/vibrant':'rich color with protected highlight detail','/noir':'monochrome dramatic treatment','/neonwash':'futuristic neon-biased palette'
    })}),
    portrait: Object.freeze({ label:'Portrait & Subject', commands:Object.freeze({
      '/heroportrait':'confident intentional hero framing','/glowskin':'natural flattering skin rendition','/halolight':'clean subject edge separation','/headtotoe':'show complete subject and stance','/candid':'natural unstaged body language','/overtheshoulder':'story-oriented shoulder perspective','/silhouette':'readable identity-preserving silhouette','/environmental':'portrait with meaningful context'
    })}),
    lighting: Object.freeze({ label:'Cinematic Lighting', commands:Object.freeze({
      '/rimlight':'motivated rim separation','/softwindow':'broad natural key light','/goldenhour':'warm low-angle natural light','/moonlight':'cool low-key night illumination','/neonlight':'motivated colored practical lighting','/backlight':'controlled depth-adding backlight','/lowkey':'shadow-forward dramatic lighting','/highkey':'bright clean low-ratio lighting'
    })})
  })
});

function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function record(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}

export function compileVideoCreationHandoff(input={}){
  const source=record(input);
  const rawSelections=record(source.selections);
  const unknown=Object.keys(rawSelections).filter(key=>!Object.hasOwn(VIDEO_CREATION_OS.categories,key));
  if(unknown.length) throw new Error(`Unsupported Video Creation OS categories: ${unknown.sort().join(', ')}.`);
  const selections=[];
  for(const [categoryId,category] of Object.entries(VIDEO_CREATION_OS.categories)){
    const raw=rawSelections[categoryId];
    if(raw===undefined||raw===null||raw==='') continue;
    if(Array.isArray(raw)) throw new Error(`Video Creation OS allows one ${categoryId} command per shot.`);
    const command=clean(raw).split(/\s+/,1)[0].toLowerCase();
    if(!Object.hasOwn(category.commands,command)) throw new Error(`Unsupported ${categoryId} command: ${command||'(empty)'}.`);
    selections.push(Object.freeze({category:categoryId,label:category.label,command,direction:category.commands[command]}));
  }
  const subject=clean(source.subject)||'story subject';
  const scene=clean(source.scene)||'current story beat';
  const outputIntent=clean(source.output_intent)||'continuity-safe cinematic founder story';
  const continuity=Array.isArray(source.continuity)?source.continuity.map(clean).filter(Boolean):[];
  const creatorLine=selections.length
    ? selections.map(item=>`${item.command} (${item.direction})`).join('; ')
    : 'inherit existing Shot DNA; add no decorative effect';
  const prompt=[
    `Subject: ${subject}.`,
    `Scene: ${scene}.`,
    `Creator selections: ${creatorLine}.`,
    continuity.length?`Continuity: ${continuity.join('; ')}.`:'Continuity: preserve established subject, world, geography and product state.',
    `Output intent: ${outputIntent}.`,
    'Preserve truth boundaries. One primary camera movement per shot.'
  ].join(' ');
  return Object.freeze({
    contract:VIDEO_CREATION_HANDOFF_CONTRACT,
    video_creation_os_contract:VIDEO_CREATION_OS_CONTRACT,
    workflow:'LEEVIZE',
    target:'story-engine/shot-dna@v1',
    subject,scene,output_intent:outputIntent,
    formula:VIDEO_CREATION_OS.formula,
    prompt_stack:VIDEO_CREATION_OS.stack,
    selections:Object.freeze(selections),
    continuity:Object.freeze(continuity),
    provider_neutral_prompt:prompt,
    authority:Object.freeze({plan:true,render:false,spend:false,publish:false,merge:false,deploy:false,truth_reclassification:false})
  });
}

function renderModules(root){
  for(const [id,category] of Object.entries(VIDEO_CREATION_OS.categories)){
    const card=document.createElement('label');
    card.className='os-module';
    card.innerHTML=`<span>${category.label}</span><select data-os-category="${id}" aria-label="${category.label}"><option value="">Inherit Shot DNA</option>${Object.entries(category.commands).map(([command,direction])=>`<option value="${command}">${command} · ${direction}</option>`).join('')}</select>`;
    root.append(card);
  }
}

function selectedFromDom(){
  return Object.fromEntries([...document.querySelectorAll('[data-os-category]')].map(select=>[select.dataset.osCategory,select.value]).filter(([,value])=>value));
}

function boot(){
  const root=document.querySelector('[data-video-creation-os]');
  if(!root) return;
  const modules=root.querySelector('[data-os-modules]');
  renderModules(modules);
  const compile=()=>{
    const handoff=compileVideoCreationHandoff({
      subject:root.querySelector('#osSubject').value,
      scene:root.querySelector('#osScene').value,
      output_intent:root.querySelector('#osIntent').value,
      continuity:root.querySelector('#osContinuity').value.split('\n'),
      selections:selectedFromDom()
    });
    root.querySelector('[data-os-chips]').innerHTML=handoff.selections.map(item=>`<span class="chip">${item.command}</span>`).join('')||'<span class="chip">inherit Shot DNA</span>';
    root.querySelector('[data-os-prompt]').textContent=handoff.provider_neutral_prompt;
    root.querySelector('[data-os-json]').textContent=JSON.stringify(handoff,null,2);
    root.dataset.compiled='true';
  };
  root.querySelector('[data-os-compile]').addEventListener('click',compile);
  root.querySelector('[data-os-reset]').addEventListener('click',()=>{root.querySelectorAll('[data-os-category]').forEach(select=>select.value='');compile();});
  root.querySelector('[data-os-copy]').addEventListener('click',async()=>{
    const text=root.querySelector('[data-os-json]').textContent;
    try{await navigator.clipboard.writeText(text);root.querySelector('[data-os-copy]').textContent='Copied handoff';}
    catch{root.querySelector('[data-os-copy]').textContent='Copy unavailable';}
  });
  compile();
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}
