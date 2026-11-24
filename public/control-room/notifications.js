const byId = id => document.getElementById(id);
const state=byId('state'), device=byId('device'), operation=byId('operation');
const enable=byId('enable'), disable=byId('disable'), test=byId('test');
let config, registration, busy=false;
const labels={workflow_passed:'Workflow passed',workflow_recovered:'Workflow recovered',pull_request_merged:'Pull request merged',deployment_succeeded:'Deployment succeeded'};
async function api(path, body) {
  const response=await fetch('/founder-notifications/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.status===401||response.status===403)throw new Error('Sign in again to continue.');
  if(!response.ok)throw new Error('Request unavailable ('+response.status+').');
  return response.json();
}
function link(value) {
  try { const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port?u.href:null; }catch{return null;}
}
async function feed(){
  const result=await api('feed');const list=byId('events');list.replaceChildren();
  for(const item of result.events||[]){
    const intent=item.intent||{};const row=document.createElement('li');
    const label=document.createElement('strong');label.textContent=(labels[intent.kind]||'Observed event')+' · '+(intent.repository||'Repository');row.append(label);
    const metadata=document.createElement('small');metadata.textContent=[intent.workflowName,intent.branch,intent.environment,intent.commitSha,item.occurredAt].filter(Boolean).join(' · ');row.append(metadata);
    const deliveries=(result.deliveries||[]).filter(d=>d.event_id===item.id);
    const receipt=document.createElement('small');receipt.textContent=deliveries.length?deliveries.map(d=>d.state==='provider_accepted'?'Provider accepted (device unverified)':d.state).join(', '):'No delivery receipt';row.append(receipt);
    const href=link(intent.evidenceUrl);if(href){const a=document.createElement('a');a.href=href;a.textContent='Open evidence';a.rel='noreferrer';row.append(a);}
    list.append(row);
  }
  if(!list.children.length){const li=document.createElement('li');li.textContent='No success receipts observed yet.';list.append(li);}
}
function decodeKey(key){const s=key.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function current(){return registration?.pushManager.getSubscription();}
async function buttons(){
  const subscription=await current();
  enable.disabled=busy||!config?.enabled||!registration||Notification.permission==='denied';
  test.disabled=busy||!config?.enabled||!subscription;
  disable.disabled=busy||!subscription;
  device.textContent=subscription?'Browser subscription exists. Use Send test to check provider acceptance.':config?.enabled?'No browser subscription on this device.':'Push is not enabled on the server.';
}
async function execute(action){
  if(busy)return;busy=true;enable.disabled=test.disabled=disable.disabled=true;operation.textContent='Processing…';
  try{await action();}catch(e){operation.textContent=e.message||'Request failed.';}finally{busy=false;await buttons();}
}
enable.addEventListener('click',()=>execute(async()=>{
  // The permission prompt must be initiated from the founder's own tap.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');
  const subscription=(await current())||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey)});
  await api('subscribe',subscription.toJSON());operation.textContent='Device registered. Send a test to check the delivery path.';
}));
test.addEventListener('click',()=>execute(async()=>{const subscription=await current();if(!subscription)throw new Error('Enable notifications first.');const result=await api('test',subscription.toJSON());operation.textContent=result.providerAccepted?'Provider accepted the test. Check your phone; display is not yet verified.':'Test not accepted.';}));
disable.addEventListener('click',()=>execute(async()=>{const subscription=await current();if(!subscription)return;await api('unsubscribe',subscription.toJSON());await subscription.unsubscribe();operation.textContent='Server subscription revoked.';}));
byId('refresh').addEventListener('click',()=>feed().catch(e=>{operation.textContent=e.message;}));
(async()=>{try{config=await api('config');byId('panel').hidden=false;state.textContent='Founder session verified.';await feed();if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){device.textContent='Web Push is unavailable. On iPhone, add this page to the Home Screen and open it from there.';return;}registration=await navigator.serviceWorker.register('/control-room/notifications-sw.js',{scope:'/control-room/'});await navigator.serviceWorker.ready;await buttons();}catch(e){state.textContent=e.message||'Founder notification service unavailable.';byId('signin').hidden=false;}})();
