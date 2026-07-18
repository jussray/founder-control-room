import { Router } from 'express';

export const onboardingRouter = Router();

const CONTROL_ROOM_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Founder Control Room</title>
  <link rel="stylesheet" href="/assets/control-room.css">
  <script src="/assets/control-room.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Portfolio command layer</p>
        <h1>Founder Control Room</h1>
        <p class="subhead">One founder identity. Exact-head evidence. No approval drift.</p>
      </div>
      <span id="system-status" class="status status-pending">Checking system</span>
    </header>

    <section id="signed-out" class="panel auth-panel" hidden>
      <div class="panel-copy">
        <p class="eyebrow">Founder onboarding</p>
        <h2>Enter the allowlisted founder email</h2>
        <p>A one-time Supabase magic link will bring you back here and establish a secure browser session.</p>
      </div>
      <form id="login-form" class="login-form">
        <label for="email">Founder email</label>
        <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required placeholder="founder@example.com">
        <button id="login-button" type="submit">Send secure login link</button>
      </form>
      <ol class="steps" aria-label="Login steps">
        <li><span>1</span> Enter the allowlisted email.</li>
        <li><span>2</span> Open the one-time link in that inbox.</li>
        <li><span>3</span> Return here with an HttpOnly founder session.</li>
      </ol>
    </section>

    <section id="signed-in" hidden>
      <div class="panel identity-panel">
        <div>
          <p class="eyebrow">Authenticated founder</p>
          <h2 id="founder-email">Founder</h2>
          <p>Session verified against Supabase Auth and the private founder allowlist.</p>
        </div>
        <button id="logout-button" class="secondary" type="button">Sign out</button>
      </div>

      <div class="grid">
        <a class="card" href="/health">
          <span class="card-kicker">Runtime</span>
          <strong>Health</strong>
          <small>Confirm the API is responding.</small>
        </a>
        <a class="card" href="/projects/founder-control-room">
          <span class="card-kicker">Registry</span>
          <strong>Founder Control Room</strong>
          <small>Read the live repository state.</small>
        </a>
        <a class="card" href="/terminal/founder-control-room/commands">
          <span class="card-kicker">Verification</span>
          <strong>Approved commands</strong>
          <small>Inspect the guarded terminal allowlist.</small>
        </a>
      </div>

      <section class="panel truth-panel">
        <p class="eyebrow">Authority boundary</p>
        <h2>Login authorizes access, not execution.</h2>
        <p>Merge, deployment, migration, spending, external communication, and destructive actions remain separate founder approval gates.</p>
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
  <script src="/assets/auth-callback.js" defer></script>
</head>
<body>
  <main class="shell callback-shell">
    <section class="panel auth-panel">
      <p class="eyebrow">Founder authentication</p>
      <h1 id="callback-title">Completing secure login</h1>
      <p id="callback-message">Verifying the one-time session and clearing credentials from the URL.</p>
      <a id="callback-return" href="/" hidden>Return to Founder Control Room</a>
    </section>
  </main>
</body>
</html>`;

const CONTROL_ROOM_CSS = `:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f5f7fb;
  background: #070b14;
  font-synthesis: none;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 8%, rgba(61, 124, 255, .18), transparent 34rem),
    radial-gradient(circle at 88% 12%, rgba(145, 90, 255, .12), transparent 30rem),
    #070b14;
}
button, input { font: inherit; }
button, .card { transition: transform .16s ease, border-color .16s ease, background .16s ease; }
button:focus-visible, input:focus-visible, .card:focus-visible, a:focus-visible {
  outline: 3px solid rgba(109, 157, 255, .65);
  outline-offset: 3px;
}
.shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
.callback-shell { width: min(680px, calc(100% - 32px)); padding-top: 14vh; }
.masthead { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 28px; }
h1, h2, p { margin-top: 0; }
h1 { font-size: clamp(2.1rem, 5vw, 4.25rem); letter-spacing: -.055em; line-height: .98; margin-bottom: 14px; }
h2 { font-size: clamp(1.4rem, 2.5vw, 2rem); letter-spacing: -.025em; margin-bottom: 10px; }
p { color: #aeb8cb; line-height: 1.65; }
.eyebrow, .card-kicker { color: #7fa6ff; text-transform: uppercase; letter-spacing: .13em; font-size: .72rem; font-weight: 800; }
.subhead { max-width: 620px; font-size: 1.05rem; }
.panel {
  border: 1px solid rgba(150, 171, 211, .18);
  background: rgba(15, 22, 38, .78);
  backdrop-filter: blur(18px);
  border-radius: 24px;
  padding: clamp(22px, 4vw, 38px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .28);
}
.auth-panel { display: grid; grid-template-columns: 1.15fr .85fr; gap: 32px; align-items: start; }
.login-form { display: grid; gap: 12px; }
label { color: #d9e1f0; font-weight: 700; }
input {
  width: 100%; border: 1px solid #2b3a58; border-radius: 14px; padding: 14px 16px;
  color: #fff; background: #0a1020;
}
button {
  border: 0; border-radius: 14px; padding: 14px 18px; cursor: pointer;
  color: #071024; background: #8db1ff; font-weight: 800;
}
button:hover { transform: translateY(-1px); background: #a5c2ff; }
button:disabled { cursor: wait; opacity: .62; transform: none; }
button.secondary { color: #edf2ff; background: #18233a; border: 1px solid #304263; }
.steps { grid-column: 1 / -1; display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; color: #aeb8cb; }
.steps li { display: flex; gap: 10px; align-items: center; }
.steps span { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: #172542; color: #8db1ff; font-weight: 800; }
.identity-panel { display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 18px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 18px; }
.card { display: grid; gap: 9px; min-height: 170px; padding: 24px; text-decoration: none; color: #eef3ff; border-radius: 20px; border: 1px solid #25334f; background: #0d1425; }
.card:hover { transform: translateY(-3px); border-color: #5278bd; background: #111b31; }
.card strong { font-size: 1.25rem; }
.card small { color: #97a5bc; line-height: 1.5; }
.truth-panel { border-color: rgba(237, 180, 71, .28); }
.notice { min-height: 28px; margin: 18px 4px 0; color: #c5d3ef; }
.status { display: inline-flex; align-items: center; border-radius: 999px; padding: 9px 12px; font-size: .78rem; font-weight: 800; white-space: nowrap; }
.status-pending { color: #c5d3ef; background: #172137; }
.status-ok { color: #a8f0c6; background: #123323; }
.status-error { color: #ffc0c0; background: #421c24; }
[hidden] { display: none !important; }
@media (max-width: 760px) {
  .shell { padding-top: 28px; }
  .masthead, .identity-panel { flex-direction: column; }
  .auth-panel, .grid { grid-template-columns: 1fr; }
  .identity-panel button { width: 100%; }
}
`;

const CONTROL_ROOM_JS = `const byId = (id) => document.getElementById(id);
const signedOut = byId('signed-out');
const signedIn = byId('signed-in');
const notice = byId('notice');
const systemStatus = byId('system-status');
const loginForm = byId('login-form');
const loginButton = byId('login-button');
const logoutButton = byId('logout-button');

function message(text, isError = false) {
  notice.textContent = text;
  notice.style.color = isError ? '#ffc0c0' : '#c5d3ef';
}

async function checkHealth() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('Health check failed');
    systemStatus.textContent = 'System online';
    systemStatus.className = 'status status-ok';
  } catch {
    systemStatus.textContent = 'System unavailable';
    systemStatus.className = 'status status-error';
  }
}

async function loadSession() {
  const response = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    signedOut.hidden = false;
    signedIn.hidden = true;
    return;
  }
  const data = await response.json();
  byId('founder-email').textContent = data.founder.email;
  signedOut.hidden = true;
  signedIn.hidden = false;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  message('Requesting a one-time founder link…');
  try {
    const email = new FormData(loginForm).get('email');
    const response = await fetch('/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to request login link');
    message(data.message);
    loginForm.reset();
  } catch (error) {
    message(error instanceof Error ? error.message : 'Unable to request login link', true);
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.replace('/');
});

await Promise.all([checkHealth(), loadSession()]);
`;

const CALLBACK_JS = `const title = document.getElementById('callback-title');
const message = document.getElementById('callback-message');
const returnLink = document.getElementById('callback-return');

function fail(text) {
  title.textContent = 'Login could not be completed';
  message.textContent = text;
  returnLink.hidden = false;
  history.replaceState(null, '', '/auth/callback');
}

const query = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const errorDescription = query.get('error_description') || fragment.get('error_description');

if (errorDescription) {
  fail(errorDescription);
} else {
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) {
    fail('The one-time link is missing session credentials or has already expired. Request a new link.');
  } else {
    try {
      const response = await fetch('/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
      });
      const data = await response.json();
      history.replaceState(null, '', '/auth/callback');
      if (!response.ok) throw new Error(data.error || 'Session verification failed');
      location.replace('/');
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Session verification failed');
    }
  }
}
`;

function sendAsset(res: Parameters<Parameters<Router['get']>[1]>[1], type: string, body: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(body);
}

onboardingRouter.get('/', (_req, res) => sendAsset(res, 'text/html; charset=utf-8', CONTROL_ROOM_HTML));
onboardingRouter.get('/assets/control-room.css', (_req, res) => sendAsset(res, 'text/css; charset=utf-8', CONTROL_ROOM_CSS));
onboardingRouter.get('/assets/control-room.js', (_req, res) => sendAsset(res, 'text/javascript; charset=utf-8', CONTROL_ROOM_JS));
onboardingRouter.get('/assets/auth-callback.js', (_req, res) => sendAsset(res, 'text/javascript; charset=utf-8', CALLBACK_JS));

export function founderCallbackHtml(): string {
  return CALLBACK_HTML;
}
