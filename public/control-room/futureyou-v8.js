const STORAGE_KEY = 'fcr_session';
const app = document.getElementById('app');
const refreshButton = document.getElementById('refresh');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function api(path) {
  const session = loadSession();
  if (!session?.access_token) throw new Error('Sign in through the main Control Room before opening FutureYou V8.');

  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body;
}

function dateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

function metric(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function renderPriority(priority, index) {
  const project = priority.project ? `${priority.project.name} · ${priority.project.slug}` : 'Project label unavailable';
  return `
    <article class="priority-card">
      <div class="priority-top">
        <div>
          <div class="priority-rank">Priority ${index + 1}</div>
          <h3 class="priority-title">${escapeHtml(priority.title)}</h3>
          <p class="project-name">${escapeHtml(project)} · observed ${escapeHtml(dateTime(priority.observedAt))}</p>
        </div>
        <div>
          <div class="score">${escapeHtml(priority.score)}</div>
          <div class="score-label">urgency</div>
        </div>
      </div>
      <div class="pill-row">
        <span class="domain-pill domain-${escapeHtml(priority.domain)}">${escapeHtml(priority.domain)}</span>
        <span class="authority-pill">${escapeHtml(priority.authority.level)} · ${escapeHtml(priority.authority.mode)}</span>
        <span class="confidence-pill">${escapeHtml(priority.confidence)} confidence</span>
      </div>
      <p class="reason">${escapeHtml(priority.reason)}</p>
      <div class="next-action"><strong>Next move:</strong> ${escapeHtml(priority.nextAction)}</div>
      <p class="boundary"><strong>Authority boundary:</strong> ${escapeHtml(priority.authority.boundary)}</p>
      <ul class="evidence">
        ${priority.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>
  `;
}

function renderBrief(brief) {
  const frameworks = [
    ['FutureYou', brief.operatingContract.futureYou],
    ['Red Team', brief.operatingContract.redTeam],
    ['OODA', brief.operatingContract.ooda],
    ['Lindy Mode', brief.operatingContract.lindyMode],
    ['L99', brief.operatingContract.l99],
  ];

  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Founder executive brief</p>
        <h1>What matters now.</h1>
        <p class="hero-copy">${escapeHtml(brief.northStar)}</p>
      </div>
      <p class="timestamp">Generated ${escapeHtml(dateTime(brief.generatedAt))}<br />Read-only · evidence-aware · provider-independent</p>
    </section>

    <section class="metrics" aria-label="Mission Control summary">
      ${metric('Open missions', brief.summary.openMissions)}
      ${metric('Waiting decision', brief.summary.waitingDecision)}
      ${metric('High risk', brief.summary.highRisk)}
      ${metric('24h completions', brief.summary.recentCompletions)}
      ${metric('Evidence coverage', `${brief.summary.evidenceCoveragePercent}%`)}
    </section>

    <section class="section-heading">
      <div><p class="eyebrow">Today</p><h2>Ranked next actions</h2></div>
      <p>Urgency reflects governed state, risk, staleness, and observed failures. It is not a revenue forecast.</p>
    </section>

    <section class="priority-grid">
      ${brief.priorities.length > 0
        ? brief.priorities.map(renderPriority).join('')
        : '<p class="empty">No actionable priorities were returned. Check the blind spots before assuming everything is complete.</p>'}
    </section>

    <section class="section-heading">
      <div><p class="eyebrow">Operating contract</p><h2>V8 decision filters</h2></div>
    </section>
    <section class="contract-grid">
      ${frameworks.map(([label, text]) => `<article class="contract-card"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(text)}</p></article>`).join('')}
    </section>

    <section class="blindspot-card">
      <p class="eyebrow">Red-team readout</p>
      <h2>Blind spots</h2>
      <ul>${brief.blindSpots.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `;
}

async function refresh() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Reading…';
  app.innerHTML = '<div class="loading-card">Reading governed missions and sanitized evidence…</div>';
  try {
    renderBrief(await api('/futureyou/v8/brief'));
  } catch (error) {
    app.innerHTML = `<div class="error-card"><strong>FutureYou V8 could not load.</strong>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh brief';
  }
}

refreshButton.addEventListener('click', refresh);
refresh();
