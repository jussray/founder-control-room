import { Router, type Response } from 'express';

export const onboardingRouter = Router();

const CONTROL_ROOM_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Founder Control Room</title>
  <link rel="stylesheet" href="/assets/control-room.css">
  <script type="module" src="/assets/control-room.js"></script>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Portfolio command layer</p>
        <h1>Founder Control Room</h1>
        <p>One founder identity. Exact-head evidence. No approval drift.</p>
      </div>
      <span id="system-status" class="status pending">Checking system</span>
    </header>
    <section id="signed-out" class="panel auth" hidden>
      <div>
        <p class="eyebrow">Founder onboarding</p>
        <h2>Sign in with the allowlisted email</h2>
        <p>A one-time Supabase link returns here and creates a secure browser session.</p>
      </div>
      <form id="login-form">
        <label for="email">Founder email</label>
        <input id="email" name="email" type="email" autocomplete="email" required placeholder="founder@example.com">
        <button id="login-button" type="submit">Send secure login link</button>
      </form>
    </section>
    <section id="signed-in" hidden>
      <div class="panel identity">
        <div>
          <p class="eyebrow">Authenticated founder</p>
          <h2 id="founder-email">Founder</h2>
          <p>Verified by Supabase Auth and the private founder allowlist.</p>
        </div>
        <button id="logout-button" class="secondary" type="button">Sign out</button>
      </div>
      <div class="grid">
        <a class="card" href="/health"><small>Runtime</small><strong>Health</strong><span>Confirm the API is responding.</span></a>
        <a class="card" href="/projects/founder-control-room"><small>Registry</small><strong>Control Room</strong><span>Read the live repository state.</span></a>
        <a class="card" href="/terminal/founder-control-room/commands"><small>Verification</small><strong>Approved commands</strong><span>Inspect the guarded allowlist.</span></a>
      </div>
      <section class="panel truth">
        <p class="eyebrow">Authority boundary</p>
        <h2>Login authorizes access, not execution.</h2>
        <p>Merge, deploy, migration, spending, external communication, and destructive writes remain separate gates.</p>
      </section>
    </section>
    <p id="notice" class="notice" role="status" aria-live="polite"></p>
  </main>
</body>
</html>`;

const CALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Completing founder login</title>
  <link rel="stylesheet" href="/assets/control-room.css">
  <script type="module" src="/assets/auth-callback.js"></script>
</head>
<body>
  <main class="shell callback">
    <section class="panel">
      <p class="eyebrow">Founder authentication</p>
      <h1 id="callback-title">Completing secure login</h1>
      <p id="callback-message">Verifying the one-time session and clearing credentials from the URL.</p>
      <a id="callback-return" href="/" hidden>Return to Founder Control Room</a>
    </section>
  </main>
</body>
</html>`;

const CSS = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f5f7fb;background:#070b14;color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#070b14}button,input{font:inherit}.shell{width:min(1080px,calc(100% - 32px));margin:auto;padding:48px 0 72px}.callback{width:min(680px,calc(100% - 32px));padding-top:14vh}.masthead,.identity{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.masthead{margin-bottom:28px}h1,h2,p{margin-top:0}h1{font-size:clamp(2.2rem,6vw,4.5rem);letter-spacing:-.055em;line-height:.96;margin-bottom:14px}p,.card span{color:#aeb8cb;line-height:1.65}.eyebrow,.card small{color:#84aaff;text-transform:uppercase;letter-spacing:.13em;font-size:.72rem;font-weight:800}.panel{border:1px solid #96abd32d;background:#0f1626cc;border-radius:24px;padding:clamp(22px,4vw,38px)}.auth{display:grid;grid-template-columns:1.1fr .9fr;gap:30px}form{display:grid;gap:12px}label{font-weight:750}input{border:1px solid #2b3a58;border-radius:14px;padding:14px 16px;background:#0a1020;color:#fff}button{border:0;border-radius:14px;padding:14px 18px;background:#8db1ff;color:#071024;font-weight:850;cursor:pointer}button.secondary{background:#18233a;color:#edf2ff;border:1px solid #304263}button:disabled{opacity:.62;cursor:wait}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:18px 0}.card{display:grid;gap:9px;min-height:160px;padding:24px;text-decoration:none;color:#eef3ff;border-radius:20px;border:1px solid #25334f;background:#0d1425}.notice{min-height:28px;margin:18px 4px 0}.status{border-radius:999px;padding:9px 12px;font-size:.78rem;font-weight:800;white-space:nowrap}.pending{background:#172137}.ok{background:#123323;color:#a8f0c6}.error{background:#421c24;color:#ffc0c0}[hidden]{display:none!important}@media(max-width:760px){.masthead,.identity{flex-direction:column}.auth,.grid{grid-template-columns:1fr}.identity button{width:100%}}`;

const CONTROL_ROOM_JS = `const id=(v)=>document.getElementById(v);const out=id('signed-out'),inside=id('signed-in'),notice=id('notice'),status=id('system-status'),form=id('login-form'),login=id('login-button'),logout=id('logout-button');const say=(text,bad=false)=>{notice.textContent=text;notice.style.color=bad?'#ffc0c0':'#c5d3ef'};async function health(){try{const r=await fetch('/health',{cache:'no-store'});if(!r.ok)throw new Error();status.textContent='System online';status.className='status ok'}catch{status.textContent='System unavailable';status.className='status error'}}async function session(){const r=await fetch('/auth/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok){out.hidden=false;inside.hidden=true;return}const data=await r.json();id('founder-email').textContent=data.founder.email;out.hidden=true;inside.hidden=false}form.addEventListener('submit',async(e)=>{e.preventDefault();login.disabled=true;say('Requesting a one-time founder link…');try{const email=new FormData(form).get('email');const r=await fetch('/auth/magic-link',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to request login link');say(data.message);form.reset()}catch(error){say(error instanceof Error?error.message:'Unable to request login link',true)}finally{login.disabled=false}});logout.addEventListener('click',async()=>{logout.disabled=true;await fetch('/auth/logout',{method:'POST',credentials:'same-origin'});location.replace('/')});await Promise.all([health(),session()]);`;

const CALLBACK_JS = `const title=document.getElementById('callback-title'),message=document.getElementById('callback-message'),back=document.getElementById('callback-return');function fail(text){title.textContent='Login could not be completed';message.textContent=text;back.hidden=false;history.replaceState(null,'','/auth/callback')}const query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1)),description=query.get('error_description')||fragment.get('error_description');if(description){fail(description)}else{const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');if(!access||!refresh){fail('The one-time link is missing session credentials or has expired. Request a new link.')}else{try{const response=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({access_token:access,refresh_token:refresh})});const data=await response.json();history.replaceState(null,'','/auth/callback');if(!response.ok)throw new Error(data.error||'Session verification failed');location.replace('/')}catch(error){fail(error instanceof Error?error.message:'Session verification failed')}}}`;

function sendAsset(res: Response, type: string, body: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

onboardingRouter.get('/', (_req, res) => sendAsset(res, 'text/html; charset=utf-8', CONTROL_ROOM_HTML));
onboardingRouter.get('/assets/control-room.css', (_req, res) => sendAsset(res, 'text/css; charset=utf-8', CSS));
onboardingRouter.get('/assets/control-room.js', (_req, res) => sendAsset(res, 'text/javascript; charset=utf-8', CONTROL_ROOM_JS));
onboardingRouter.get('/assets/auth-callback.js', (_req, res) => sendAsset(res, 'text/javascript; charset=utf-8', CALLBACK_JS));

export function founderCallbackHtml(): string {
  return CALLBACK_HTML;
}
