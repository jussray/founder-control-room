const app = document.getElementById('app');
const refreshButton = document.getElementById('refresh');
const AUTHORITY_RANK = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6 });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

async function api(path) {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
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

function observationLabel(state) {
  if (state === 'invalid') return 'time invalid';
  if (state === 'future') return 'future dated';
  if (state === 'stale') return 'stale evidence';
  return 'fresh evidence';
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
        <span class="confidence-pill">${escapeHtml(observationLabel(priority.observationState))}</span>
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

function authorityAtLeast(connection, minimum) {
  return connection?.status === 'active'
    && Object.prototype.hasOwnProperty.call(AUTHORITY_RANK, connection.authorityLevel)
    && AUTHORITY_RANK[connection.authorityLevel] >= AUTHORITY_RANK[minimum];
}

function connectionSupports(connection, { minimum, type = null, capability = null }) {
  if (!authorityAtLeast(connection, minimum)) return false;
  if (AUTHORITY_RANK[minimum] >= AUTHORITY_RANK.L4 && !connection.secretRef) return false;
  if (type && connection.type !== type) return false;
  const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities : [];
  if (capability && !capabilities.includes(capability)) return false;
  return true;
}

function buildAutonomyReadiness(pluginCenter) {
  const connections = Array.isArray(pluginCenter?.connections) ? pluginCenter.connections : [];
  const projects = new Map();

  for (const connection of connections) {
    const key = connection.projectId || connection.projectSlug || `unscoped:${connection.id}`;
    const current = projects.get(key) ?? {
      projectId: connection.projectId || null,
      slug: connection.projectSlug || null,
      name: connection.projectName || connection.projectSlug || 'Unlabeled project',
      connections: [],
    };
    current.connections.push(connection);
    projects.set(key, current);
  }

  const lanes = [...projects.values()].map((project) => {
    const active = project.connections.filter((connection) => connection.status === 'active');
    const buildReady = active.some((connection) => connectionSupports(connection, {
      minimum: 'L4', type: 'github', capability: 'create_branch',
    }));
    const integrationReady = active.some((connection) => connectionSupports(connection, {
      minimum: 'L5', type: 'github', capability: 'integrate_main',
    }));
    const providerReady = active.some((connection) => connectionSupports(connection, {
      minimum: 'L6', capability: 'deploy',
    }));
    const authorityUnknown = project.connections.some((connection) => !connection.authorityLevel);
    const missingSecretRef = active.some((connection) => {
      const rank = AUTHORITY_RANK[connection.authorityLevel] ?? -1;
      return rank >= AUTHORITY_RANK.L4 && !connection.secretRef;
    });
    const blockers = [];
    if (!buildReady) blockers.push('No active GitHub connection declares L4+, create_branch, and a credential reference.');
    if (!integrationReady) blockers.push('No active GitHub connection declares L5+, integrate_main, and a credential reference.');
    if (!providerReady) blockers.push('No active L6 connection declares deploy and a credential reference for provider/production work.');
    if (authorityUnknown) blockers.push('At least one connection has no declared authority level.');
    if (missingSecretRef) blockers.push('At least one active L4+ connection is missing a secret reference.');

    return {
      ...project,
      activeConnections: active.length,
      buildReady,
      integrationReady,
      providerReady,
      authorityUnknown,
      missingSecretRef,
      blockers,
    };
  }).sort((a, b) => Number(b.buildReady) - Number(a.buildReady) || a.name.localeCompare(b.name));

  return {
    available: true,
    source: 'plugin-center',
    projectsObserved: lanes.length,
    buildReadyProjects: lanes.filter((lane) => lane.buildReady).length,
    integrationReadyProjects: lanes.filter((lane) => lane.integrationReady).length,
    providerReadyProjects: lanes.filter((lane) => lane.providerReady).length,
    projectsWithAuthorityGaps: lanes.filter((lane) => lane.authorityUnknown).length,
    projectsWithSecretRefGaps: lanes.filter((lane) => lane.missingSecretRef).length,
    activeTemporaryGrants: Number(pluginCenter?.summary?.activeTemporaryGrants ?? 0),
    lanes,
    enforcementNote: pluginCenter?.contract?.enforcementNote
      ?? 'Connection inventory describes declared authority; execution remains enforced by the applicable FCR proof and provider gates.',
  };
}

function renderAutonomyLane(lane) {
  const badges = [
    lane.buildReady ? 'build ready' : 'build blocked',
    lane.integrationReady ? 'integration ready' : 'integration gated',
    lane.providerReady ? 'provider ready' : 'provider gated',
  ];

  return `
    <article class="contract-card">
      <h3>${escapeHtml(lane.name)}</h3>
      <p>${escapeHtml(lane.slug ?? 'Project slug unavailable')} · ${escapeHtml(lane.activeConnections)} active connection${lane.activeConnections === 1 ? '' : 's'}</p>
      <div class="pill-row" style="margin-top:0.7rem">
        ${badges.map((badge) => `<span class="confidence-pill">${escapeHtml(badge)}</span>`).join('')}
      </div>
      ${lane.blockers.length > 0
        ? `<ul class="evidence" style="margin-top:0.8rem">${lane.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul>`
        : '<p style="margin-top:0.8rem">Declared project authority has no readiness gaps at L4-L6.</p>'}
    </article>
  `;
}

function renderAutonomy(autonomy) {
  if (!autonomy?.available) {
    return `
      <section class="blindspot-card">
        <p class="eyebrow">Autonomy readiness</p>
        <h2>Provider authority unavailable</h2>
        <p class="hero-copy">Plugin Center could not be read, so FCR will not guess which projects are ready for autonomous build or provider work.</p>
      </section>
    `;
  }

  return `
    <section class="section-heading">
      <div><p class="eyebrow">Standing founder policy</p><h2>Declared autonomy readiness</h2></div>
      <p>Readiness requires matching project-scoped authority, provider capability, and credential reference. It does not bypass proof, rollback, or provider gates.</p>
    </section>
    <section class="metrics" aria-label="Autonomy readiness summary">
      ${metric('Build-ready projects', autonomy.buildReadyProjects)}
      ${metric('Integration-ready', autonomy.integrationReadyProjects)}
      ${metric('Provider-ready', autonomy.providerReadyProjects)}
      ${metric('Authority gaps', autonomy.projectsWithAuthorityGaps)}
      ${metric('Secret-ref gaps', autonomy.projectsWithSecretRefGaps)}
    </section>
    <section class="contract-grid">
      ${autonomy.lanes.length > 0
        ? autonomy.lanes.map(renderAutonomyLane).join('')
        : '<article class="contract-card"><h3>No project connections</h3><p>Plugin Center returned no project-scoped connections.</p></article>'}
    </section>
    <section class="blindspot-card">
      <p class="eyebrow">Authority truth</p>
      <h2>Autonomous to your standing policy, never self-authorizing.</h2>
      <p class="hero-copy">${escapeHtml(autonomy.enforcementNote)} Credential values are never rendered here. Active temporary grants: ${escapeHtml(autonomy.activeTemporaryGrants)}.</p>
    </section>
  `;
}

function renderBrief(brief, autonomy) {
  const frameworks = [
    ['FutureYou', brief.operatingContract.futureYou],
    ['Red Team', brief.operatingContract.redTeam],
    ['OODA', brief.operatingContract.ooda],
    ['Lindy Mode', brief.operatingContract.lindyMode],
    ['L99', brief.operatingContract.l99],
  ];
  const timeIntegrityGaps = Number(brief.summary.invalidObservationTimes ?? 0)
    + Number(brief.summary.futureObservationTimes ?? 0);

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
      ${metric('Trusted observations', `${brief.summary.trustedObservationPercent ?? 0}%`)}
      ${metric('Stale observations', brief.summary.staleObservations ?? 0)}
      ${metric('Time integrity gaps', timeIntegrityGaps)}
      ${metric('Structural evidence', `${brief.summary.evidenceCoveragePercent}%`)}
    </section>

    ${renderAutonomy(autonomy)}

    <section class="section-heading">
      <div><p class="eyebrow">Today</p><h2>Ranked next actions</h2></div>
      <p>Urgency reflects governed state, risk, staleness, and observed failures. Observation trust is separate from urgency. It is not a revenue forecast.</p>
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
  app.innerHTML = '<div class="loading-card">Reading governed missions, evidence, and project authority…</div>';
  try {
    const brief = await api('/futureyou/v8/brief');
    let autonomy = { available: false };
    try {
      autonomy = buildAutonomyReadiness(await api('/plugin-center'));
    } catch {
      autonomy = { available: false };
    }
    renderBrief(brief, autonomy);
  } catch (error) {
    app.innerHTML = `<div class="error-card"><strong>FutureYou V8 could not load.</strong>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh brief';
  }
}

refreshButton.addEventListener('click', refresh);
refresh();
