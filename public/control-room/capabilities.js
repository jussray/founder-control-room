const root = document.querySelector('#capabilities-root');
const SESSION_KEY = 'fcr_session';
const state = { capabilities: [], query: '', category: 'all', selectedId: null, copied: false };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function unavailableBoundary() {
  root.innerHTML = `<section class="signin"><div><p class="eyebrow">Founder Control Room</p><h1>Capabilities are temporarily unavailable.</h1><p>The registry could not be loaded. Return to the Control Room and try again.</p><a href="/control-room/">Return to Control Room</a></div></section>`;
}

async function loadCapabilities() {
  let accessToken = null;
  try {
    accessToken = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')?.access_token ?? null;
  } catch {
    accessToken = null;
  }

  try {
    const response = await fetch('/capabilities', {
      credentials: 'same-origin',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    if (response.status === 401 || response.status === 403) return signInBoundary();
    if (!response.ok) return unavailableBoundary();

    const body = await response.json().catch(() => null);
    if (!Array.isArray(body?.capabilities)) return unavailableBoundary();

    state.capabilities = body.capabilities;
    state.selectedId = state.capabilities[0]?.id ?? null;
    render();
  } catch {
    unavailableBoundary();
  }
}

function filtered() {
  const query = state.query.trim().toLowerCase();
  return state.capabilities.filter(capability =>
    (state.category === 'all' || capability.category === state.category) &&
    (!query || `${capability.id.replaceAll('-', ' ')} ${capability.kind} ${capability.summary} ${capability.purpose}`.toLowerCase().includes(query))
  );
}

function signInBoundary() {
  root.innerHTML = `<section class="signin"><div><p class="eyebrow">Founder Control Room</p><h1>Capabilities are founder-only.</h1><p>This workbench contains reviewed operating patterns. Sign in through the Control Room to inspect or copy them.</p><a href="/control-room/">Return to sign in</a></div></section>`;
}

function render() {
  const results = filtered();
  if (!results.some(item => item.id === state.selectedId)) state.selectedId = results[0]?.id ?? null;
  const selected = state.capabilities.find(item => item.id === state.selectedId);

  root.innerHTML = `
    <div class="workbench">
      <header class="workbench-header">
        <a href="/control-room/" class="brand">Founder Control Room</a>
        <span>Capabilities Workbench</span>
        <a href="/control-room/capital-decision.html">Capital Decision</a>
        <a href="/guardrails" class="guardrail-link">Guardrails</a>
      </header>
      <section class="search-area" aria-label="Capability search">
        <label for="capability-search">Search reviewed capabilities</label>
        <input id="capability-search" value="${escapeHtml(state.query)}" placeholder="verify webhook hmac" autocomplete="off" />
        <div class="filters" role="group" aria-label="Capability category">
          ${[['all','All'],['automations','Automations'],['prompts','Prompts'],['contracts','Contracts'],['integrations','Integrations']].map(([id,label]) => `<button data-category="${id}" class="${state.category === id ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </section>
      <div class="workspace">
        <aside class="results" aria-label="Search results">
          <div class="results-label"><span>Results</span><strong>${results.length}</strong></div>
          <div class="result-list">
            ${results.length ? results.map(item => `<button class="result ${item.id === state.selectedId ? 'selected' : ''}" data-id="${escapeHtml(item.id)}"><span class="result-kind">${escapeHtml(item.kind)}</span><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.summary)}</span><small>${item.score}</small></button>`).join('') : '<p class="empty">No reviewed capability matches this search.</p>'}
          </div>
          <p class="keyboard-help">Use Tab to move · Enter to select</p>
        </aside>
        <article class="detail" aria-live="polite">
          ${selected ? detail(selected) : '<div class="empty-detail"><h2>No capability selected</h2><p>Change the search or category to continue.</p></div>'}
        </article>
      </div>
    </div>`;

  document.querySelector('#capability-search')?.addEventListener('input', event => { state.query = event.target.value; render(); document.querySelector('#capability-search')?.focus(); });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => { state.selectedId = button.dataset.id; state.copied = false; render(); }));
  document.querySelector('#copy-implementation')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(selected.implementation); state.copied = true; render(); }
    catch { state.copied = false; document.querySelector('#copy-status').textContent = 'Copy blocked by the browser. Select the code manually.'; }
  });
}

function detail(item) {
  return `<div class="detail-head"><div><p class="eyebrow">${escapeHtml(item.kind)}</p><h1>${escapeHtml(item.id)}</h1><p>${escapeHtml(item.summary)}</p></div><span class="updated">Reviewed<br>Aug 13, 2026</span></div>
    <section><h2>Purpose</h2><p>${escapeHtml(item.purpose)}</p></section>
    <section><h2>Inputs</h2><div class="contract">${item.inputs.map(([name,type,description]) => `<div><code>${escapeHtml(name)}</code><span>${escapeHtml(type)}</span><p>${escapeHtml(description)}</p></div>`).join('')}</div></section>
    <section><h2>Environment</h2><ul>${item.environment.map(value => `<li><code>${escapeHtml(value)}</code></li>`).join('')}</ul></section>
    <section class="proof"><div><h2>Proof status <span>Reviewed fixture</span></h2><p>${item.proof.map(escapeHtml).join(' · ')}</p></div><strong>Local proof required after copy</strong></section>
    <section><h2>Risk boundary</h2><p>${escapeHtml(item.risk)}</p></section>
    <details class="implementation"><summary>Preview implementation</summary><pre tabindex="0">${escapeHtml(item.implementation)}</pre></details>
    <footer class="detail-actions"><button id="copy-implementation" class="copy">${state.copied ? 'Copied' : 'Copy implementation'}</button><p id="copy-status" role="status">${state.copied ? 'Copied. Execution still requires an FCR mission and proof gate.' : 'Copy only. No action runs from this screen.'}</p></footer>`;
}

void loadCapabilities();
