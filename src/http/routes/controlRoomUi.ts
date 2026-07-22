import { Router, type Response } from "express";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const controlRoomUiRouter = Router();

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Founder Control Room — Sign in</title>
  <link rel="stylesheet" href="/control-room/styles.css">
</head>
<body class="login-page">
  <main class="login-card">
    <p class="eyebrow">FOUNDER-ONLY OPERATIONS</p>
    <h1>Founder Control Room</h1>
    <p class="muted">Verify every repository without mixing product code, user data, or deployment authority.</p>
    <form id="login-form" class="stack">
      <label for="email">Founder email</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <button type="submit">Send secure magic link</button>
    </form>
    <p id="login-message" class="status-copy" role="status"></p>
  </main>
  <script src="/control-room/login.js" defer></script>
</body>
</html>`;

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Founder Control Room</title>
  <link rel="stylesheet" href="/control-room/styles.css">
</head>
<body>
  <header class="topbar">
    <div>
      <p class="eyebrow">PORTFOLIO REPOSITORY TRUTH</p>
      <h1>Founder Control Room</h1>
    </div>
    <div class="topbar-actions">
      <span id="sync-status" class="sync-status">Loading…</span>
      <button id="refresh-button" class="secondary" type="button">Refresh</button>
      <button id="logout-button" class="secondary" type="button">Sign out</button>
    </div>
  </header>

  <main class="dashboard-shell">
    <section id="summary" class="summary-grid" aria-label="Portfolio summary"></section>

    <section class="workspace">
      <div class="panel repository-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">REGISTERED REPOSITORIES</p>
            <h2>Portfolio</h2>
          </div>
          <span id="generated-at" class="muted small"></span>
        </div>
        <div id="repository-list" class="repository-list" aria-live="polite"></div>
      </div>

      <aside class="panel detail-panel" aria-live="polite">
        <div id="repository-detail" class="empty-state">
          <p class="eyebrow">REPOSITORY EVIDENCE</p>
          <h2>Select a repository</h2>
          <p class="muted">Inspect the exact commit, required checks, capability evidence, drift findings, and approval-gated repair missions.</p>
        </div>
      </aside>
    </section>
  </main>

  <footer>
    Verification can prepare a repair mission. It never authorizes branch creation, merge, deployment, rollback, secret access, or destructive work.
  </footer>
  <script src="/control-room/app.js" defer></script>
</body>
</html>`;

const LOGIN_JS = `(() => {
  const form = document.getElementById('login-form');
  const message = document.getElementById('login-message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const email = new FormData(form).get('email');
    button.disabled = true;
    message.textContent = 'Requesting a secure link…';
    try {
      const response = await fetch('/auth/magic-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const payload = await response.json();
      message.textContent = payload.message || payload.error || 'Check your email.';
    } catch {
      message.textContent = 'The Control Room could not request a link. Try again.';
    } finally {
      button.disabled = false;
    }
  });
})();`;

const DASHBOARD_JS = `(() => {
  const state = { repositories: [], selectedSlug: null };
  const summary = document.getElementById('summary');
  const list = document.getElementById('repository-list');
  const detail = document.getElementById('repository-detail');
  const syncStatus = document.getElementById('sync-status');
  const generatedAt = document.getElementById('generated-at');

  function csrfToken() {
    const row = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('fcr_csrf='));
    return row ? decodeURIComponent(row.slice('fcr_csrf='.length)) : '';
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('x-csrf-token', csrfToken());
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
    if (response.status === 401) {
      location.assign('/control-room/login');
      throw new Error('Founder session expired');
    }
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || 'Request failed');
    return payload;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function statusOf(repository) {
    return repository.latestRun?.overall_status || 'unverified';
  }

  function statusLabel(status) {
    return status === 'passed' ? 'Verified' : status === 'warning' ? 'Warning' : status === 'failed' ? 'Failed' : 'Unverified';
  }

  function renderSummary() {
    const totals = { passed: 0, warning: 0, failed: 0, unverified: 0 };
    state.repositories.forEach(repository => { totals[statusOf(repository)] += 1; });
    const cards = [
      ['Repositories', state.repositories.length, 'total'],
      ['Verified', totals.passed, 'passed'],
      ['Warnings', totals.warning, 'warning'],
      ['Failed', totals.failed, 'failed'],
      ['Unverified', totals.unverified, 'unverified']
    ];
    summary.replaceChildren(...cards.map(([label, value, status]) => {
      const card = el('article', 'summary-card');
      card.append(el('span', 'summary-label', label), el('strong', 'summary-value', String(value)));
      card.dataset.status = status;
      return card;
    }));
  }

  function renderRepositories() {
    if (!state.repositories.length) {
      list.replaceChildren(el('p', 'empty-state muted', 'No portfolio repositories are enabled.'));
      return;
    }
    list.replaceChildren(...state.repositories.map(repository => {
      const status = statusOf(repository);
      const button = el('button', 'repository-card');
      button.type = 'button';
      button.dataset.status = status;
      if (repository.slug === state.selectedSlug) button.dataset.selected = 'true';

      const heading = el('div', 'repository-card-heading');
      const name = el('div');
      name.append(el('strong', '', repository.name), el('span', 'repo-id', repository.repository.identifier));
      heading.append(name, el('span', 'status-badge', statusLabel(status)));

      const commit = repository.latestRun?.commit_sha ? repository.latestRun.commit_sha.slice(0, 10) : 'not scanned';
      const metrics = el('div', 'repository-metrics');
      metrics.append(
        el('span', '', 'Commit ' + commit),
        el('span', '', repository.findings.total + ' findings'),
        el('span', '', repository.capabilities.verified + '/' + repository.capabilities.total + ' capabilities')
      );
      button.append(heading, metrics);
      button.addEventListener('click', () => selectRepository(repository.slug));
      return button;
    }));
  }

  function definitionRow(label, value) {
    const row = el('div', 'definition-row');
    row.append(el('dt', '', label), el('dd', '', value));
    return row;
  }

  function renderChecks(run) {
    const section = el('section', 'detail-section');
    section.append(el('h3', '', 'Required checks'));
    const checks = Array.isArray(run?.checks) ? run.checks : [];
    if (!checks.length) {
      section.append(el('p', 'muted', 'No exact-commit check evidence has been recorded.'));
      return section;
    }
    const rows = el('div', 'evidence-list');
    checks.forEach(check => {
      const row = el('div', 'evidence-row');
      row.dataset.status = check.status;
      row.append(el('span', '', check.name), el('span', 'status-badge', check.status));
      rows.append(row);
    });
    section.append(rows);
    return section;
  }

  function renderCapabilities(capabilities) {
    const section = el('section', 'detail-section');
    section.append(el('h3', '', 'Capabilities'));
    if (!capabilities.length) {
      section.append(el('p', 'muted', 'No capability evidence has been recorded.'));
      return section;
    }
    const rows = el('div', 'evidence-list');
    capabilities.forEach(capability => {
      const row = el('div', 'capability-row');
      row.dataset.status = capability.observed_status;
      const title = el('div');
      title.append(el('strong', '', capability.capability_id), el('span', 'muted small', capability.reason || capability.claimed_status));
      row.append(title, el('span', 'status-badge', capability.observed_status));
      rows.append(row);
    });
    section.append(rows);
    return section;
  }

  function renderFindings(findings) {
    const section = el('section', 'detail-section');
    section.append(el('h3', '', 'Drift findings'));
    const open = findings.filter(finding => finding.status === 'open');
    if (!open.length) {
      section.append(el('p', 'muted', 'No open repository drift findings.'));
      return section;
    }
    const rows = el('div', 'finding-list');
    open.forEach(finding => {
      const row = el('article', 'finding-card');
      row.dataset.severity = finding.severity;
      row.append(el('strong', '', finding.title), el('p', 'muted small', finding.detail || finding.suggested_action || 'Founder review required.'));
      rows.append(row);
    });
    section.append(rows);
    return section;
  }

  async function selectRepository(slug) {
    state.selectedSlug = slug;
    renderRepositories();
    detail.replaceChildren(el('p', 'muted', 'Loading exact repository evidence…'));
    try {
      const payload = await api('/projects/' + encodeURIComponent(slug) + '/verification');
      const repository = payload.project;
      const run = payload.latestRun;
      const status = run?.overall_status || 'unverified';

      const heading = el('div', 'detail-heading');
      const title = el('div');
      title.append(el('p', 'eyebrow', 'REPOSITORY EVIDENCE'), el('h2', '', repository.name));
      heading.append(title, el('span', 'status-badge', statusLabel(status)));

      const facts = el('dl', 'definition-list');
      facts.append(
        definitionRow('Repository', repository.repo_identifier),
        definitionRow('Commit', run?.commit_sha || 'Not scanned'),
        definitionRow('Branch', run?.branch || 'Unknown'),
        definitionRow('Source', run?.source || 'No evidence'),
        definitionRow('Observed', run?.received_at ? new Date(run.received_at).toLocaleString() : 'Never')
      );

      const actions = el('div', 'detail-actions');
      const verify = el('button', '', 'Verify now');
      verify.type = 'button';
      verify.addEventListener('click', async () => {
        verify.disabled = true;
        verify.textContent = 'Verifying…';
        try {
          await api('/projects/' + encodeURIComponent(slug) + '/verification/scan', { method: 'POST', body: '{}' });
          await loadPortfolio();
          await selectRepository(slug);
        } catch (error) {
          alert(error.message);
        } finally {
          verify.disabled = false;
          verify.textContent = 'Verify now';
        }
      });
      actions.append(verify);

      const openFindings = payload.findings.filter(finding => finding.status === 'open' && !finding.mission_id);
      if (openFindings.length) {
        const mission = el('button', 'secondary', 'Prepare repair mission');
        mission.type = 'button';
        mission.addEventListener('click', async () => {
          mission.disabled = true;
          mission.textContent = 'Preparing…';
          try {
            await api('/projects/' + encodeURIComponent(slug) + '/verification/propose-mission', {
              method: 'POST',
              body: JSON.stringify({ findingIds: openFindings.map(finding => finding.id) })
            });
            await loadPortfolio();
            await selectRepository(slug);
          } catch (error) {
            alert(error.message);
          } finally {
            mission.disabled = false;
            mission.textContent = 'Prepare repair mission';
          }
        });
        actions.append(mission);
      }

      detail.replaceChildren(
        heading,
        facts,
        actions,
        renderChecks(run),
        renderCapabilities(payload.capabilities || []),
        renderFindings(payload.findings || [])
      );
    } catch (error) {
      detail.replaceChildren(el('p', 'error-copy', error.message));
    }
  }

  async function loadPortfolio() {
    syncStatus.textContent = 'Refreshing…';
    try {
      const payload = await api('/portfolio/repositories');
      state.repositories = payload.repositories || [];
      generatedAt.textContent = 'Updated ' + new Date(payload.generatedAt).toLocaleTimeString();
      syncStatus.textContent = 'Portfolio current';
      renderSummary();
      renderRepositories();
    } catch (error) {
      syncStatus.textContent = error.message;
    }
  }

  document.getElementById('refresh-button').addEventListener('click', loadPortfolio);
  document.getElementById('logout-button').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' }).catch(() => null);
    location.assign('/control-room/login');
  });

  loadPortfolio();
  setInterval(loadPortfolio, 60_000);
})();`;

const STYLES = `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #090b12;
  color: #f4f3f8;
  --surface: #121521;
  --surface-2: #181c2b;
  --border: #2b3043;
  --muted: #a4a8b8;
  --accent: #a58bff;
  --passed: #70d6a3;
  --warning: #f0c36c;
  --failed: #ff7e8d;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 10% 0%, #211a3d 0, transparent 32rem), #090b12; }
button, input { font: inherit; }
button { border: 0; border-radius: .75rem; padding: .72rem 1rem; background: var(--accent); color: #0b0713; font-weight: 750; cursor: pointer; }
button:hover { filter: brightness(1.08); }
button:disabled { cursor: wait; opacity: .62; }
button.secondary { background: #252a3b; color: #f4f3f8; border: 1px solid var(--border); }
input { width: 100%; border: 1px solid var(--border); border-radius: .75rem; padding: .8rem .9rem; background: #0c0f18; color: inherit; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: .25rem; font-size: clamp(1.65rem, 4vw, 2.45rem); }
h2 { margin-bottom: 0; }
h3 { font-size: 1rem; }
.eyebrow { margin-bottom: .35rem; color: var(--accent); font-size: .72rem; letter-spacing: .16em; font-weight: 800; }
.muted { color: var(--muted); }
.small { font-size: .78rem; }
.error-copy { color: var(--failed); }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1.35rem clamp(1rem, 4vw, 3rem); border-bottom: 1px solid var(--border); background: rgba(9, 11, 18, .82); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 10; }
.topbar-actions { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; justify-content: flex-end; }
.sync-status { color: var(--muted); font-size: .82rem; }
.dashboard-shell { padding: 1.25rem clamp(1rem, 4vw, 3rem) 2rem; }
.summary-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .8rem; margin-bottom: 1rem; }
.summary-card { background: rgba(18, 21, 33, .92); border: 1px solid var(--border); border-radius: 1rem; padding: 1rem; }
.summary-card[data-status="passed"] { border-color: color-mix(in srgb, var(--passed) 45%, var(--border)); }
.summary-card[data-status="warning"] { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
.summary-card[data-status="failed"] { border-color: color-mix(in srgb, var(--failed) 45%, var(--border)); }
.summary-label { display: block; color: var(--muted); font-size: .78rem; }
.summary-value { display: block; margin-top: .2rem; font-size: 1.75rem; }
.workspace { display: grid; grid-template-columns: minmax(18rem, .85fr) minmax(24rem, 1.5fr); gap: 1rem; align-items: start; }
.panel { background: rgba(18, 21, 33, .94); border: 1px solid var(--border); border-radius: 1.1rem; padding: 1rem; min-width: 0; }
.detail-panel { position: sticky; top: 7.25rem; max-height: calc(100vh - 8.5rem); overflow: auto; }
.panel-heading, .detail-heading, .repository-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.repository-list, .evidence-list, .finding-list { display: grid; gap: .7rem; margin-top: 1rem; }
.repository-card { width: 100%; text-align: left; padding: .9rem; background: var(--surface-2); color: inherit; border: 1px solid var(--border); }
.repository-card[data-selected="true"] { outline: 2px solid var(--accent); }
.repository-card strong, .repository-card .repo-id { display: block; }
.repo-id { color: var(--muted); font-size: .75rem; margin-top: .2rem; }
.repository-metrics { display: flex; flex-wrap: wrap; gap: .65rem; color: var(--muted); font-size: .72rem; margin-top: .8rem; }
.status-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: .28rem .55rem; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; background: #282d3e; color: #dddfea; white-space: nowrap; }
[data-status="passed"] > .status-badge, [data-status="verified"] > .status-badge { background: color-mix(in srgb, var(--passed) 20%, #15251e); color: var(--passed); }
[data-status="warning"] > .status-badge, [data-status="unverified"] > .status-badge, [data-status="pending"] > .status-badge { background: color-mix(in srgb, var(--warning) 18%, #2b2416); color: var(--warning); }
[data-status="failed"] > .status-badge, [data-status="drifted"] > .status-badge, [data-status="missing"] > .status-badge { background: color-mix(in srgb, var(--failed) 18%, #2b171b); color: var(--failed); }
.definition-list { display: grid; gap: .1rem; margin: 1rem 0; }
.definition-row { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: .8rem; padding: .55rem 0; border-bottom: 1px solid #23283a; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.detail-actions { display: flex; gap: .65rem; flex-wrap: wrap; margin: 1rem 0; }
.detail-section { border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem; }
.evidence-row, .capability-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .75rem; border: 1px solid var(--border); border-radius: .8rem; background: #0e111b; }
.capability-row strong, .capability-row span { display: block; }
.finding-card { border: 1px solid var(--border); border-left: 4px solid var(--warning); border-radius: .8rem; padding: .8rem; background: #0e111b; }
.finding-card[data-severity="critical"], .finding-card[data-severity="high"] { border-left-color: var(--failed); }
.finding-card p { margin: .35rem 0 0; }
.empty-state { padding: 2rem 1rem; }
footer { padding: 1rem clamp(1rem, 4vw, 3rem) 2rem; color: var(--muted); font-size: .75rem; }
.login-page { display: grid; place-items: center; padding: 1rem; }
.login-card { width: min(100%, 30rem); padding: 2rem; border: 1px solid var(--border); border-radius: 1.15rem; background: rgba(18, 21, 33, .96); box-shadow: 0 2rem 5rem rgba(0, 0, 0, .35); }
.stack { display: grid; gap: .75rem; }
.status-copy { min-height: 1.5rem; margin: 1rem 0 0; color: var(--muted); }
@media (max-width: 900px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workspace { grid-template-columns: 1fr; }
  .detail-panel { position: static; max-height: none; }
}
@media (max-width: 620px) {
  .topbar { align-items: flex-start; flex-direction: column; }
  .topbar-actions { justify-content: flex-start; }
  .summary-grid { grid-template-columns: 1fr 1fr; }
  .definition-row { grid-template-columns: 1fr; gap: .25rem; }
}`;

controlRoomUiRouter.get("/login", (_req, res) => {
  noStore(res);
  res.type("html").send(LOGIN_HTML);
});

controlRoomUiRouter.get("/login.js", (_req, res) => {
  res.type("application/javascript").send(LOGIN_JS);
});

controlRoomUiRouter.get("/app.js", (_req, res) => {
  res.type("application/javascript").send(DASHBOARD_JS);
});

controlRoomUiRouter.get("/styles.css", (_req, res) => {
  res.type("text/css").send(STYLES);
});

controlRoomUiRouter.get(
  "/",
  requireFounder,
  (_req: FounderRequest, res) => {
    noStore(res);
    res.type("html").send(DASHBOARD_HTML);
  },
);
