// Founder Control Room — single-page app.
//
// No build step, no framework, no external dependency. Talks only to this
// same Express server's founder-gated JSON API. Session tokens live in
// sessionStorage (cleared when the tab closes) and are only ever placed
// there from the URL *fragment* that /auth/callback redirects to — never
// from a query string or server-rendered value — so they never touch
// server logs or land in browser history via a referrer header.

const STORAGE_KEY = 'fcr_session';
const root = document.getElementById('root');

const state = {
  session: null,
  tab: 'projects',
  projects: [],
  selectedProjectSlug: null,
  selectedProject: null,
  projectFiles: { ref: null, path: '', entries: [] },
  projectReleases: [],
  projectConnections: [],
  missions: [],
  activity: [],
  selectedMissionId: null,
  missionFiles: { path: '', content: '', dirty: false },
  missionCouncil: [],
  missionRuns: [],
  missionCosts: null,
  l99: null,
  terminal: { projectSlug: null, commands: [], lastRun: null },
  promptTemplates: [],
  selectedTemplateId: null,
  selectedTemplate: null,
  costs: null,
  agents: [],
  authorityLevels: [],
  banner: null, // { kind: 'error'|'notice', text }
};

/** Renders a <datalist> of registered multitool agents — free text still allowed, per the API. */
function agentDatalist(id) {
  return `<datalist id="${id}">${state.agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.label)}</option>`).join('')}</datalist>`;
}

// ─── session plumbing ────────────────────────────────────────────────────────

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  state.session = session;
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  state.session = null;
}

/** Reads a session handed off in the URL fragment by GET /auth/callback, then strips it. */
function consumeHashSession() {
  if (!location.hash || location.hash.length < 2) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  if (!accessToken) return false;

  saveSession({
    access_token: accessToken,
    refresh_token: params.get('refresh_token') ?? '',
    expires_at: Number(params.get('expires_at') ?? 0) || null,
    email: params.get('email') ?? '',
  });

  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

// ─── API helper ──────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  if (state.session?.access_token) {
    headers.Authorization = `Bearer ${state.session.access_token}`;
  }

  const res = await fetch(path, { ...opts, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (res.status === 401) {
    clearSession();
    render();
    throw new Error(body?.error ?? 'Session expired — please sign in again.');
  }

  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return body;
}

function setBanner(kind, text) {
  state.banner = text ? { kind, text } : null;
}

async function guarded(action) {
  try {
    setBanner(null);
    await action();
  } catch (err) {
    setBanner('error', err instanceof Error ? err.message : String(err));
  }
  render();
}

// ─── small utilities ─────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Parses an HTML string into a DocumentFragment so every top-level sibling
 * survives appendChild — not just the first one. Templates in this file
 * routinely have multiple top-level panels (e.g. a form panel + a list
 * panel + a hidden detail panel); returning only firstElementChild here
 * silently dropped the rest, which no vitest/supertest test could ever
 * catch since none of them render into a real DOM. Caught by e2e/run.mjs.
 */
function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

function on(selector, event, handler) {
  root.querySelectorAll(selector).forEach((node) => node.addEventListener(event, handler));
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/** Drops blank string fields so an empty optional input means "unset", not "set to ''". */
function withoutBlanks(values) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
}

// ─── render: sign-in ─────────────────────────────────────────────────────────

function renderSignIn() {
  root.innerHTML = '';
  root.appendChild(el(`
    <div class="sign-in-wrap">
      <div class="panel sign-in-card">
        <h2>Founder Control Room</h2>
        <p class="muted">Sign in with your founder email. If it's on the allowlist, a magic link will be emailed to you.</p>
        <form id="magic-link-form">
          <label>Email</label>
          <input type="email" name="email" required placeholder="founder@example.com" />
          <div style="margin-top:0.75rem"><button class="primary" type="submit">Send magic link</button></div>
        </form>
        ${state.banner ? `<p class="${state.banner.kind === 'error' ? 'error' : 'notice'}">${escapeHtml(state.banner.text)}</p>` : ''}
      </div>
    </div>
  `));

  root.querySelector('#magic-link-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { email } = formValues(e.target);
    guarded(async () => {
      await api('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
      setBanner('notice', 'If that email is allowlisted, check your inbox for a magic link.');
    });
  });
}

// ─── render: shell ───────────────────────────────────────────────────────────

const TABS = [
  ['projects', 'Projects'],
  ['missions', 'Missions'],
  ['activity', 'Activity'],
  ['l99', 'L99'],
  ['promptos', 'PromptOS'],
  ['analytics', 'Analytics'],
  ['terminal', 'Terminal'],
];

function renderShell() {
  root.innerHTML = '';
  const shell = el(`
    <div class="shell">
      <div class="topbar">
        <div class="brand">Founder Control Room</div>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <span class="founder-email">${escapeHtml(state.session.email)}</span>
          <button id="sign-out">Sign out</button>
        </div>
      </div>
      <div class="tabs">
        ${TABS.map(([id, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="content" id="tab-content"></div>
    </div>
  `);
  root.appendChild(shell);

  root.querySelector('#sign-out').addEventListener('click', () => { clearSession(); render(); });
  root.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
  });

  renderTabContent();
}

function renderTabContent() {
  const mount = document.getElementById('tab-content');
  if (!mount) return;
  mount.innerHTML = '';
  if (state.banner) {
    mount.appendChild(el(`<p class="${state.banner.kind === 'error' ? 'error' : 'notice'}">${escapeHtml(state.banner.text)}</p>`));
  }

  if (state.tab === 'projects') return renderProjectsTab(mount);
  if (state.tab === 'missions') return renderMissionsTab(mount);
  if (state.tab === 'activity') return renderActivityTab(mount);
  if (state.tab === 'l99') return renderL99Tab(mount);
  if (state.tab === 'promptos') return renderPromptOsTab(mount);
  if (state.tab === 'analytics') return renderAnalyticsTab(mount);
  if (state.tab === 'terminal') return renderTerminalTab(mount);
}

async function loadAgents() {
  const data = await api('/agents');
  state.agents = data.agents ?? [];
}

async function loadAuthorityLevels() {
  const data = await api('/authority-levels');
  state.authorityLevels = data.levels ?? [];
}

// ─── Projects tab ────────────────────────────────────────────────────────────

async function loadProjects() {
  const data = await api('/projects');
  state.projects = data.projects ?? [];
}

function renderProjectsTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <h2>Register a project</h2>
      <form id="new-project-form">
        <div class="row">
          <div><label>Slug</label><input name="slug" placeholder="my-project" required /></div>
          <div><label>Name</label><input name="name" placeholder="My Project" required /></div>
          <div><label>Repo (owner/repo)</label><input name="repoIdentifier" placeholder="jussray/my-project" /></div>
        </div>
        <div style="margin-top:0.75rem"><button class="primary" type="submit">Register</button></div>
      </form>
    </div>
    <div class="panel">
      <h2>Projects</h2>
      <div id="project-list"></div>
    </div>
    <div class="panel" id="project-detail" style="display:none"></div>
  `));

  root.querySelector('#new-project-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = withoutBlanks(formValues(e.target));
    guarded(async () => {
      await api('/projects', { method: 'POST', body: JSON.stringify(values) });
      await loadProjects();
      e.target.reset();
    });
  });

  const list = mount.querySelector('#project-list');
  if (state.projects.length === 0) {
    list.innerHTML = '<p class="muted">No projects registered yet.</p>';
  } else {
    list.innerHTML = state.projects.map((p) => `
      <div class="card" data-slug="${escapeHtml(p.slug)}">
        <div class="meta">${escapeHtml(p.repo_provider)} · ${escapeHtml(p.risk_level)} risk · ${escapeHtml(p.status)}</div>
        <div class="title">${escapeHtml(p.name)} <span class="muted mono">(${escapeHtml(p.slug)})</span></div>
      </div>
    `).join('');
    list.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => selectProject(card.dataset.slug));
    });
  }

  if (state.selectedProjectSlug) renderProjectDetail(mount);
}

async function selectProject(slug) {
  await guarded(async () => {
    state.selectedProjectSlug = slug;
    const data = await api(`/projects/${encodeURIComponent(slug)}`);
    state.selectedProject = data;
    state.projectFiles = { ref: data.live?.defaultBranch ?? null, path: '', entries: [] };
    await browseProjectFiles(slug, state.projectFiles.ref, '');
    await loadProjectReleases(slug);
    await loadProjectConnections(slug);
  });
}

async function loadProjectReleases(slug) {
  const data = await api(`/projects/${encodeURIComponent(slug)}/releases`);
  state.projectReleases = data.releases ?? [];
}

async function loadProjectConnections(slug) {
  const data = await api(`/projects/${encodeURIComponent(slug)}/connections`);
  state.projectConnections = data.connections ?? [];
}

async function browseProjectFiles(slug, ref, path) {
  const q = new URLSearchParams();
  if (ref) q.set('ref', ref);
  if (path) q.set('path', path);
  const data = await api(`/projects/${encodeURIComponent(slug)}/files?${q.toString()}`);
  state.projectFiles = { ref: data.ref, path: data.path, entries: data.entries ?? [] };
}

function renderProjectDetail(mount) {
  const panel = mount.querySelector('#project-detail');
  panel.style.display = 'block';
  const p = state.selectedProject;
  const files = state.projectFiles;

  panel.innerHTML = `
    <h2>${escapeHtml(p.project.name)} <span class="muted mono">(${escapeHtml(p.project.slug)})</span></h2>
    ${p.liveError ? `<p class="error">Live repository fetch failed: ${escapeHtml(p.liveError)}</p>` : ''}
    ${p.live ? `<p class="muted">Default branch: <span class="mono">${escapeHtml(p.live.defaultBranch)}</span></p>` : ''}

    <h3>Files ${files.ref ? `<span class="mono">@ ${escapeHtml(files.ref)}</span>` : ''}${files.path ? ` / ${escapeHtml(files.path)}` : ''}</h3>
    ${files.path ? `<button id="file-up">.. up</button>` : ''}
    <ul class="file-tree" id="project-file-tree">
      ${files.entries.map((entry) => `<li class="${entry.type}" data-path="${escapeHtml(entry.path)}" data-type="${entry.type}">${escapeHtml(entry.path.split('/').pop())}</li>`).join('')}
    </ul>
    <pre id="project-file-content" style="display:none"></pre>

    <h3>New mission</h3>
    <form id="new-mission-form">
      <label>Title</label>
      <input name="title" required placeholder="Fix the checkout race condition" />
      <label>Description</label>
      <textarea name="description" rows="2"></textarea>
      <div class="row">
        <div><label>Builder agent</label><input name="builderAgent" list="agent-options-new-mission" placeholder="claude-code" /></div>
        <div><label>Reviewer agent</label><input name="reviewerAgent" list="agent-options-new-mission" placeholder="codex" /></div>
      </div>
      ${agentDatalist('agent-options-new-mission')}
      <label>Required checks (comma-separated) — leave blank and this mission can never leave "sandboxed" automatically</label>
      <input name="requiredChecks" placeholder="unit_test, typecheck" />
      <div style="margin-top:0.5rem"><button class="primary" type="submit">Create mission</button></div>
    </form>

    <h3>Release Center <span class="muted">(read-only — deploy/rollback execution isn't wired up yet)</span></h3>
    ${state.projectReleases.length === 0 ? '<p class="muted">No releases recorded.</p>' : state.projectReleases.map((r) => `
      <div class="card" style="cursor:default">
        <div class="meta">${escapeHtml(r.version ?? 'unversioned')} · <span class="mono">${escapeHtml((r.commit_sha ?? '').slice(0, 12))}</span></div>
        <div class="title">
          <span class="badge ${r.status === 'deployed' ? 'ok' : r.status === 'failed' ? 'danger' : ''}">${escapeHtml(r.status)}</span>
          ${r.deployed_at ? ` · deployed ${escapeHtml(new Date(r.deployed_at).toLocaleString())}` : ''}
        </div>
      </div>
    `).join('')}

    <h3>MCP / Connector Hub</h3>
    ${state.projectConnections.length === 0 ? '<p class="muted">No connections registered.</p>' : state.projectConnections.map((c) => `
      <div class="card" style="cursor:default" data-connection-id="${escapeHtml(c.id)}">
        <div class="meta">
          <span class="badge ${c.status === 'active' ? 'ok' : c.status === 'error' ? 'danger' : 'warn'}">${escapeHtml(c.status)}</span>
          ${c.authority_level ? ` · <span class="badge">${escapeHtml(c.authority_level)}</span>` : ' · <span class="muted">no authority level set</span>'}
          ${c.last_checked_at ? ` · last checked ${escapeHtml(new Date(c.last_checked_at).toLocaleString())}` : ' · never checked'}
        </div>
        <div class="title">${escapeHtml(c.connection_type)}${c.label ? ` — ${escapeHtml(c.label)}` : ''}</div>
        ${(c.capabilities ?? []).length > 0 ? `<p class="muted">${(c.capabilities ?? []).map(escapeHtml).join(', ')}</p>` : ''}
        ${c.data_boundary ? `<p class="muted">Boundary: ${escapeHtml(c.data_boundary)}</p>` : ''}
        ${c.secret_ref ? `<p class="muted">Secret ref: <span class="mono">${escapeHtml(c.secret_ref)}</span></p>` : ''}
        <button class="connection-check-btn" data-connection-id="${escapeHtml(c.id)}" type="button">Check now</button>
      </div>
    `).join('')}
    <form id="new-connection-form">
      <div class="row">
        <div><label>Type</label>
          <select name="connectionType">
            <option>github</option><option>git</option><option>cloudflare</option><option>supabase</option>
            <option>openai</option><option>anthropic</option><option>perplexity</option>
            <option>figma</option><option>canva</option><option>playwright</option>
            <option>gmail</option><option>calendar</option><option>context7</option>
            <option>shopify</option><option>expo</option><option>apple</option><option>google_play</option>
            <option>stripe</option><option>other</option>
          </select>
        </div>
        <div><label>Label</label><input name="label" placeholder="production" /></div>
        <div><label>Authority level</label>
          <select name="authorityLevel">
            <option value="">unset</option>
            ${state.authorityLevels.map((a) => `<option value="${a.level}">${a.level} — ${escapeHtml(a.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row">
        <div><label>Secret ref (pointer only — never a real secret)</label><input name="secretRef" placeholder="CLOUDFLARE_API_TOKEN" /></div>
        <div><label>Capabilities (comma-separated)</label><input name="capabilities" placeholder="inspect_repos, create_branch" /></div>
      </div>
      <label>Data boundary</label>
      <input name="dataBoundary" placeholder="Sanitized operational events only, no teen journal content." />
      <div style="margin-top:0.5rem"><button type="submit">Register connection</button></div>
    </form>
  `;

  panel.querySelectorAll('.connection-check-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      guarded(async () => {
        await api(`/projects/${encodeURIComponent(p.project.slug)}/connections/${btn.dataset.connectionId}/check`, {
          method: 'POST',
          body: JSON.stringify({ status: 'active' }),
        });
        await loadProjectConnections(p.project.slug);
        setBanner('notice', 'Connection check recorded.');
      });
    });
  });

  panel.querySelector('#file-up')?.addEventListener('click', () => {
    const parent = files.path.split('/').slice(0, -1).join('/');
    guarded(() => browseProjectFiles(p.project.slug, files.ref, parent));
  });

  panel.querySelectorAll('#project-file-tree li').forEach((node) => {
    node.addEventListener('click', () => {
      const { path, type } = node.dataset;
      if (type === 'dir') {
        guarded(() => browseProjectFiles(p.project.slug, files.ref, path));
      } else {
        guarded(async () => {
          const q = new URLSearchParams({ path, ...(files.ref ? { ref: files.ref } : {}) });
          const data = await api(`/projects/${encodeURIComponent(p.project.slug)}/file?${q.toString()}`);
          const pre = panel.querySelector('#project-file-content');
          pre.style.display = 'block';
          pre.textContent = data.content;
        });
      }
    });
  });

  panel.querySelector('#new-mission-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = withoutBlanks(formValues(e.target));
    if (values.requiredChecks) values.requiredChecks = values.requiredChecks.split(',').map((c) => c.trim()).filter(Boolean);
    guarded(async () => {
      await api(`/projects/${encodeURIComponent(p.project.slug)}/missions`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setBanner('notice', 'Mission created. See the Missions tab.');
      e.target.reset();
    });
  });

  panel.querySelector('#new-connection-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = withoutBlanks(formValues(e.target));
    if (values.capabilities) values.capabilities = values.capabilities.split(',').map((c) => c.trim()).filter(Boolean);
    guarded(async () => {
      await api(`/projects/${encodeURIComponent(p.project.slug)}/connections`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      await loadProjectConnections(p.project.slug);
      e.target.reset();
    });
  });
}

// ─── Missions tab ────────────────────────────────────────────────────────────

const MISSION_LANES = ['proposed', 'sandboxed', 'in_review', 'approved', 'integrated', 'deployed', 'rejected', 'rolled_back'];

async function loadMissions() {
  const data = await api('/dashboard/tasks');
  state.missions = data.tasks ?? [];
}

function renderMissionsTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <div class="toolbar"><button id="refresh-missions">Refresh</button></div>
      <div class="grid-lanes" id="mission-lanes"></div>
    </div>
    <div class="panel" id="mission-detail" style="display:none"></div>
  `));

  mount.querySelector('#refresh-missions').addEventListener('click', () => guarded(loadMissions));

  const lanes = mount.querySelector('#mission-lanes');
  lanes.innerHTML = MISSION_LANES.map((lane) => {
    const items = state.missions.filter((m) => m.status === lane);
    return `
      <div class="lane">
        <h4>${lane} (${items.length})</h4>
        ${items.map((m) => `
          <div class="card" data-id="${escapeHtml(m.id)}">
            <div class="meta">${escapeHtml(m.project?.slug ?? 'unknown')} · ${escapeHtml(m.risk_level)}</div>
            <div class="title">${escapeHtml(m.title)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');

  lanes.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => guarded(() => selectMission(card.dataset.id)));
  });

  if (state.selectedMissionId) renderMissionDetail(mount);
}

async function selectMission(id) {
  state.selectedMissionId = id;
  state.missionFiles = { path: '', content: '', dirty: false };
  const [council, runs, costs] = await Promise.all([
    api(`/missions/${encodeURIComponent(id)}/council`),
    api(`/missions/${encodeURIComponent(id)}/runs`),
    api(`/missions/${encodeURIComponent(id)}/costs`),
  ]);
  state.missionCouncil = council.conversations ?? [];
  state.missionRuns = runs.runs ?? [];
  state.missionCosts = costs;
}

function renderMissionDetail(mount) {
  const panel = mount.querySelector('#mission-detail');
  const mission = state.missions.find((m) => m.id === state.selectedMissionId);
  if (!mission) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const editable = mission.status === 'sandboxed' || mission.status === 'in_review';
  // create_branch is proof-gated too (PROOF_GATED_ACTIONS in approvals.ts)
  // and that gate must run BEFORE the branch exists, i.e. while still
  // 'proposed' — so this form can't be nested inside `editable` only, or
  // there would be no way to ever pass the create_branch gate at all.
  const canRunProofGate = mission.status === 'proposed' || editable;

  panel.innerHTML = `
    <h2>${escapeHtml(mission.title)}</h2>
    <p class="muted">${escapeHtml(mission.project?.slug ?? '')} · <span class="badge">${escapeHtml(mission.status)}</span> · branch: <span class="mono">${escapeHtml(mission.branch_ref ?? '—')}</span></p>
    ${mission.description ? `<p>${escapeHtml(mission.description)}</p>` : ''}

    <h3>Multitool assignment</h3>
    <p class="muted">Builder: <strong>${escapeHtml(mission.builder_agent ?? 'unassigned')}</strong> · Reviewer: <strong>${escapeHtml(mission.reviewer_agent ?? 'unassigned')}</strong></p>
    <form id="assign-agents-form">
      <div class="row">
        <div><label>Builder agent</label><input name="builderAgent" list="agent-options-assign" value="${escapeHtml(mission.builder_agent ?? '')}" /></div>
        <div><label>Reviewer agent</label><input name="reviewerAgent" list="agent-options-assign" value="${escapeHtml(mission.reviewer_agent ?? '')}" /></div>
      </div>
      ${agentDatalist('agent-options-assign')}
      <div style="margin-top:0.5rem"><button type="submit">Save assignment</button></div>
    </form>

    ${mission.status === 'proposed' ? `
      <h3>Create sandbox branch</h3>
      <form id="create-branch-form">
        <div class="row">
          <div><label>Base ref</label><input name="baseRef" value="main" /></div>
          <div><label>Branch name</label><input name="branchName" placeholder="mission/${mission.id.slice(0, 8)}" /></div>
        </div>
        <div style="margin-top:0.5rem"><button class="primary" type="submit">Create branch</button></div>
      </form>
    ` : ''}

    ${canRunProofGate ? `
      <h3>Run proof gate</h3>
      <form id="proof-gate-form">
        <label>Gate ID</label>
        <select name="gateId">
          <option value="create_branch">create_branch</option>
          <option value="merge">merge</option>
        </select>
        <label>Files changed (comma-separated) — required, the gate rejects an empty list</label>
        <input name="filesChanged" placeholder="src/index.ts" required />
        <label>Checks run (comma-separated) — required, the gate rejects an empty list</label>
        <input name="checksRun" placeholder="typecheck, unit_test" required />
        <label>Behavior changed</label><input name="behaviorChanged" required />
        <label>Security impact</label><input name="securityImpact" value="none" required />
        <label>Deployment impact</label><input name="deploymentImpact" value="none" required />
        <label>Rollback path</label><input name="rollbackPath" required />
        <div style="margin-top:0.5rem"><button class="primary" type="submit">Run proof gate</button></div>
      </form>
    ` : ''}

    ${editable ? `
      <h3>Edit files on ${escapeHtml(mission.branch_ref)}</h3>
      <div class="row">
        <div><label>Path</label><input id="mission-file-path" value="${escapeHtml(state.missionFiles.path)}" placeholder="src/example.ts" /></div>
      </div>
      <div class="toolbar">
        <button id="mission-file-load">Load</button>
      </div>
      <textarea class="code" id="mission-file-editor">${escapeHtml(state.missionFiles.content)}</textarea>
      <label>Commit message</label>
      <input id="mission-commit-message" placeholder="Describe the change" />
      <div style="margin-top:0.5rem"><button class="primary" id="mission-commit-btn">Commit to ${escapeHtml(mission.branch_ref ?? '')}</button></div>
    ` : ''}

    ${mission.status === 'approved' ? `
      <h3>Execute merge</h3>
      <form id="execute-merge-form">
        <div class="row">
          <div><label>Expected head SHA (40 hex)</label><input name="expectedHeadSha" class="mono" required /></div>
          <div><label>Idempotency key</label><input name="idempotencyKey" value="${escapeHtml(mission.id)}-merge-${Date.now()}" required /></div>
        </div>
        <div style="margin-top:0.5rem"><button class="primary" type="submit">Execute merge</button></div>
      </form>
    ` : ''}

    <h3>Agent Council</h3>
    ${state.missionCouncil.length === 0 ? '<p class="muted">No council rounds recorded for this mission.</p>' : state.missionCouncil.map((c) => `
      <div class="card" style="cursor:default">
        <div class="meta">Round ${escapeHtml(c.round)} · ${(c.participants ?? []).map(escapeHtml).join(', ')}</div>
        <div class="title">${escapeHtml(c.outcome ?? 'in progress')}</div>
      </div>
    `).join('')}
    <form id="log-council-form">
      <label>Participants (comma-separated)</label>
      <input name="participants" list="agent-options-council" placeholder="claude-code, codex, redteam" required />
      ${agentDatalist('agent-options-council')}
      <label>Outcome</label><input name="outcome" placeholder="approved" />
      <div style="margin-top:0.5rem"><button type="submit">Log council round</button></div>
    </form>

    <h3>Bench — runner/CI checks <span class="muted">(read-only, produced by the guarded terminal + proof gate)</span></h3>
    ${state.missionRuns.length === 0 ? '<p class="muted">No runner checks recorded for this mission.</p>' : state.missionRuns.map((r) => `
      <div class="card" style="cursor:default">
        <div class="meta">${escapeHtml(r.runner_profile ?? 'default')} · ${r.started_at ? escapeHtml(new Date(r.started_at).toLocaleString()) : ''}</div>
        <div class="title"><span class="badge ${r.status === 'passed' ? 'ok' : r.status === 'failed' ? 'danger' : ''}">${escapeHtml(r.status)}</span></div>
      </div>
    `).join('')}

    <h3>Mission cost ledger</h3>
    ${state.missionCosts && state.missionCosts.costs.length > 0
      ? `<p class="muted">Total: $${state.missionCosts.totalUsd.toFixed(4)}</p>`
      : '<p class="muted">No agent cost records for this mission.</p>'}
    <form id="log-cost-form">
      <div class="row">
        <div><label>Agent</label><input name="agentName" list="agent-options-cost" required /></div>
        <div><label>Provider</label><input name="provider" placeholder="anthropic" /></div>
        <div><label>Cost (USD)</label><input name="costUsd" type="number" step="0.0001" min="0" /></div>
      </div>
      ${agentDatalist('agent-options-cost')}
      <div style="margin-top:0.5rem"><button type="submit">Log cost</button></div>
    </form>
  `;

  panel.querySelector('#create-branch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    // Blank fields must be OMITTED, not sent as ''. The backend falls back
    // to 'main' / `mission/${id}` with `?? default`, which only triggers on
    // undefined — an empty string would silently create a branch/ref with
    // an empty name instead of the intended default.
    const values = withoutBlanks(formValues(e.target));
    guarded(async () => {
      await api(`/approvals/${mission.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'create_branch',
          idempotencyKey: `${mission.id}-branch-${Date.now()}`,
          payload: values,
        }),
      });
      await loadMissions();
      setBanner('notice', 'Branch created.');
    });
  });

  panel.querySelector('#assign-agents-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = withoutBlanks(formValues(e.target));
    guarded(async () => {
      await api(`/missions/${mission.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      await loadMissions();
      setBanner('notice', 'Agent assignment saved.');
    });
  });

  panel.querySelector('#log-council-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    const participants = values.participants.split(',').map((p) => p.trim()).filter(Boolean);
    guarded(async () => {
      await api(`/missions/${mission.id}/council`, {
        method: 'POST',
        body: JSON.stringify({ participants, outcome: values.outcome || undefined }),
      });
      state.missionCouncil = (await api(`/missions/${mission.id}/council`)).conversations ?? [];
      e.target.reset();
    });
  });

  panel.querySelector('#log-cost-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = withoutBlanks(formValues(e.target));
    if (values.costUsd) values.costUsd = Number(values.costUsd);
    guarded(async () => {
      await api(`/missions/${mission.id}/costs`, { method: 'POST', body: JSON.stringify(values) });
      state.missionCosts = await api(`/missions/${mission.id}/costs`);
      e.target.reset();
    });
  });

  panel.querySelector('#mission-file-load')?.addEventListener('click', () => {
    const path = panel.querySelector('#mission-file-path').value.trim();
    guarded(async () => {
      const q = new URLSearchParams({ path, ref: mission.branch_ref });
      const data = await api(`/projects/${encodeURIComponent(mission.project.slug)}/file?${q.toString()}`);
      state.missionFiles = { path, content: data.content, dirty: false };
    });
  });

  panel.querySelector('#mission-commit-btn')?.addEventListener('click', () => {
    const path = panel.querySelector('#mission-file-path').value.trim();
    const content = panel.querySelector('#mission-file-editor').value;
    const message = panel.querySelector('#mission-commit-message').value.trim() || `Edit ${path}`;
    if (!path) { setBanner('error', 'Path is required.'); render(); return; }
    guarded(async () => {
      await api(`/approvals/${mission.id}/patch`, {
        method: 'POST',
        body: JSON.stringify({ message, changes: [{ path, content }] }),
      });
      setBanner('notice', `Committed ${path} to ${mission.branch_ref}.`);
    });
  });

  panel.querySelector('#proof-gate-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    guarded(async () => {
      await api(`/approvals/${mission.id}/run-proof-gate`, {
        method: 'POST',
        body: JSON.stringify({
          gateId: values.gateId,
          evidence: {
            filesChanged: splitList(values.filesChanged),
            checksRun: splitList(values.checksRun),
            failures: [],
            unresolvedRisks: [],
            behaviorChanged: values.behaviorChanged,
            securityImpact: values.securityImpact,
            deploymentImpact: values.deploymentImpact,
            rollbackPath: values.rollbackPath,
          },
        }),
      });
      await loadMissions();
      setBanner('notice', 'Proof gate evaluated.');
    });
  });

  panel.querySelector('#execute-merge-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    guarded(async () => {
      await api(`/approvals/${mission.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'merge',
          idempotencyKey: values.idempotencyKey,
          payload: { expectedHeadSha: values.expectedHeadSha },
        }),
      });
      await loadMissions();
      setBanner('notice', 'Merge executed.');
    });
  });
}

// ─── Activity tab ────────────────────────────────────────────────────────────

async function loadActivity() {
  const data = await api('/dashboard/activity');
  state.activity = data.activity ?? [];
}

function renderActivityTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <div class="toolbar"><button id="refresh-activity">Refresh</button></div>
      <div id="activity-list"></div>
    </div>
  `));
  mount.querySelector('#refresh-activity').addEventListener('click', () => guarded(loadActivity));

  const list = mount.querySelector('#activity-list');
  list.innerHTML = state.activity.length === 0
    ? '<p class="muted">No activity yet.</p>'
    : state.activity.map((ev) => `
      <div class="card">
        <div class="meta">${escapeHtml(new Date(ev.created_at).toLocaleString())} · ${escapeHtml(ev.project?.slug ?? 'unknown')} · ${escapeHtml(ev.severity)}</div>
        <div class="title">${escapeHtml(ev.event_type)}</div>
      </div>
    `).join('');
}

// ─── L99 tab ─────────────────────────────────────────────────────────────────

async function loadL99() {
  try {
    const data = await api('/l99/status');
    state.l99 = data;
  } catch (err) {
    state.l99 = { error: err instanceof Error ? err.message : String(err) };
  }
}

function renderL99Tab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <div class="toolbar">
        <button id="refresh-l99">Refresh</button>
        <button id="seed-l99">Seed L99 project</button>
      </div>
      <div id="l99-body"></div>
    </div>
  `));

  mount.querySelector('#refresh-l99').addEventListener('click', () => guarded(loadL99));
  mount.querySelector('#seed-l99').addEventListener('click', () => guarded(async () => {
    await api('/l99/seed', { method: 'POST' });
    await loadL99();
  }));

  const body = mount.querySelector('#l99-body');
  if (!state.l99) { body.innerHTML = '<p class="muted">Loading…</p>'; return; }
  if (state.l99.error) { body.innerHTML = `<p class="error">${escapeHtml(state.l99.error)}</p>`; return; }

  body.innerHTML = `
    <p><strong>${state.l99.standaloneLaunchReady ? '✅ Standalone launch ready' : '🚧 Not ready yet'}</strong></p>
    <p class="muted">${escapeHtml(state.l99.redTeamVerdict)}</p>
    ${state.l99.oodaFiringOrder.map((gate) => `
      <div class="card">
        <div class="meta">Gate ${gate.order}${gate.requiresApproval ? ' · requires founder approval' : ''}</div>
        <div class="title">${escapeHtml(gate.label)} — <span class="badge ${gate.status === 'pass' ? 'ok' : gate.status === 'not_run' ? '' : 'danger'}">${escapeHtml(gate.status)}</span></div>
      </div>
    `).join('')}
  `;
}

// ─── PromptOS tab ────────────────────────────────────────────────────────────

async function loadPromptTemplates() {
  const data = await api('/promptos');
  state.promptTemplates = data.templates ?? [];
}

async function selectTemplate(id) {
  state.selectedTemplateId = id;
  state.selectedTemplate = await api(`/promptos/${encodeURIComponent(id)}`);
}

function renderPromptOsTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <h2>New template</h2>
      <form id="new-template-form">
        <div class="row">
          <div><label>Name</label><input name="name" required /></div>
          <div><label>Slash command</label><input name="slashCommand" placeholder="/redteam" /></div>
          <div><label>Category</label><input name="category" placeholder="modes" /></div>
        </div>
        <label>Tagline</label><input name="tagline" />
        <label>Body template — use [PLACEHOLDER] for variables</label>
        <textarea class="code" name="bodyTemplate" required rows="6"></textarea>
        <div style="margin-top:0.5rem"><button class="primary" type="submit">Create template</button></div>
      </form>
    </div>
    <div class="panel">
      <h2>Templates</h2>
      <div id="template-list"></div>
    </div>
    <div class="panel" id="template-detail" style="display:none"></div>
  `));

  mount.querySelector('#new-template-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    guarded(async () => {
      await api('/promptos', { method: 'POST', body: JSON.stringify(values) });
      await loadPromptTemplates();
      e.target.reset();
    });
  });

  const list = mount.querySelector('#template-list');
  list.innerHTML = state.promptTemplates.length === 0
    ? '<p class="muted">No templates yet.</p>'
    : state.promptTemplates.map((t) => `
      <div class="card" data-id="${escapeHtml(t.id)}">
        <div class="meta">${t.slash_command ? escapeHtml(t.slash_command) + ' · ' : ''}${escapeHtml(t.category ?? 'uncategorized')}${t.is_starred ? ' · ★' : ''}</div>
        <div class="title">${escapeHtml(t.name)} <span class="muted">v${escapeHtml(t.current_version)}</span></div>
      </div>
    `).join('');

  list.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => guarded(() => selectTemplate(card.dataset.id)));
  });

  if (state.selectedTemplateId) renderTemplateDetail(mount);
}

function renderTemplateDetail(mount) {
  const panel = mount.querySelector('#template-detail');
  const t = state.selectedTemplate;
  if (!t) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  panel.innerHTML = `
    <h2>${escapeHtml(t.template.name)}</h2>
    <p class="muted">${escapeHtml(t.template.tagline ?? '')}</p>
    <pre>${escapeHtml(t.template.body_template)}</pre>
    <form id="edit-template-form">
      <label>New body (creates version ${t.template.current_version + 1})</label>
      <textarea class="code" name="bodyTemplate" rows="6">${escapeHtml(t.template.body_template)}</textarea>
      <label>Change note</label><input name="changeNote" />
      <div style="margin-top:0.5rem"><button class="primary" type="submit">Save new version</button></div>
    </form>
    <h3>Version history</h3>
    ${t.versions.map((v) => `<div class="card" style="cursor:default"><div class="meta">v${escapeHtml(v.version)} · ${escapeHtml(new Date(v.created_at).toLocaleString())}</div><div class="title">${escapeHtml(v.change_note ?? '—')}</div></div>`).join('')}
  `;

  panel.querySelector('#edit-template-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    guarded(async () => {
      await api(`/promptos/${encodeURIComponent(t.template.id)}`, { method: 'PATCH', body: JSON.stringify(values) });
      await selectTemplate(t.template.id);
      await loadPromptTemplates();
    });
  });
}

// ─── Analytics tab ───────────────────────────────────────────────────────────

async function loadCosts() {
  const data = await api('/dashboard/costs');
  state.costs = data;
}

function renderAnalyticsTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <div class="toolbar"><button id="refresh-costs">Refresh</button></div>
      <div id="analytics-body"></div>
    </div>
  `));

  mount.querySelector('#refresh-costs').addEventListener('click', () => guarded(loadCosts));

  const body = mount.querySelector('#analytics-body');
  if (!state.costs) { body.innerHTML = '<p class="muted">Loading…</p>'; return; }

  body.innerHTML = `
    <h2>Total spend: $${state.costs.totalUsd.toFixed(4)}</h2>
    <h3>By agent</h3>
    ${state.costs.byAgent.length === 0 ? '<p class="muted">No cost records yet.</p>' : state.costs.byAgent.map((a) => `
      <div class="card" style="cursor:default">
        <div class="meta">${escapeHtml(a.provider ?? 'unknown provider')} · ${escapeHtml(a.inputTokens)} in / ${escapeHtml(a.outputTokens)} out tokens</div>
        <div class="title">${escapeHtml(a.agentName)} — $${a.costUsd.toFixed(4)}</div>
      </div>
    `).join('')}
  `;
}

// ─── Terminal tab ────────────────────────────────────────────────────────────

function renderTerminalTab(mount) {
  mount.appendChild(el(`
    <div class="panel">
      <h2>Guarded terminal</h2>
      <p class="muted">Disabled by default (CONTROL_ROOM_TERMINAL_ENABLED). Loopback-only unless CONTROL_ROOM_TERMINAL_ALLOW_REMOTE is set.</p>
      <div class="row">
        <div><label>Project slug</label><input id="terminal-project-slug" value="${escapeHtml(state.terminal.projectSlug ?? '')}" /></div>
      </div>
      <div class="toolbar"><button id="terminal-load-commands">Load commands</button></div>
      <div id="terminal-commands"></div>
    </div>
    <div class="panel" id="terminal-run-panel" style="display:none"></div>
  `));

  mount.querySelector('#terminal-load-commands').addEventListener('click', () => {
    const slug = mount.querySelector('#terminal-project-slug').value.trim();
    guarded(async () => {
      state.terminal.projectSlug = slug;
      const data = await api(`/terminal/${encodeURIComponent(slug)}/commands`);
      state.terminal.commands = data.commands ?? [];
    });
  });

  const list = mount.querySelector('#terminal-commands');
  list.innerHTML = state.terminal.commands.length === 0
    ? '<p class="muted">No commands loaded.</p>'
    : state.terminal.commands.map((c) => `
      <div class="card" data-id="${escapeHtml(c.id)}">
        <div class="meta">risk: ${escapeHtml(c.risk)} · timeout ${escapeHtml(c.timeoutMs)}ms</div>
        <div class="title">${escapeHtml(c.label)}</div>
      </div>
    `).join('');

  list.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => showTerminalRunForm(mount, card.dataset.id));
  });
}

function showTerminalRunForm(mount, commandId) {
  const panel = mount.querySelector('#terminal-run-panel');
  panel.style.display = 'block';
  panel.innerHTML = `
    <h3>Run ${escapeHtml(commandId)}</h3>
    <form id="terminal-run-form">
      <label>Mission ID</label><input name="missionId" required />
      <label>Expected commit SHA (40 hex)</label><input name="expectedCommitSha" class="mono" required />
      <label><input type="checkbox" name="confirmWrite" style="width:auto; display:inline-block; margin-right:0.4rem;" />Confirm write-risk command</label>
      <div style="margin-top:0.5rem"><button class="primary" type="submit">Run</button></div>
    </form>
    <div id="terminal-run-result"></div>
  `;
  panel.querySelector('#terminal-run-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = formValues(e.target);
    guarded(async () => {
      const result = await api(`/terminal/${encodeURIComponent(state.terminal.projectSlug)}/run`, {
        method: 'POST',
        body: JSON.stringify({
          commandId,
          missionId: values.missionId,
          expectedCommitSha: values.expectedCommitSha,
          confirmWrite: values.confirmWrite === 'on',
        }),
      });
      panel.querySelector('#terminal-run-result').innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
    });
  });
}

// ─── boot ────────────────────────────────────────────────────────────────────

function render() {
  if (!state.session) return renderSignIn();
  return renderShell();
}

async function boot() {
  consumeHashSession();
  state.session = loadSession();
  render();

  if (!state.session) return;

  await guarded(async () => {
    await Promise.all([loadProjects(), loadMissions(), loadActivity(), loadL99(), loadPromptTemplates(), loadCosts(), loadAgents(), loadAuthorityLevels()]);
  });
}

boot();
