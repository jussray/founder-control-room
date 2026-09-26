const SCREEN_KEY = 'fcr_founder_screen';
const VIEW_KEY = 'fcr_founder_view';
const CONTEXT_KEY = 'fcr_founder_context';
const STYLE_ID = 'fcr-five-screen-shell-style';

const SCREENS = [
  ['home', 'Home'],
  ['control', 'Control'],
  ['chief', 'Chief'],
  ['promptos', 'PromptOS'],
  ['proof', 'Proof'],
];

const CONTROL_VIEWS = [
  ['overview', 'Overview', 'projects'],
  ['work', 'Work', 'missions'],
  ['costs', 'Costs', 'analytics'],
  ['execution', 'Execution', 'terminal'],
];

const LEGACY_ROUTE_MAP = {
  projects: { screen: 'control', view: 'overview' },
  missions: { screen: 'control', view: 'work' },
  analytics: { screen: 'control', view: 'costs' },
  terminal: { screen: 'control', view: 'execution' },
  l99: { screen: 'chief' },
  promptos: { screen: 'promptos' },
  activity: { screen: 'proof' },
};

const SCREEN_TO_LEGACY = {
  chief: 'l99',
  promptos: 'promptos',
  proof: 'activity',
};

const root = document.getElementById('root');
let applying = false;
let homeLoadToken = 0;
let shellObserver = null;
const restoreAttempts = new Set();

function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* navigation still works */ }
}

function readContext() {
  try {
    const raw = safeSessionGet(CONTEXT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeContext(patch) {
  const next = { ...readContext(), ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value === null || value === undefined || value === '') delete next[key];
  }
  safeSessionSet(CONTEXT_KEY, JSON.stringify(next));
  restoreAttempts.clear();
  return next;
}

function normalizedScreen(value) {
  return SCREENS.some(([id]) => id === value) ? value : 'home';
}

function normalizedControlView(value) {
  return CONTROL_VIEWS.some(([id]) => id === value) ? value : 'overview';
}

function initialLocation() {
  const url = new URL(window.location.href);
  const legacy = url.searchParams.get('tab');
  if (legacy && LEGACY_ROUTE_MAP[legacy]) return LEGACY_ROUTE_MAP[legacy];

  const screen = normalizedScreen(url.searchParams.get('screen') || safeSessionGet(SCREEN_KEY));
  const view = normalizedControlView(url.searchParams.get('view') || safeSessionGet(VIEW_KEY));
  return { screen, view };
}

let locationState = initialLocation();
safeSessionSet(SCREEN_KEY, locationState.screen);
safeSessionSet(VIEW_KEY, locationState.view);

function syncUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('tab');
  url.searchParams.set('screen', locationState.screen);
  if (locationState.screen === 'control') url.searchParams.set('view', locationState.view);
  else url.searchParams.delete('view');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tabs[data-legacy-tabs="true"]{display:none!important}
    .founder-screen-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.35rem;padding:.55rem 1.25rem;border-bottom:1px solid var(--panel-border);background:rgba(15,17,21,.96);position:sticky;top:0;z-index:30}
    .founder-screen-nav button{min-width:0;border:0;border-radius:.7rem;background:transparent;color:var(--muted);padding:.7rem .55rem;font-weight:700}
    .founder-screen-nav button[aria-current="page"]{color:var(--text);background:#20242d;box-shadow:inset 0 -2px 0 var(--accent)}
    .founder-context{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin:0 auto .8rem;max-width:1100px;padding:.7rem .9rem;border:1px solid var(--panel-border);border-radius:10px;background:#12151b;color:var(--muted);font-size:.8rem}
    .founder-context strong{color:var(--text)}
    .founder-screen-intro{margin-bottom:1rem;padding:1rem;border:1px solid var(--panel-border);border-radius:12px;background:linear-gradient(145deg,#171a21,#12151b)}
    .founder-screen-intro .eyebrow{margin:0 0 .4rem;color:var(--accent);font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .founder-screen-intro h2{margin:.1rem 0 .35rem;font-size:1.15rem}
    .founder-screen-intro p{margin:.25rem 0;color:var(--muted);line-height:1.5}
    .founder-subnav{display:flex;gap:.4rem;flex-wrap:wrap;margin:.75rem 0 1rem}
    .founder-subnav button[aria-current="page"]{border-color:var(--accent);color:var(--text);background:#20242d}
    .founder-home{flex:1;padding:1.25rem;max-width:1100px;width:100%;margin:0 auto}
    .founder-home-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin:1rem 0}
    .founder-home-card{padding:.9rem;border:1px solid var(--panel-border);border-radius:10px;background:var(--panel)}
    .founder-home-card small{display:block;color:var(--muted);margin-bottom:.3rem}
    .founder-home-card strong{font-size:1.15rem}
    .founder-next-gate{padding:1rem;border:1px solid rgba(79,209,197,.4);border-radius:12px;background:rgba(79,209,197,.06)}
    .founder-quick-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem}
    .founder-proof-links{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem}
    .founder-proof-links a{display:inline-flex;padding:.5rem .75rem;border:1px solid var(--panel-border);border-radius:8px;text-decoration:none;color:var(--text)}
    .founder-proof-links a:hover{border-color:var(--accent)}
    @media(max-width:760px){
      .founder-screen-nav{padding:.45rem;gap:.18rem}
      .founder-screen-nav button{padding:.6rem .2rem;font-size:.74rem}
      .founder-home,.content{padding:.75rem}
      .founder-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
  `;
  document.head.appendChild(style);
}

function legacyButton(tab) {
  return document.querySelector(`.tabs[data-legacy-tabs="true"] button[data-tab="${tab}"]`)
    || document.querySelector(`.tabs button[data-tab="${tab}"]`);
}

function activeLegacyTab() {
  return document.querySelector('.tabs button.active')?.dataset?.tab || null;
}

function activateLegacy(tab) {
  const button = legacyButton(tab);
  if (!(button instanceof HTMLButtonElement)) return false;
  if (activeLegacyTab() === tab) return true;
  button.click();
  return true;
}

function setLocation(screen, view = locationState.view) {
  locationState = {
    screen: normalizedScreen(screen),
    view: normalizedControlView(view),
  };
  safeSessionSet(SCREEN_KEY, locationState.screen);
  safeSessionSet(VIEW_KEY, locationState.view);
  restoreAttempts.clear();
  syncUrl();
  applyShell();
}

function makeButton(label, current, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (current) button.setAttribute('aria-current', 'page');
  button.addEventListener('click', onClick);
  return button;
}

function ensurePrimaryNav(shell, legacyTabs) {
  legacyTabs.dataset.legacyTabs = 'true';
  let nav = shell.querySelector('.founder-screen-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'founder-screen-nav';
    nav.setAttribute('aria-label', 'Founder Control Room screens');
    legacyTabs.insertAdjacentElement('afterend', nav);
  }
  nav.replaceChildren(...SCREENS.map(([id, label]) => makeButton(
    label,
    locationState.screen === id,
    () => setLocation(id),
  )));
  return nav;
}

function contextLabel() {
  const context = readContext();
  const project = context.projectName || context.projectSlug || 'No project selected';
  const mission = context.missionTitle || context.missionId || 'No mission selected';
  return { project, mission, hasProject: Boolean(context.projectSlug), hasMission: Boolean(context.missionId) };
}

function installContextRibbon(content) {
  content.querySelector('.founder-context')?.remove();
  if (locationState.screen === 'home') return;
  const label = contextLabel();
  const ribbon = document.createElement('div');
  ribbon.className = 'founder-context';
  ribbon.innerHTML = `<span><strong>Working on:</strong> ${escapeText(label.project)}${label.hasMission ? ` / ${escapeText(label.mission)}` : ''}</span><span>${label.hasProject ? 'Context follows you across screens' : 'Choose a project in Control'}</span>`;
  content.prepend(ribbon);
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function introMarkup(screen) {
  if (screen === 'control') {
    return `<div class="founder-screen-intro"><p class="eyebrow">Control</p><h2>Control the project, not the codebase map.</h2><p>Keep project reality, active work, spend, and guarded execution under one persistent project context.</p></div>`;
  }
  if (screen === 'chief') {
    return `<div class="founder-screen-intro"><p class="eyebrow">Chief</p><h2>Decide what should happen next.</h2><p>Reality, options, attack, recommendation, then founder decision. L99 is an operating method here, not a competing destination.</p><div class="founder-proof-links"><a href="/control-room/futureyou-v8.html">FutureYou</a><a href="/control-room/goalfix.html">Goalfix</a><a href="/control-room/capabilities.html">Capabilities</a></div></div>`;
  }
  if (screen === 'promptos') {
    return `<div class="founder-screen-intro"><p class="eyebrow">PromptOS</p><h2>Turn instructions into reusable operating intelligence.</h2><p>Prompts and versions stay here. Workflows, execution, projects, and skills remain connected through the Founder Stack.</p></div>`;
  }
  if (screen === 'proof') {
    return `<div class="founder-screen-intro"><p class="eyebrow">Proof</p><h2>What actually happened?</h2><p>History is evidence, not authority. Runtime identity, releases, browser receipts, and evidence-trust surfaces must agree before a green claim survives.</p><div class="founder-proof-links"><a href="/control-room/evidence-trust.html">Evidence trust plane</a><a href="/version">Runtime identity</a></div></div>`;
  }
  return '';
}

function installIntro(content) {
  content.querySelector('.founder-screen-intro')?.remove();
  const markup = introMarkup(locationState.screen);
  if (!markup) return;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const ribbon = content.querySelector('.founder-context');
  if (ribbon) ribbon.insertAdjacentElement('afterend', template.content.firstElementChild);
  else content.prepend(template.content);
}

function installControlSubnav(content) {
  content.querySelector('.founder-subnav')?.remove();
  if (locationState.screen !== 'control') return;
  const nav = document.createElement('nav');
  nav.className = 'founder-subnav';
  nav.setAttribute('aria-label', 'Control views');
  for (const [id, label] of CONTROL_VIEWS) {
    nav.appendChild(makeButton(label, locationState.view === id, () => setLocation('control', id)));
  }
  const intro = content.querySelector('.founder-screen-intro');
  if (intro) intro.insertAdjacentElement('afterend', nav);
  else content.prepend(nav);
}

function desiredLegacyTab() {
  if (locationState.screen === 'control') {
    return CONTROL_VIEWS.find(([id]) => id === locationState.view)?.[2] || 'projects';
  }
  return SCREEN_TO_LEGACY[locationState.screen] || null;
}

function missionNextGate(status) {
  const gates = {
    proposed: 'Run the create-branch proof gate before execution.',
    sandboxed: 'Implement the bounded change and collect required checks.',
    in_review: 'Resolve review findings and bind fresh proof to the exact head.',
    approved: 'Founder-authorized exact-head execution is the next gate.',
    integrated: 'Verify deployment and runtime identity before calling it live.',
    deployed: 'Inspect runtime and browser proof for the deployed candidate.',
    rejected: 'Revise the mission from current evidence before retrying.',
    rolled_back: 'Re-establish current reality before starting a successor mission.',
  };
  return gates[status] || 'Choose one bounded mission and establish its current reality.';
}

function unwrapApiData(value) {
  return value && value.success === true && value.data ? value.data : value;
}

async function apiJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return unwrapApiData(await response.json());
}

async function renderHome(home) {
  const token = ++homeLoadToken;
  home.innerHTML = `<div class="founder-screen-intro"><p class="eyebrow">Home</p><h2>What needs you now?</h2><p>Portfolio reality, the current blocker, and one next gate. Tools stay subordinate to the decision.</p></div><p class="muted">Loading current founder reality…</p>`;

  try {
    const [projectsBody, tasksBody, activityBody, versionBody] = await Promise.all([
      apiJson('/projects'),
      apiJson('/dashboard/tasks'),
      apiJson('/dashboard/activity'),
      apiJson('/version'),
    ]);
    if (token !== homeLoadToken || locationState.screen !== 'home') return;

    const projects = projectsBody?.projects ?? [];
    const tasks = tasksBody?.tasks ?? [];
    const activity = activityBody?.activity ?? [];
    const activeTasks = tasks.filter((task) => !['deployed', 'rejected', 'rolled_back'].includes(task.status));
    const context = readContext();
    const selectedMission = tasks.find((task) => task.id === context.missionId) || activeTasks[0] || null;
    const needsFounder = tasks.filter((task) => ['in_review', 'approved'].includes(task.status)).length;
    const runtimeSha = typeof versionBody?.gitSha === 'string' ? versionBody.gitSha.slice(0, 12) : 'unverified';
    const nextGate = selectedMission ? missionNextGate(selectedMission.status) : 'Choose the project or mission that matters most now.';

    home.innerHTML = `
      <div class="founder-screen-intro"><p class="eyebrow">Home</p><h2>What needs you now?</h2><p>Portfolio reality, the current blocker, and one next gate. Tools stay subordinate to the decision.</p></div>
      <div class="founder-home-grid">
        <div class="founder-home-card"><small>Projects</small><strong>${projects.length}</strong></div>
        <div class="founder-home-card"><small>Active work</small><strong>${activeTasks.length}</strong></div>
        <div class="founder-home-card"><small>Needs founder</small><strong>${needsFounder}</strong></div>
        <div class="founder-home-card"><small>Runtime SHA</small><strong class="mono">${escapeText(runtimeSha)}</strong></div>
      </div>
      <div class="founder-next-gate">
        <small class="muted">NEXT GATE</small>
        <h3>${escapeText(selectedMission?.title || 'Select current work')}</h3>
        <p>${escapeText(nextGate)}</p>
        <p class="muted">Recent evidence events: ${activity.length}</p>
        <div class="founder-quick-actions"><button type="button" data-home-target="control">Open Control</button><button type="button" data-home-target="proof">Inspect Proof</button></div>
      </div>
    `;
    home.querySelectorAll('[data-home-target]').forEach((button) => {
      button.addEventListener('click', () => setLocation(button.dataset.homeTarget));
    });
  } catch (error) {
    if (token !== homeLoadToken || locationState.screen !== 'home') return;
    home.innerHTML += `<p class="error">Home reality could not be established: ${escapeText(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

function showHome(shell, content) {
  content.hidden = true;
  let home = shell.querySelector('.founder-home');
  if (!home) {
    home = document.createElement('section');
    home.className = 'founder-home';
    content.insertAdjacentElement('beforebegin', home);
  }
  home.hidden = false;
  if (home.dataset.loadState === 'loading' || home.dataset.loadState === 'loaded') return;
  home.dataset.loadState = 'loading';
  void renderHome(home).finally(() => {
    if (locationState.screen === 'home') home.dataset.loadState = 'loaded';
  });
}

function showLegacyContent(shell, content) {
  const home = shell.querySelector('.founder-home');
  if (home instanceof HTMLElement) {
    if (!home.hidden) homeLoadToken += 1;
    home.hidden = true;
    delete home.dataset.loadState;
  }
  content.hidden = false;
  installContextRibbon(content);
  installIntro(content);
  installControlSubnav(content);
}

function maybeRestoreContext() {
  if (locationState.screen !== 'control') return;
  const context = readContext();
  if (locationState.view === 'overview' && context.projectSlug) {
    const key = `project:${context.projectSlug}`;
    if (restoreAttempts.has(key)) return;
    const card = [...document.querySelectorAll('#project-list .card[data-slug]')]
      .find((candidate) => candidate.dataset.slug === context.projectSlug);
    if (card instanceof HTMLElement && !document.querySelector('#project-detail h2')) {
      restoreAttempts.add(key);
      card.click();
    }
  }
  if (locationState.view === 'work' && context.missionId) {
    const key = `mission:${context.missionId}`;
    if (restoreAttempts.has(key)) return;
    const card = [...document.querySelectorAll('#mission-lanes .card[data-id]')]
      .find((candidate) => candidate.dataset.id === context.missionId);
    if (card instanceof HTMLElement && !document.querySelector('#mission-detail h2')) {
      restoreAttempts.add(key);
      card.click();
    }
  }
}

function captureContext(event) {
  const projectCard = event.target instanceof Element ? event.target.closest('#project-list .card[data-slug]') : null;
  if (projectCard instanceof HTMLElement) {
    const title = projectCard.querySelector('.title')?.textContent?.trim() || '';
    writeContext({
      projectSlug: projectCard.dataset.slug,
      projectName: title.replace(/\s*\([^)]*\)\s*$/, ''),
      missionId: null,
      missionTitle: null,
    });
    return;
  }

  const missionCard = event.target instanceof Element ? event.target.closest('#mission-lanes .card[data-id]') : null;
  if (missionCard instanceof HTMLElement) {
    const meta = missionCard.querySelector('.meta')?.textContent?.trim() || '';
    const projectSlug = meta.split('·')[0]?.trim() || null;
    writeContext({
      projectSlug,
      missionId: missionCard.dataset.id,
      missionTitle: missionCard.querySelector('.title')?.textContent?.trim() || null,
    });
  }
}

function shellParts() {
  const shell = root?.querySelector('.shell');
  const legacyTabs = shell?.querySelector('.tabs');
  const content = shell?.querySelector('.content');
  return shell instanceof HTMLElement && legacyTabs instanceof HTMLElement && content instanceof HTMLElement
    ? { shell, legacyTabs, content }
    : null;
}

function applyShell() {
  if (applying || !root) return;
  const initial = shellParts();
  if (!initial) return;

  applying = true;
  shellObserver?.disconnect();
  try {
    installStyles();

    if (locationState.screen === 'home') {
      ensurePrimaryNav(initial.shell, initial.legacyTabs);
      showHome(initial.shell, initial.content);
      return;
    }

    const target = desiredLegacyTab();
    if (target && activeLegacyTab() !== target) {
      activateLegacy(target);
    }

    // Legacy tab activation calls app.js render(), which rebuilds the entire
    // .shell under #root. Always reacquire live DOM references after that
    // compatibility render before installing five-screen chrome or context.
    const final = shellParts();
    if (!final) return;
    ensurePrimaryNav(final.shell, final.legacyTabs);
    showLegacyContent(final.shell, final.content);
    maybeRestoreContext();
  } finally {
    applying = false;
    if (root && shellObserver) shellObserver.observe(root, { childList: true, subtree: true });
  }
}

syncUrl();
document.addEventListener('click', captureContext, true);

if (root) {
  shellObserver = new MutationObserver(() => queueMicrotask(applyShell));
  shellObserver.observe(root, { childList: true, subtree: true });
}

applyShell();