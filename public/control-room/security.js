const root = document.querySelector('#security-root');
const SESSION_KEY = 'fcr_session';

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

async function api(path) {
  const token = accessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { headers, credentials: 'same-origin' });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('founder_auth_required');
    error.auth = true;
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Security posture request failed');
  return body;
}

function signInBoundary() {
  root.innerHTML = `<section class="signin-state">
    <p class="eyebrow">FOUNDER-ONLY SECURITY PLANE</p>
    <h1>Security posture locked.</h1>
    <p>Sign in through Founder Control Room before reading portfolio security targets or proof requirements.</p>
    <a href="/control-room/">Return to sign in</a>
  </section>`;
}

function unavailableBoundary(message) {
  root.innerHTML = `<section class="error-state">
    <p class="eyebrow">FAIL CLOSED</p>
    <h1>Security posture unavailable.</h1>
    <p>${escapeHtml(message || 'The posture snapshot could not be loaded.')} No security authority or provider state was changed.</p>
    <a href="/control-room/">Return to Control Room</a>
  </section>`;
}

function summaryCard(label, value, focus = '') {
  return `<article class="summary-card" ${focus ? `data-focus="${escapeHtml(focus)}"` : ''}>
    <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
  </article>`;
}

function truthMarkup(snapshot) {
  const boundaries = snapshot.truthBoundaries || {};
  return `<section class="truth-grid" aria-label="Security truth boundaries">
    <article class="truth-card"><strong>TARGET ≠ PROOF</strong><span>${boundaries.targetVersionIsNotCurrentMaturity ? 'A project target describes required maturity, not maturity already earned.' : 'Truth boundary missing.'}</span></article>
    <article class="truth-card"><strong>FRAMEWORK ≠ CERTIFICATION</strong><span>${boundaries.frameworkMappingIsNotCertification ? 'NIST, OWASP, CIS and other mappings are implementation signals, not certification claims.' : 'Truth boundary missing.'}</span></article>
    <article class="truth-card"><strong>PROVIDER CLAIMS NEED EVIDENCE</strong><span>${boundaries.providerClaimsRequireRuntimeEvidence ? 'Cloud, database, deployment and runtime claims stay unproven until provider evidence exists.' : 'Truth boundary missing.'}</span></article>
  </section>`;
}

function stageMarkup(stage) {
  const controls = Array.isArray(stage.controls) ? stage.controls : [];
  return `<article class="stage-card" data-security-stage="${escapeHtml(stage.version)}">
    <span class="stage-number">V${escapeHtml(stage.version)}</span>
    <h3>${escapeHtml(stage.name)}</h3>
    <p>${escapeHtml(stage.objective)}</p>
    <div class="chips" aria-label="V${escapeHtml(stage.version)} controls">
      ${controls.map(control => `<span class="chip">${escapeHtml(control)}</span>`).join('')}
    </div>
  </article>`;
}

function listMarkup(values) {
  if (!Array.isArray(values) || !values.length) return '<p class="repo">None declared.</p>';
  return `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function projectMarkup(project) {
  return `<article class="project-card" data-project="${escapeHtml(project.slug)}" data-target-version="${escapeHtml(project.targetVersion)}">
    <div class="project-head">
      <div>
        <p class="eyebrow">${escapeHtml(project.assessmentState === 'target_only' ? 'TARGET ONLY · NOT YET PROVEN' : project.assessmentState)}</p>
        <h3>${escapeHtml(project.name)}</h3>
        <div class="repo">${escapeHtml(project.repository)}</div>
      </div>
      <div class="target-badge" aria-label="Target version ${escapeHtml(project.targetVersion)}, not proven">
        <strong>V${escapeHtml(project.targetVersion)}</strong>
        <span>NOT PROVEN</span>
      </div>
    </div>
    <div class="project-meta">
      <span class="chip">${escapeHtml(project.requiredStageCount)} stages required</span>
      <span class="chip">${escapeHtml(project.requiredControlCount)} controls in scope</span>
      ${(project.capabilities || []).slice(0, 4).map(capability => `<span class="chip">${escapeHtml(capability)}</span>`).join('')}
    </div>
    <div class="detail-block"><h4>Why this target</h4>${listMarkup(project.reasons)}</div>
    <div class="detail-block"><h4>Proof required before claims</h4>${listMarkup(project.requiredProof)}</div>
  </article>`;
}

function lanternItem(label, detail, denied = false) {
  return `<article class="lantern-item" data-state="${denied ? 'deny' : 'require'}">
    <strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span>
  </article>`;
}

function lanternMarkup(lantern) {
  const policy = lantern?.policy || {};
  return `<section class="lantern-panel">
    <p class="eyebrow">ATTACK BY FIRE → ILLUMINATION, NOT RETALIATION</p>
    <h2>Lantern defensive boundary</h2>
    <p class="lantern-copy">Lantern may safely divert suspicious behavior into an isolated, instrumented decoy. Observation may increase; attacker authority may not. Identity remains evidence-graded and investigation beyond owned systems is handed to authorized providers or proper channels.</p>
    <div class="lantern-grid">
      ${lanternItem('Isolation required', policy.isolated ? 'Decoy infrastructure remains separated from production.' : 'Policy invalid.')}
      ${lanternItem('Real data forbidden', policy.realDataAllowed ? 'Policy invalid.' : 'No real user or production data enters the decoy.', true)}
      ${lanternItem('Real secrets forbidden', policy.realSecretsAllowed ? 'Policy invalid.' : 'No live credentials or secrets are exposed.', true)}
      ${lanternItem('Production authority forbidden', policy.productionAuthorityAllowed ? 'Policy invalid.' : 'The decoy cannot control production.', true)}
      ${lanternItem('Outbound attack forbidden', policy.outboundAttackCapabilityAllowed ? 'Policy invalid.' : 'The decoy cannot be used to attack other systems.', true)}
      ${lanternItem('Hack-back forbidden', policy.hackBackAllowed ? 'Policy invalid.' : 'Defensive evidence collection stops at owned boundaries.', true)}
      ${lanternItem('Human attribution constrained', policy.humanIdentityClaimFromNetworkSignalAllowed ? 'Policy invalid.' : 'Network signals alone never identify a human.', true)}
      ${lanternItem('Observation time-bounded', policy.timeBounded ? 'Sessions must have bounded observation windows.' : 'Policy invalid.')}
      ${lanternItem('Evidence integrity required', policy.evidenceIntegrityRequired ? 'Incident evidence must retain integrity protection.' : 'Policy invalid.')}
    </div>
  </section>`;
}

function analyticsMarkup(summary) {
  return `<section class="analytics-grid" aria-label="Privacy-safe security analytics">
    <article class="metric-card"><span>Stage obligations</span><strong>${escapeHtml(summary.totalStageObligations)}</strong></article>
    <article class="metric-card"><span>Unique V1–V10 controls</span><strong>${escapeHtml(summary.uniqueControlCount)}</strong></article>
    <article class="metric-card"><span>Framework signals</span><strong>${escapeHtml(summary.frameworkSignalCount)}</strong></article>
    <article class="metric-card"><span>Maturity-proven projects</span><strong>${escapeHtml(summary.provenProjects)}</strong></article>
  </section>`;
}

function render(snapshot) {
  const summary = snapshot.summary || {};
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  const generatedAt = snapshot.generatedAt && !Number.isNaN(Date.parse(snapshot.generatedAt))
    ? new Date(snapshot.generatedAt).toLocaleString()
    : 'unknown';

  root.innerHTML = `<div class="shell">
    <header class="hero">
      <a class="brand-link" href="/control-room/">← Founder Control Room</a>
      <p class="eyebrow">STRATEGIC SECURITY · READ ONLY</p>
      <h1>Security posture without the green-check theater.</h1>
      <p class="hero-copy">See what each registered project must prove from V1 through V10, why that target exists, and where defensive constraints stay absolute. This surface can describe authority. It cannot grant authority.</p>
      <p class="generated">Snapshot generated ${escapeHtml(generatedAt)}</p>
    </header>

    ${truthMarkup(snapshot)}

    <section class="summary-grid" aria-label="Portfolio security target summary">
      ${summaryCard('Registered projects', summary.totalProjects)}
      ${summaryCard('V10 targets', summary.v10Targets, 'v10')}
      ${summaryCard('V9 targets', summary.v9Targets)}
      ${summaryCard('V8 targets', summary.v8Targets)}
      ${summaryCard('Proven maturity', summary.provenProjects, 'proof')}
    </section>

    <section class="section">
      <div class="section-head"><div><p class="eyebrow">V1 → V10</p><h2>Security maturity ladder</h2></div><p>Stages accumulate. A V10 target inherits every control below it; it does not skip straight to autonomy.</p></div>
      <div class="ladder">${stages.map(stageMarkup).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><p class="eyebrow">PORTFOLIO</p><h2>Project targets and proof gates</h2></div><p>Every card is deliberately marked target-only until repository, provider and runtime evidence establish actual maturity.</p></div>
      <div class="project-grid">${projects.map(projectMarkup).join('')}</div>
    </section>

    <section class="section">${lanternMarkup(snapshot.lantern)}</section>

    <section class="section">
      <div class="section-head"><div><p class="eyebrow">DATA ANALYTICS</p><h2>Privacy-safe posture metrics</h2></div><p>These are aggregate architecture counts. No user behavior, decoy-session identity, or sensitive incident payload is exposed here.</p></div>
      ${analyticsMarkup(summary)}
      <p class="metric-note">Future incident metrics such as detection, containment, recovery and false-positive rates should appear only after real evidence exists. Empty evidence is UNKNOWN, never zero.</p>
    </section>
  </div>`;
}

async function boot() {
  try {
    const snapshot = await api('/security-posture');
    render(snapshot);
  } catch (error) {
    if (error?.auth) signInBoundary();
    else unavailableBoundary(error instanceof Error ? error.message : String(error));
  }
}

void boot();
