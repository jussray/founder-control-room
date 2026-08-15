const root = document.querySelector('#switchboard-root');
const dialog = document.querySelector('#switch-confirm');
const confirmForm = document.querySelector('#confirm-form');
const confirmTitle = document.querySelector('#confirm-title');
const confirmSummary = document.querySelector('#confirm-summary');
const confirmBoundary = document.querySelector('#confirm-boundary');
const confirmSubmit = document.querySelector('#confirm-submit');
const confirmStatus = document.querySelector('#confirm-status');
const switchReason = document.querySelector('#switch-reason');
const SESSION_KEY = 'fcr_session';
const MASTER_SWITCH_ID = 'fcr-privileged-execution-master';

const state = {
  switches: [],
  semantics: {},
  repositoryHeads: new Map(),
  query: '',
  project: 'all',
  desired: 'all',
  mode: 'all',
  pending: null,
  historyOpen: new Set(),
  history: new Map(),
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function accessToken() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')?.access_token ?? null;
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const token = accessToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('founder_auth_required');
    error.auth = true;
    throw error;
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.detail || body?.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return body;
}

function signInBoundary() {
  root.innerHTML = `<section class="signin-state">
    <p class="eyebrow">FOUNDER-ONLY CONTROL PLANE</p>
    <h1>Switchboard locked.</h1>
    <p>Sign in through Founder Control Room before reading or changing portfolio authority state.</p>
    <a href="/control-room/">Return to sign in</a>
  </section>`;
}

function unavailableBoundary(message = 'The switchboard could not be loaded.') {
  root.innerHTML = `<section class="error-state">
    <p class="eyebrow">FAIL CLOSED</p>
    <h1>Switchboard unavailable.</h1>
    <p>${escapeHtml(message)} No provider or execution state was changed.</p>
    <a href="/control-room/">Return to Control Room</a>
  </section>`;
}

function modeLabel(mode) {
  return mode === 'enforced' ? 'FCR enforced' : mode === 'locked_off' ? 'Locked off' : 'Observe only';
}

function desiredLabel(value) {
  return value === 'on' ? 'Desired ON' : 'Desired OFF';
}

function stageLabel(value) {
  if (value === 'yes') return 'YES';
  if (value === 'partial') return 'PARTIAL';
  if (value === 'no') return 'NO';
  return 'UNKNOWN';
}

function auditState(item) {
  if (!item.repository || !item.auditedSha) return { state: 'current', label: 'Portfolio audit' };
  const head = state.repositoryHeads.get(item.repository);
  if (!head) return { state: 'unknown', label: 'Current head unknown' };
  if (head === item.auditedSha) return { state: 'current', label: 'Exact-head audit' };
  return { state: 'stale', label: 'Main moved since audit' };
}

function currentHead(item) {
  return item.repository ? state.repositoryHeads.get(item.repository) ?? null : null;
}

function stageMarkup(item) {
  return [['built', 'BUILT'], ['configured', 'CONFIGURED'], ['active', 'ACTIVE'], ['proven', 'PROVEN']]
    .map(([key, label]) => `<div class="stage" data-state="${escapeHtml(item.stages[key])}">
      <span>${label}</span><strong>${stageLabel(item.stages[key])}</strong>
    </div>`).join('');
}

function toggleMarkup(item, idPrefix = 'switch') {
  const locked = item.controlMode === 'locked_off';
  return `<div class="toggle-wrap">
    <span class="toggle-label">${escapeHtml(desiredLabel(item.desiredState))}</span>
    <button
      id="${idPrefix}-${escapeHtml(item.id)}"
      class="switch-toggle"
      type="button"
      role="switch"
      aria-label="${escapeHtml(item.label)}. ${escapeHtml(desiredLabel(item.desiredState))}."
      aria-checked="${item.desiredState === 'on' ? 'true' : 'false'}"
      data-switch-toggle="${escapeHtml(item.id)}"
      ${locked ? 'disabled aria-disabled="true"' : ''}
    >${escapeHtml(desiredLabel(item.desiredState))}</button>
    <span class="switch-state-copy">${item.desiredState === 'on' ? 'ON' : 'OFF'}${locked ? ' · locked' : ''}</span>
  </div>`;
}

function detailMarkup(label, value, className = '') {
  if (!value) return '';
  return `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd class="${className}">${escapeHtml(value)}</dd></div>`;
}

function historyMarkup(item) {
  if (!state.historyOpen.has(item.id)) return '';
  const history = state.history.get(item.id);
  if (!history) return `<div class="history-panel"><p class="muted">Loading switch receipts…</p></div>`;
  if (!history.length) return `<div class="history-panel"><p class="muted">No founder override receipt yet. The catalog default is still in effect.</p></div>`;
  return `<div class="history-panel"><div class="history-list">
    ${history.map(event => `<div class="history-event">
      <strong>${escapeHtml(String(event.previous_state).toUpperCase())} → ${escapeHtml(String(event.desired_state).toUpperCase())}</strong>
      · ${escapeHtml(event.actor_email || 'founder')}
      · ${escapeHtml(new Date(event.created_at).toLocaleString())}
      ${event.reason ? `<br>${escapeHtml(event.reason)}` : ''}
    </div>`).join('')}
  </div></div>`;
}

function switchCard(item) {
  const audit = auditState(item);
  const observedHead = currentHead(item);
  const override = item.override
    ? `Override saved${item.updatedAt ? ` ${new Date(item.updatedAt).toLocaleString()}` : ''}${item.updatedBy ? ` by ${item.updatedBy}` : ''}`
    : 'Catalog default in effect';

  return `<article class="switch-card" data-switch-id="${escapeHtml(item.id)}" data-desired="${escapeHtml(item.desiredState)}" data-audit="${audit.state}">
    <div class="card-head">
      <div>
        <p class="eyebrow">${escapeHtml(item.group.toUpperCase())}</p>
        <h3>${escapeHtml(item.label)}</h3>
        <p class="card-summary">${escapeHtml(item.summary)}</p>
        <div class="badge-row">
          <span class="badge" data-mode="${escapeHtml(item.controlMode)}">${escapeHtml(modeLabel(item.controlMode))}</span>
          <span class="badge" data-audit="${audit.state}">${escapeHtml(audit.label)}</span>
        </div>
      </div>
      ${toggleMarkup(item)}
    </div>
    <div class="stage-grid" aria-label="Capability lifecycle">${stageMarkup(item)}</div>
    <dl class="card-details">
      ${detailMarkup('Repository', item.repository)}
      ${detailMarkup('Audit SHA', item.auditedSha, 'audit-sha')}
      ${observedHead && observedHead !== item.auditedSha ? detailMarkup('Current receipt SHA', observedHead, 'audit-sha') : ''}
      ${detailMarkup('Evidence', item.evidenceRef)}
      ${detailMarkup('Blocker', item.blocker, 'blocker')}
      ${detailMarkup('OFF means', item.offEffect, 'off-effect')}
      ${detailMarkup('ON gate', item.onCondition, 'on-condition')}
      ${item.reason ? detailMarkup('Founder reason', item.reason) : ''}
    </dl>
    <div class="card-footer">
      <span class="override-copy">${escapeHtml(override)}</span>
      <button class="history-button" type="button" data-history="${escapeHtml(item.id)}">${state.historyOpen.has(item.id) ? 'Hide history' : 'History'}</button>
    </div>
    ${historyMarkup(item)}
  </article>`;
}

function filteredSwitches() {
  const query = state.query.trim().toLowerCase();
  return state.switches.filter(item => {
    const searchable = `${item.project} ${item.repository || ''} ${item.label} ${item.summary} ${item.group} ${item.blocker || ''}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (state.project === 'all' || item.project === state.project)
      && (state.desired === 'all' || item.desiredState === state.desired)
      && (state.mode === 'all' || item.controlMode === state.mode);
  });
}

function summaryMarkup() {
  const total = state.switches.length;
  const desiredOn = state.switches.filter(item => item.desiredState === 'on').length;
  const desiredOff = total - desiredOn;
  const locked = state.switches.filter(item => item.controlMode === 'locked_off').length;
  const stale = state.switches.filter(item => auditState(item).state !== 'current').length;
  return `<section class="summary-grid" aria-label="Switchboard summary">
    ${[['Switches', total], ['Desired ON', desiredOn], ['Desired OFF', desiredOff], ['Locked OFF', locked], ['Audit drift', stale]]
      .map(([label, value]) => `<article class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}
  </section>`;
}

function toolbarMarkup() {
  const projects = [...new Set(state.switches.map(item => item.project))].sort();
  return `<section class="toolbar" aria-label="Switchboard filters">
    <label>Search
      <input id="switch-search" type="search" autocomplete="off" value="${escapeHtml(state.query)}" placeholder="Bridge, Cloudflare, store release…" />
    </label>
    <label>Project
      <select id="project-filter"><option value="all">All projects</option>${projects.map(project => `<option value="${escapeHtml(project)}" ${state.project === project ? 'selected' : ''}>${escapeHtml(project)}</option>`).join('')}</select>
    </label>
    <label>Desired state
      <select id="desired-filter">
        <option value="all">ON + OFF</option>
        <option value="on" ${state.desired === 'on' ? 'selected' : ''}>Desired ON</option>
        <option value="off" ${state.desired === 'off' ? 'selected' : ''}>Desired OFF</option>
      </select>
    </label>
    <label>Control mode
      <select id="mode-filter">
        <option value="all">All modes</option>
        <option value="enforced" ${state.mode === 'enforced' ? 'selected' : ''}>FCR enforced</option>
        <option value="observe_only" ${state.mode === 'observe_only' ? 'selected' : ''}>Observe only</option>
        <option value="locked_off" ${state.mode === 'locked_off' ? 'selected' : ''}>Locked off</option>
      </select>
    </label>
  </section>`;
}

function render() {
  const master = state.switches.find(item => item.id === MASTER_SWITCH_ID);
  const visible = filteredSwitches().filter(item => item.id !== MASTER_SWITCH_ID);
  const groups = new Map();
  visible.forEach(item => {
    if (!groups.has(item.project)) groups.set(item.project, []);
    groups.get(item.project).push(item);
  });

  root.innerHTML = `<div class="shell">
    <header class="topbar">
      <div class="header-copy">
        <a class="brand-link" href="/control-room/">← Founder Control Room</a>
        <p class="eyebrow">PHYSICAL CONTROL PLANE</p>
        <h1>Founder Switchboard</h1>
        <p>See what your company can do, what is actually configured, what is live, and what has proof. Your desired OFF state is durable. Provider systems are never silently mutated from an observe-only switch.</p>
      </div>
    </header>

    <section class="boundary-banner" aria-label="Switch semantics">
      <div class="boundary-card" data-mode="enforced"><strong>FCR ENFORCED</strong><span>${escapeHtml(state.semantics.enforced || 'OFF blocks an FCR execution path.')}</span></div>
      <div class="boundary-card" data-mode="observe_only"><strong>OBSERVE ONLY</strong><span>${escapeHtml(state.semantics.observe_only || 'Records founder intent. External provider is unchanged.')}</span></div>
      <div class="boundary-card" data-mode="locked_off"><strong>LOCKED OFF</strong><span>${escapeHtml(state.semantics.locked_off || 'Requires a code-reviewed activation gate before ON becomes available.')}</span></div>
    </section>

    ${master ? `<section class="master-card" data-desired="${master.desiredState}" data-switch-id="${MASTER_SWITCH_ID}">
      <div>
        <p class="eyebrow">MASTER EXECUTION GATE · FCR ENFORCED</p>
        <h2>${escapeHtml(master.label)}</h2>
        <p class="master-copy">${escapeHtml(master.summary)}</p>
        <div class="master-meta">
          <span class="badge" data-mode="enforced">Real server gate</span>
          <span class="badge" data-audit="${auditState(master).state}">${escapeHtml(auditState(master).label)}</span>
        </div>
      </div>
      ${toggleMarkup(master, 'master')}
    </section>` : ''}

    ${summaryMarkup()}
    ${toolbarMarkup()}

    <section id="switch-results" aria-live="polite">
      ${visible.length ? [...groups.entries()].map(([project, items]) => `<section class="project-group">
        <div class="project-heading"><h2>${escapeHtml(project)}</h2><span>${items.length} switch${items.length === 1 ? '' : 'es'}</span></div>
        <div class="switch-grid">${items.map(switchCard).join('')}</div>
      </section>`).join('') : `<div class="empty-state"><p class="eyebrow">NO MATCHES</p><h1>No switches in this view.</h1><p>Change the search or filters. No capability state was changed.</p></div>`}
    </section>
  </div>`;

  bindControls();
}

function bindControls() {
  document.querySelector('#switch-search')?.addEventListener('input', event => {
    state.query = event.target.value;
    render();
    const input = document.querySelector('#switch-search');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
  document.querySelector('#project-filter')?.addEventListener('change', event => { state.project = event.target.value; render(); });
  document.querySelector('#desired-filter')?.addEventListener('change', event => { state.desired = event.target.value; render(); });
  document.querySelector('#mode-filter')?.addEventListener('change', event => { state.mode = event.target.value; render(); });
  document.querySelectorAll('[data-switch-toggle]').forEach(button => button.addEventListener('click', () => openConfirmation(button.dataset.switchToggle)));
  document.querySelectorAll('[data-history]').forEach(button => button.addEventListener('click', () => toggleHistory(button.dataset.history)));
}

function openConfirmation(switchId) {
  const item = state.switches.find(candidate => candidate.id === switchId);
  if (!item || item.controlMode === 'locked_off') return;
  const target = item.desiredState === 'on' ? 'off' : 'on';
  state.pending = { switchId, target };
  switchReason.value = '';
  confirmStatus.textContent = '';
  confirmTitle.textContent = `${target === 'off' ? 'Turn OFF' : 'Set desired ON'}: ${item.label}`;
  confirmSummary.textContent = target === 'off' ? item.offEffect : item.onCondition;
  confirmBoundary.textContent = item.controlMode === 'enforced'
    ? 'This switch is FCR enforced. Turning it OFF changes a real Founder Control Room execution gate. It still does not mutate an external provider.'
    : 'This is observe-only authority. The founder intent is persisted, but Cloudflare, Supabase, Shopify, GitHub, n8n, or other providers are not changed by this action.';
  confirmSubmit.textContent = target === 'off' ? 'Turn OFF' : 'Set desired ON';
  confirmSubmit.className = target === 'off' ? 'danger-button' : 'on-button';
  dialog.showModal();
}

confirmForm?.addEventListener('submit', async event => {
  const submitter = event.submitter;
  if (!state.pending || submitter?.value === 'cancel') {
    state.pending = null;
    return;
  }
  event.preventDefault();
  confirmSubmit.disabled = true;
  confirmStatus.textContent = 'Writing state + evidence receipt atomically…';
  try {
    const payload = await api(`/switchboard/${encodeURIComponent(state.pending.switchId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ desiredState: state.pending.target, reason: switchReason.value }),
    });
    const index = state.switches.findIndex(item => item.id === payload.switch.id);
    if (index >= 0) state.switches[index] = payload.switch;
    const changedId = payload.switch.id;
    state.history.delete(changedId);
    state.pending = null;
    dialog.close();
    render();
    requestAnimationFrame(() => document.querySelector(`[data-switch-toggle="${CSS.escape(changedId)}"]`)?.focus());
  } catch (error) {
    confirmStatus.textContent = error.message;
  } finally {
    confirmSubmit.disabled = false;
  }
});

async function toggleHistory(switchId) {
  if (state.historyOpen.has(switchId)) {
    state.historyOpen.delete(switchId);
    render();
    return;
  }
  state.historyOpen.add(switchId);
  render();
  if (state.history.has(switchId)) return;
  try {
    const payload = await api(`/switchboard/${encodeURIComponent(switchId)}/history`);
    state.history.set(switchId, Array.isArray(payload.history) ? payload.history : []);
  } catch (error) {
    state.history.set(switchId, [{
      previous_state: '?', desired_state: '?', actor_email: 'unavailable',
      created_at: new Date().toISOString(), reason: error.message,
    }]);
  }
  render();
}

async function load() {
  try {
    const [switchboard, portfolio] = await Promise.all([
      api('/switchboard'),
      api('/portfolio/repositories').catch(error => error.auth ? Promise.reject(error) : ({ repositories: [] })),
    ]);
    if (!Array.isArray(switchboard?.switches)) return unavailableBoundary('The switch catalog response was invalid.');
    state.switches = switchboard.switches;
    state.semantics = switchboard.semantics || {};
    state.repositoryHeads = new Map(
      (portfolio?.repositories || [])
        .filter(repository => repository?.repository?.identifier && repository?.latestRun?.commit_sha)
        .map(repository => [repository.repository.identifier, repository.latestRun.commit_sha]),
    );
    render();
  } catch (error) {
    if (error.auth) return signInBoundary();
    unavailableBoundary(error.message);
  }
}

void load();
