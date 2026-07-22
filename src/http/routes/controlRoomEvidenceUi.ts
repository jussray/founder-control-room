import { Router } from "express";
import { requireFounder } from "../middleware/requireFounder.js";

export const controlRoomEvidenceUiRouter = Router();

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Founder Control Room</title>
  <link rel="stylesheet" href="/control-room/evidence.css">
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">FOUNDER OPERATIONS</p>
      <h1>Repository Control Room</h1>
      <p class="subtitle">Exact-commit proof, code-use evidence, findings, and proposal-only build missions.</p>
    </div>
    <div class="topbar-actions">
      <span id="sessionLabel" class="session-label">Founder session</span>
      <button id="refreshAll" type="button" class="button secondary">Refresh</button>
      <button id="logout" type="button" class="button ghost">Sign out</button>
    </div>
  </header>

  <main>
    <section class="truth-banner" aria-label="Evidence legend">
      <div><strong>Signed proof</strong><span>Automated evidence authenticated by the configured provider or runner.</span></div>
      <div><strong>Manual preview · unsigned</strong><span>Founder-reviewed branch evidence. Useful now, but temporary and never production proof.</span></div>
      <div><strong>Proposal only</strong><span>A repair mission grants no branch, merge, deploy, rollback, secret, billing, or destructive authority.</span></div>
    </section>

    <section class="summary-grid" aria-label="Portfolio summary">
      <article><span id="repoCount" class="metric">—</span><small>Repositories</small></article>
      <article><span id="passedCount" class="metric">—</span><small>Passing proof</small></article>
      <article><span id="findingCount" class="metric">—</span><small>Open findings</small></article>
      <article><span id="missionCount" class="metric">—</span><small>Proposal/active missions</small></article>
    </section>

    <div id="notice" class="notice" role="status" aria-live="polite"></div>

    <section class="workspace">
      <aside>
        <div class="section-heading">
          <div>
            <p class="eyebrow">PORTFOLIO</p>
            <h2>Repositories</h2>
          </div>
        </div>
        <div id="repoList" class="repo-list" aria-live="polite"></div>
      </aside>

      <section class="detail-panel" aria-label="Selected repository detail">
        <div id="emptyDetail" class="empty-state">
          <h2>Select a repository</h2>
          <p>Open exact checks, capabilities, code-use assertions, findings, and proposed missions.</p>
        </div>
        <div id="detail" hidden>
          <div class="detail-header">
            <div>
              <p id="detailRepo" class="eyebrow"></p>
              <h2 id="detailTitle"></h2>
              <p id="detailCommit" class="mono"></p>
            </div>
            <div id="detailEvidence"></div>
          </div>

          <div class="action-row">
            <button id="verifyNow" type="button" class="button primary">Verify now</button>
            <button id="prepareMission" type="button" class="button secondary">Prepare repair mission</button>
          </div>

          <section>
            <h3>Required checks</h3>
            <div id="checks" class="stack"></div>
          </section>

          <section>
            <h3>Capabilities and code use</h3>
            <div id="capabilities" class="stack"></div>
          </section>

          <section>
            <h3>Open findings</h3>
            <div id="findings" class="stack"></div>
          </section>

          <section>
            <h3>Proposal and active missions</h3>
            <div id="missions" class="stack"></div>
          </section>
        </div>
      </section>
    </section>
  </main>

  <script src="/control-room/evidence.js" defer></script>
</body>
</html>`;

const CSS = `:root {
  color-scheme: dark;
  --bg: #07090f;
  --panel: #10141f;
  --panel-2: #151a28;
  --line: #283044;
  --text: #f6f7fb;
  --muted: #a7b0c3;
  --accent: #9c7cff;
  --good: #5ee0a0;
  --warn: #ffd166;
  --bad: #ff7b8d;
  --info: #7ac7ff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(circle at top left, #17122d 0, var(--bg) 42rem); color: var(--text); min-height: 100vh; }
button { font: inherit; }
.topbar { display: flex; justify-content: space-between; gap: 2rem; align-items: flex-start; padding: 2rem clamp(1rem, 4vw, 4rem); border-bottom: 1px solid var(--line); background: rgba(7,9,15,.88); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 5; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: .35rem; font-size: clamp(1.7rem, 4vw, 2.8rem); }
h2 { margin-bottom: .5rem; }
h3 { margin: 2rem 0 .75rem; font-size: 1rem; color: #d9ddef; }
.subtitle, .muted { color: var(--muted); }
.eyebrow { color: var(--accent); font-weight: 800; letter-spacing: .14em; font-size: .72rem; margin-bottom: .45rem; }
.topbar-actions, .action-row { display: flex; flex-wrap: wrap; gap: .7rem; align-items: center; }
.session-label { color: var(--muted); font-size: .85rem; }
main { padding: 1.4rem clamp(1rem, 4vw, 4rem) 4rem; }
.truth-banner { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 1px; border: 1px solid var(--line); background: var(--line); border-radius: 14px; overflow: hidden; margin-bottom: 1.2rem; }
.truth-banner div { background: rgba(16,20,31,.94); padding: 1rem; display: grid; gap: .35rem; }
.truth-banner span { color: var(--muted); font-size: .82rem; line-height: 1.45; }
.summary-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .8rem; margin-bottom: 1.2rem; }
.summary-grid article { padding: 1rem 1.1rem; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.metric { display: block; font-size: 1.55rem; font-weight: 850; }
.summary-grid small { color: var(--muted); }
.notice { min-height: 1.4rem; color: var(--info); margin: .4rem 0 1rem; }
.notice.error { color: var(--bad); }
.workspace { display: grid; grid-template-columns: minmax(280px, 390px) minmax(0, 1fr); gap: 1rem; align-items: start; }
aside, .detail-panel { background: rgba(16,20,31,.92); border: 1px solid var(--line); border-radius: 16px; padding: 1rem; }
.detail-panel { min-height: 600px; }
.repo-list, .stack { display: grid; gap: .7rem; }
.repo-card { width: 100%; text-align: left; color: var(--text); background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: .9rem; cursor: pointer; }
.repo-card:hover, .repo-card.selected { border-color: var(--accent); transform: translateY(-1px); }
.repo-title, .row-head, .detail-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.repo-title strong { overflow-wrap: anywhere; }
.repo-meta { display: grid; gap: .35rem; margin-top: .65rem; color: var(--muted); font-size: .78rem; }
.repo-metrics { display: flex; gap: .55rem; flex-wrap: wrap; margin-top: .65rem; font-size: .75rem; }
.badge { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid currentColor; padding: .22rem .52rem; font-size: .7rem; font-weight: 800; white-space: nowrap; }
.badge.good { color: var(--good); }
.badge.warn { color: var(--warn); }
.badge.bad { color: var(--bad); }
.badge.info { color: var(--info); }
.badge.muted { color: var(--muted); }
.item { background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; padding: .85rem; }
.item p { color: var(--muted); margin: .45rem 0 0; font-size: .82rem; line-height: 1.45; overflow-wrap: anywhere; }
.item .mono { margin-top: .5rem; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); font-size: .78rem; overflow-wrap: anywhere; }
.button { border-radius: 9px; border: 1px solid transparent; padding: .65rem .85rem; cursor: pointer; font-weight: 800; }
.button:disabled { opacity: .5; cursor: wait; }
.button.primary { background: var(--accent); color: #0c0718; }
.button.secondary { background: #20263a; color: var(--text); border-color: var(--line); }
.button.ghost { background: transparent; color: var(--muted); border-color: var(--line); }
.action-row { padding: 1rem 0 .2rem; border-bottom: 1px solid var(--line); }
.empty-state { display: grid; place-content: center; min-height: 540px; text-align: center; color: var(--muted); }
.empty-state h2 { color: var(--text); }
@media (max-width: 900px) {
  .topbar { position: static; flex-direction: column; }
  .truth-banner, .summary-grid { grid-template-columns: 1fr 1fr; }
  .workspace { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .truth-banner, .summary-grid { grid-template-columns: 1fr; }
  main { padding-inline: .75rem; }
  .topbar { padding-inline: 1rem; }
}`;

const JS = `(() => {
  'use strict';
  const state = { repositories: [], selectedSlug: null, detail: null };
  const byId = (id) => document.getElementById(id);

  function cookie(name) {
    const prefix = name + '=';
    const pair = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
    return pair ? decodeURIComponent(pair.slice(prefix.length)) : '';
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
      headers.set('x-csrf-token', cookie('fcr_csrf'));
    }
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.assign('/control-room/login');
      throw new Error('Founder session required');
    }
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = { error: raw }; }
    }
    if (!response.ok) throw new Error(payload?.detail || payload?.error || ('Request failed: ' + response.status));
    return payload;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function badge(text, tone) {
    return element('span', 'badge ' + tone, text);
  }

  function evidenceBadge(evidence) {
    if (evidence?.kind === 'signed') return badge('Signed proof', 'good');
    if (evidence?.kind === 'manual_preview') return badge('Manual preview · unsigned', 'warn');
    if (evidence?.kind === 'unsigned') return badge('Unsigned evidence', 'bad');
    return badge('No evidence', 'muted');
  }

  function statusBadge(status) {
    if (status === 'passed' || status === 'verified') return badge(status, 'good');
    if (status === 'failed' || status === 'drifted') return badge(status, 'bad');
    return badge(status || 'unknown', 'warn');
  }

  function setNotice(message, error = false) {
    const node = byId('notice');
    node.textContent = message || '';
    node.className = error ? 'notice error' : 'notice';
  }

  function shortSha(value) {
    return value ? String(value).slice(0, 12) : 'no commit';
  }

  function renderSummary() {
    byId('repoCount').textContent = String(state.repositories.length);
    byId('passedCount').textContent = String(state.repositories.filter((repo) => repo.latestRun?.overall_status === 'passed').length);
    byId('findingCount').textContent = String(state.repositories.reduce((sum, repo) => sum + (repo.findings?.total || 0), 0));
    byId('missionCount').textContent = String(state.repositories.reduce((sum, repo) => sum + (repo.openMissions?.length || 0), 0));
  }

  function renderRepositories() {
    const list = byId('repoList');
    clear(list);
    for (const repo of state.repositories) {
      const card = element('button', 'repo-card' + (repo.slug === state.selectedSlug ? ' selected' : ''));
      card.type = 'button';
      card.addEventListener('click', () => selectRepository(repo.slug));

      const title = element('div', 'repo-title');
      title.append(element('strong', '', repo.name || repo.slug), evidenceBadge(repo.evidence));
      card.append(title);

      const meta = element('div', 'repo-meta');
      meta.append(
        element('span', 'mono', repo.repository?.identifier || ''),
        element('span', '', (repo.evidence?.branch || 'no branch') + ' · ' + shortSha(repo.latestRun?.commit_sha)),
      );
      card.append(meta);

      const metrics = element('div', 'repo-metrics');
      metrics.append(
        badge((repo.capabilities?.verified || 0) + '/' + (repo.capabilities?.total || 0) + ' capabilities', repo.capabilities?.drifted ? 'bad' : 'info'),
        badge(((repo.capabilities?.usageAssertions || 0) - (repo.capabilities?.failedUsageAssertions || 0)) + '/' + (repo.capabilities?.usageAssertions || 0) + ' code-use', repo.capabilities?.failedUsageAssertions ? 'bad' : 'info'),
        badge((repo.findings?.total || 0) + ' findings', repo.findings?.total ? 'bad' : 'good'),
        badge((repo.openMissions?.length || 0) + ' missions', repo.openMissions?.length ? 'warn' : 'muted'),
      );
      card.append(metrics);
      list.append(card);
    }
  }

  function itemRow(titleText, status, detail, extra) {
    const row = element('article', 'item');
    const head = element('div', 'row-head');
    head.append(element('strong', '', titleText), statusBadge(status));
    row.append(head);
    if (detail) row.append(element('p', '', detail));
    if (extra) row.append(element('div', 'mono', extra));
    return row;
  }

  function renderDetail() {
    const repo = state.repositories.find((candidate) => candidate.slug === state.selectedSlug);
    const detail = state.detail;
    if (!repo || !detail) return;

    byId('emptyDetail').hidden = true;
    byId('detail').hidden = false;
    byId('detailRepo').textContent = repo.repository?.identifier || repo.slug;
    byId('detailTitle').textContent = repo.name || repo.slug;
    byId('detailCommit').textContent = (repo.evidence?.branch || detail.latestRun?.branch || 'unknown branch') + ' · ' + (detail.latestRun?.commit_sha || 'no commit');
    const evidence = byId('detailEvidence');
    clear(evidence);
    evidence.append(evidenceBadge(repo.evidence));

    const checks = byId('checks');
    clear(checks);
    const checkRows = detail.latestRun?.checks || [];
    if (!checkRows.length) checks.append(itemRow('No check evidence', 'unknown', 'No exact-commit check evidence is stored yet.'));
    for (const check of checkRows) {
      checks.append(itemRow(check.name || check.id, check.status, check.reason || (check.required ? 'Required check' : 'Optional check'), check.id));
    }

    const capabilities = byId('capabilities');
    clear(capabilities);
    if (!detail.capabilities?.length) capabilities.append(itemRow('No capability evidence', 'unknown'));
    for (const capability of detail.capabilities || []) {
      const usage = capability.usage_assertion_ids || [];
      const failedUsage = capability.failed_usage_assertion_ids || [];
      const usageText = usage.length
        ? (usage.length - failedUsage.length) + '/' + usage.length + ' code-use assertions passed'
        : 'No code-use assertions declared';
      const failedText = failedUsage.length ? ' · Failed: ' + failedUsage.join(', ') : '';
      capabilities.append(itemRow(
        capability.capability_id,
        capability.observed_status,
        capability.reason || usageText,
        usageText + failedText,
      ));
    }

    const findings = byId('findings');
    clear(findings);
    if (!detail.findings?.length) findings.append(itemRow('No open findings', 'verified', 'The stored evidence has no unresolved finding.'));
    for (const finding of detail.findings || []) {
      findings.append(itemRow(
        finding.title,
        finding.severity,
        finding.detail || finding.suggested_action,
        finding.fingerprint + (finding.mission_id ? ' · Mission assigned' : ' · No mission assigned'),
      ));
    }

    const missions = byId('missions');
    clear(missions);
    if (!repo.openMissions?.length) missions.append(itemRow('No proposal or active mission', 'unknown', 'Preparing a mission remains a separate founder action.'));
    for (const mission of repo.openMissions || []) {
      missions.append(itemRow(
        mission.title || 'Repository repair mission',
        mission.status,
        'Risk: ' + (mission.risk_level || 'unknown') + ' · Builder: ' + (mission.builder_agent || 'founder/manual'),
        'Base: ' + (mission.base_ref || 'main') + ' · Proposal does not authorize execution',
      ));
    }
  }

  async function loadPortfolio({ preserveSelection = true } = {}) {
    setNotice('Refreshing portfolio evidence…');
    const [portfolio, session] = await Promise.all([
      request('/portfolio/repositories'),
      request('/auth/session'),
    ]);
    state.repositories = portfolio.repositories || [];
    byId('sessionLabel').textContent = session?.founder?.email || 'Founder session';
    if (!preserveSelection || !state.repositories.some((repo) => repo.slug === state.selectedSlug)) {
      state.selectedSlug = state.repositories[0]?.slug || null;
      state.detail = null;
    }
    renderSummary();
    renderRepositories();
    if (state.selectedSlug) await selectRepository(state.selectedSlug, false);
    setNotice('Evidence refreshed ' + new Date(portfolio.generatedAt).toLocaleString());
  }

  async function selectRepository(slug, announce = true) {
    state.selectedSlug = slug;
    renderRepositories();
    if (announce) setNotice('Loading ' + slug + ' evidence…');
    state.detail = await request('/projects/' + encodeURIComponent(slug) + '/verification');
    renderDetail();
    if (announce) setNotice('Loaded exact repository evidence.');
  }

  async function runAction(button, action) {
    const previous = button.textContent;
    button.disabled = true;
    try {
      await action();
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  byId('refreshAll').addEventListener('click', () => loadPortfolio());
  byId('verifyNow').addEventListener('click', () => runAction(byId('verifyNow'), async () => {
    byId('verifyNow').textContent = 'Verifying…';
    setNotice('Running exact-commit verification…');
    await request('/projects/' + encodeURIComponent(state.selectedSlug) + '/verification/scan', {
      method: 'POST',
      body: '{}',
    });
    await loadPortfolio();
    setNotice('Verification completed.');
  }).catch((error) => setNotice(error.message, true)));
  byId('prepareMission').addEventListener('click', () => runAction(byId('prepareMission'), async () => {
    byId('prepareMission').textContent = 'Preparing…';
    setNotice('Preparing a proposal-only repair mission…');
    await request('/projects/' + encodeURIComponent(state.selectedSlug) + '/verification/propose-mission', {
      method: 'POST',
      body: '{}',
    });
    await loadPortfolio();
    setNotice('Proposed mission created. No execution authority was granted.');
  }).catch((error) => setNotice(error.message, true)));
  byId('logout').addEventListener('click', async () => {
    try {
      await request('/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      window.location.assign('/control-room/login');
    }
  });

  loadPortfolio({ preserveSelection: false }).catch((error) => setNotice(error.message, true));
})();`;

controlRoomEvidenceUiRouter.get("/evidence.css", (_req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(CSS);
});

controlRoomEvidenceUiRouter.get("/evidence.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JS);
});

controlRoomEvidenceUiRouter.get("/", requireFounder, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.send(PAGE);
});
