const API = '/dashboard/truth';

const TRUTH_TABS = [
  ['truth-dashboard', 'Truth Dashboard'],
  ['truth-claims', 'Claims'],
  ['truth-evidence', 'Evidence Inbox'],
  ['truth-reconcile', 'Reconciliation'],
  ['truth-attacks', 'Attack Center'],
  ['truth-world', 'World Radar'],
  ['truth-continuity', 'Continuity'],
];

const operationReceipts = new Map();
let activeTruthTab = null;
let installObserver = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function short(value, length = 18) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length)}…`;
}

function badge(value) {
  const normalized = String(value ?? 'unknown').toLowerCase();
  return `<span class="truth-badge truth-${escapeHtml(normalized)}">${escapeHtml(normalized)}</span>`;
}

function repoLabel(project) {
  if (!project?.repo_provider || !project?.repo_identifier) return 'repository not bound';
  return `${project.repo_provider}:${project.repo_identifier}`;
}

function projectLabel(project) {
  return `${project?.name ?? project?.slug ?? project?.id} · ${repoLabel(project)}`;
}

function rememberReceipt(tab, title, rows) {
  operationReceipts.set(tab, { title, rows, observedAt: new Date().toISOString() });
}

function receiptHtml(tab) {
  const receipt = operationReceipts.get(tab);
  if (!receipt) return '';
  const rows = receipt.rows.map(([label, value, mode]) => `<div class="truth-receipt-row">
    <span>${escapeHtml(label)}</span>
    <strong>${mode === 'badge' ? badge(value) : mode === 'code' ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</strong>
  </div>`).join('');
  return `<aside class="truth-operation-receipt" role="status" aria-live="polite" data-truth-operation-receipt>
    <div class="truth-row"><strong>${escapeHtml(receipt.title)}</strong><small>${fmtDate(receipt.observedAt)}</small></div>
    ${rows}
  </aside>`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function contentRoot() {
  const node = document.getElementById('tab-content');
  return node instanceof HTMLElement ? node : null;
}

function setUrlTab(tab) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function setActive(tab) {
  document.querySelectorAll('.tabs button[data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
    if (button.dataset.truthTab === 'true') {
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    }
  });
}

function screenFrame(tab, title, subtitle, body) {
  const headingId = `${tab}-heading`;
  return `
    <section class="truth-console" data-truth-screen="${escapeHtml(tab)}" role="tabpanel" aria-labelledby="truth-tab-${escapeHtml(tab)}">
      <div class="truth-heading">
        <div>
          <p class="truth-kicker">FOUNDER TRUTH CONSOLE</p>
          <h2 id="${escapeHtml(headingId)}">${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="truth-heading-chips">
          <span class="truth-auth-chip">signed in · founder-only</span>
          <span class="truth-authority-chip">authority effect · none</span>
        </div>
      </div>
      ${receiptHtml(tab)}
      <div class="truth-screen-body">${body}</div>
    </section>`;
}

function errorScreen(tab, title, error) {
  const message = error?.status === 401 ? 'Founder session required. Sign in again.' : (error?.message ?? 'Unknown error');
  return screenFrame(tab, title, 'The screen failed closed. No placeholder success was substituted.', `<div class="truth-empty truth-error" role="alert">${escapeHtml(message)}</div>`);
}

function tableHtml(headers, rows) {
  return `
    <div class="truth-table-wrap">
      <table class="truth-table">
        <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="truth-empty-cell">No records yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function projectScopeHtml(projects) {
  const cards = (projects ?? []).map((project) => `<article class="truth-project-scope">
    <div class="truth-row"><strong>${escapeHtml(project.name ?? project.slug)}</strong>${badge(project.status ?? 'unknown')}</div>
    <code>${escapeHtml(repoLabel(project))}</code>
    <small>risk: ${escapeHtml(project.risk_level ?? 'unclassified')} · project id ${escapeHtml(short(project.id, 12))}</small>
  </article>`).join('');
  return cards || '<p class="truth-empty">No registered projects yet.</p>';
}

async function renderDashboard(root) {
  try {
    const [data, projectData] = await Promise.all([api('/overview'), api('/projects')]);
    const counts = data.counts ?? {};
    const cards = [
      ['Claims', counts.claims ?? 0],
      ['Stale claims', counts.staleClaims ?? 0],
      ['Evidence', counts.evidence ?? 0],
      ['Reconciliations', counts.reconciliations ?? 0],
      ['Open attacks', counts.openAttacks ?? 0],
      ['Stale cookies', counts.staleCookies ?? 0],
    ].map(([label, value]) => `<article class="truth-metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join('');
    const receipt = data.recentReceipt;
    const continuity = data.recentContinuity;
    root.innerHTML = screenFrame(
      'truth-dashboard',
      'Dashboard',
      'Live claim, evidence, reconciliation, attack, continuity, and canonical repository scope from the durable FCR proof spine.',
      `<div class="truth-metrics">${cards}</div>
       <div class="truth-grid-2">
         <article class="truth-panel"><h3>Latest reconciliation receipt</h3>${receipt ? `<p><code>${escapeHtml(receipt.id)}</code></p><p>${badge(receipt.status)} ${escapeHtml(receipt.message ?? '')}</p><small>${fmtDate(receipt.completed_at ?? receipt.started_at)}</small>` : '<p class="truth-empty">No truth-console reconciliation receipt yet.</p>'}</article>
         <article class="truth-panel"><h3>Latest continuity marker</h3>${continuity ? `<p>${badge(continuity.state)}</p><p><code title="${escapeHtml(continuity.proof_cookie ?? '')}">${escapeHtml(short(continuity.proof_cookie, 38))}</code></p><small>${fmtDate(continuity.created_at)}</small>` : '<p class="truth-empty">No continuity marker yet.</p>'}</article>
       </div>
       <h3>Project truth scope</h3>
       <div class="truth-project-grid">${projectScopeHtml(projectData.projects)}</div>`,
    );
  } catch (error) {
    root.innerHTML = errorScreen('truth-dashboard', 'Dashboard', error);
  }
}

async function loadProjectsClaims() {
  const [projects, claims] = await Promise.all([api('/projects'), api('/claims')]);
  return { projects: projects.projects ?? [], claims: claims.claims ?? [] };
}

async function renderClaims(root) {
  try {
    const { projects, claims } = await loadProjectsClaims();
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const projectOptions = projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(projectLabel(project))}</option>`).join('');
    const rows = claims.map((claim) => {
      const project = projectById.get(claim.project_id);
      return `<tr>
        <td><code>${escapeHtml(short(claim.id, 12))}</code></td>
        <td>${escapeHtml(claim.statement)}</td>
        <td><code>${escapeHtml(repoLabel(project))}</code></td>
        <td>${badge(claim.classification)}</td>
        <td>${escapeHtml(claim.revision)}</td>
        <td>${fmtDate(claim.updated_at)}</td>
      </tr>`;
    });
    root.innerHTML = screenFrame(
      'truth-claims',
      'Claims Table',
      'Create founder claims against the canonical registered project and repository. Classification is evidence-derived, never typed in as a fake green state.',
      `<form class="truth-form" id="truth-create-claim">
        <label>Project<select name="projectId" required>${projectOptions}</select></label>
        <label class="truth-span-2">Claim<textarea name="statement" maxlength="4000" required placeholder="State the exact claim to prove or disprove."></textarea></label>
        <button type="submit" ${projects.length ? '' : 'disabled'}>Create claim</button>
        <output data-form-status role="status" aria-live="polite"></output>
      </form>
      ${tableHtml(['ID', 'Claim', 'Canonical repository', 'Classification', 'Revision', 'Updated'], rows)}`,
    );
    const form = document.getElementById('truth-create-claim');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('[data-form-status]');
      const fields = new FormData(form);
      try {
        status.textContent = 'Creating…';
        const body = await api('/claims', { method: 'POST', body: JSON.stringify({ projectId: fields.get('projectId'), statement: fields.get('statement') }) });
        rememberReceipt('truth-claims', 'Claim created', [
          ['claim', body.claim?.id ?? '', 'code'],
          ['repository', repoLabel(body.project), 'code'],
          ['classification', body.claim?.classification ?? 'unknown', 'badge'],
          ['authority effect', body.authorityEffect ?? 'none'],
        ]);
        await renderClaims(root);
      } catch (error) {
        status.textContent = error.message;
      }
    });
  } catch (error) {
    root.innerHTML = errorScreen('truth-claims', 'Claims Table', error);
  }
}

async function renderEvidence(root) {
  try {
    const [{ claims }, evidenceData] = await Promise.all([api('/claims'), api('/evidence')]);
    const evidence = evidenceData.evidence ?? [];
    const claimLinks = evidenceData.claimLinks ?? [];
    const linkCountByEvidence = new Map();
    for (const link of claimLinks) linkCountByEvidence.set(link.evidence_id, (linkCountByEvidence.get(link.evidence_id) ?? 0) + 1);
    const claimOptions = (claims ?? []).map((claim) => `<option value="${escapeHtml(claim.id)}">${escapeHtml(short(claim.statement, 90))}</option>`).join('');
    const rows = evidence.map((item) => `<tr>
      <td><code>${escapeHtml(short(item.id, 12))}</code></td>
      <td>${escapeHtml(item.subject)}</td>
      <td>${escapeHtml(item.kind)}</td>
      <td>${badge(item.status)}</td>
      <td>${escapeHtml(item.provider)}</td>
      <td>${escapeHtml(linkCountByEvidence.get(item.id) ?? 0)}</td>
      <td>${escapeHtml(item.details_ref ?? '')}</td>
      <td>${fmtDate(item.created_at)}</td>
    </tr>`);
    root.innerHTML = screenFrame(
      'truth-evidence',
      'Evidence Inbox',
      'Attach normalized evidence to a claim. New evidence atomically invalidates the prior continuity marker instead of preserving stale proof.',
      `<form class="truth-form" id="truth-attach-evidence">
        <label class="truth-span-2">Claim<select name="claimId" required>${claimOptions}</select></label>
        <label>Status<select name="status"><option>pass</option><option>fail</option><option>warn</option><option>pending</option></select></label>
        <label>Relation<select name="relation"><option>supports</option><option>contradicts</option><option>context</option></select></label>
        <label>Kind<input name="kind" value="founder_observation" maxlength="120" required></label>
        <label>Provider<input name="provider" value="founder" maxlength="120" required></label>
        <label class="truth-span-2">Evidence reference<input name="detailsRef" maxlength="2000" required placeholder="URL, artifact path, receipt ID, or exact source reference"></label>
        <button type="submit" ${claims?.length ? '' : 'disabled'}>Attach evidence</button>
        <output data-form-status role="status" aria-live="polite"></output>
      </form>
      ${tableHtml(['ID', 'Subject', 'Kind', 'Status', 'Provider', 'Claim links', 'Reference', 'Created'], rows)}`,
    );
    const form = document.getElementById('truth-attach-evidence');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const statusNode = form.querySelector('[data-form-status]');
      const fields = new FormData(form);
      try {
        statusNode.textContent = 'Attaching…';
        const body = await api(`/claims/${encodeURIComponent(fields.get('claimId'))}/evidence`, {
          method: 'POST',
          body: JSON.stringify({
            status: fields.get('status'), relation: fields.get('relation'), kind: fields.get('kind'),
            provider: fields.get('provider'), detailsRef: fields.get('detailsRef'),
          }),
        });
        const staleCount = body.invalidatedContinuity?.length ?? 0;
        rememberReceipt('truth-evidence', 'Evidence attached', [
          ['evidence', body.evidence?.id ?? '', 'code'],
          ['relation', body.evidence?.relation ?? 'context'],
          ['claim revision', body.claim?.revision ?? ''],
          ['prior proof cookies invalidated', staleCount],
          ['authority effect', body.authorityEffect ?? 'none'],
        ]);
        await renderEvidence(root);
      } catch (error) {
        statusNode.textContent = error.message;
      }
    });
  } catch (error) {
    root.innerHTML = errorScreen('truth-evidence', 'Evidence Inbox', error);
  }
}

async function renderReconcile(root) {
  try {
    const [{ claims }, { reconciliations }] = await Promise.all([api('/claims'), api('/reconciliations')]);
    const claimRows = (claims ?? []).map((claim) => `<tr>
      <td>${escapeHtml(claim.statement)}</td><td>${badge(claim.classification)}</td><td>${escapeHtml(claim.revision)}</td>
      <td><button class="truth-small-button" data-reconcile="${escapeHtml(claim.id)}" data-revision="${escapeHtml(claim.revision)}">Reconcile</button></td>
    </tr>`);
    const receiptRows = (reconciliations ?? []).map((run) => `<tr>
      <td><code>${escapeHtml(short(run.id, 12))}</code></td><td><code>${escapeHtml(short(run.resource_id, 12))}</code></td>
      <td>${badge(run.status)}</td><td>${escapeHtml(run.message ?? '')}</td><td>${fmtDate(run.completed_at ?? run.started_at)}</td>
    </tr>`);
    root.innerHTML = screenFrame(
      'truth-reconcile',
      'Reconciliation Workspace',
      'Reconcile the exact current claim revision into one atomic truth snapshot, receipt, and non-authorizing continuity cookie.',
      `<h3>Claims</h3>${tableHtml(['Claim', 'Current state', 'Revision', 'Action'], claimRows)}
       <h3>Receipts</h3>${tableHtml(['Receipt', 'Claim', 'Status', 'Message', 'Completed'], receiptRows)}`,
    );
    root.querySelectorAll('[data-reconcile]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const body = await api(`/claims/${encodeURIComponent(button.dataset.reconcile)}/reconcile`, {
            method: 'POST',
            body: JSON.stringify({ expectedRevision: Number(button.dataset.revision) }),
          });
          rememberReceipt('truth-reconcile', 'Reconciliation committed', [
            ['receipt', body.receipt?.id ?? '', 'code'],
            ['classification', body.claim?.classification ?? 'unknown', 'badge'],
            ['proof cookie', body.continuity?.proof_cookie ?? '', 'code'],
            ['cookie state', body.continuity?.state ?? 'unknown', 'badge'],
            ['authority effect', body.authorityEffect ?? 'none'],
          ]);
          await renderReconcile(root);
        } catch (error) {
          rememberReceipt('truth-reconcile', 'Reconciliation refused', [['reason', error.message]]);
          await renderReconcile(root);
        }
      });
    });
  } catch (error) {
    root.innerHTML = errorScreen('truth-reconcile', 'Reconciliation Workspace', error);
  }
}

async function renderAttacks(root) {
  try {
    const [{ claims }, evidenceData, { attacks }] = await Promise.all([api('/claims'), api('/evidence'), api('/attacks')]);
    const evidence = evidenceData.evidence ?? [];
    const claimLinks = evidenceData.claimLinks ?? [];
    const claimById = new Map((claims ?? []).map((claim) => [claim.id, claim]));
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const linksByClaim = new Map();
    for (const link of claimLinks) {
      const current = linksByClaim.get(link.claim_id) ?? [];
      current.push(link);
      linksByClaim.set(link.claim_id, current);
    }
    const claimOptions = (claims ?? []).map((claim) => `<option value="${escapeHtml(claim.id)}">${escapeHtml(short(claim.statement, 90))}</option>`).join('');
    const attackCards = (attacks ?? []).map((attack) => {
      const claim = claimById.get(attack.claim_id);
      const candidates = (linksByClaim.get(attack.claim_id) ?? [])
        .map((link) => ({ link, evidence: evidenceById.get(link.evidence_id) }))
        .filter((item) => item.evidence);
      const evidenceOptions = candidates.map(({ link, evidence: item }) => `<option value="${escapeHtml(item.id)}">${escapeHtml(link.relation)} · ${escapeHtml(short(item.details_ref || item.id, 70))}</option>`).join('');
      return `<article class="truth-panel truth-attack-card">
        <div class="truth-row"><strong>${escapeHtml(attack.attack_type)} attack</strong><span>${badge(attack.status)} ${badge(attack.severity)}</span></div>
        <p>${escapeHtml(attack.challenge)}</p>
        <small>Claim: ${escapeHtml(claim?.statement ?? attack.claim_id)}</small>
        ${attack.status === 'open' ? `<form class="truth-resolve-attack" data-attack-id="${escapeHtml(attack.id)}">
          <label>Answer<textarea name="answer" maxlength="4000" required></textarea></label>
          <label>Evidence already linked to this claim<select name="evidenceId" required>${evidenceOptions}</select></label>
          <button type="submit" ${evidenceOptions ? '' : 'disabled'}>Resolve attack</button><output data-form-status role="status" aria-live="polite"></output>
        </form>` : `<p><strong>Resolution:</strong> ${escapeHtml(attack.resolution_answer ?? '')}</p>`}
      </article>`;
    }).join('') || '<p class="truth-empty">No attacks yet.</p>';

    root.innerHTML = screenFrame(
      'truth-attacks',
      'Attack Center',
      'Challenge a claim, answer with evidence actually linked to that claim, then atomically force prior continuity stale before fresh reconciliation.',
      `<form class="truth-form" id="truth-create-attack">
        <label class="truth-span-2">Claim<select name="claimId" required>${claimOptions}</select></label>
        <label>Attack type<select name="attackType"><option>version</option><option>premise</option><option>evidence</option><option>authority</option><option>runtime</option></select></label>
        <label>Severity<select name="severity"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></label>
        <label class="truth-span-2">Challenge<textarea name="challenge" maxlength="4000" required></textarea></label>
        <button type="submit" ${claims?.length ? '' : 'disabled'}>Open attack</button><output data-form-status role="status" aria-live="polite"></output>
      </form>
      <div class="truth-card-stack">${attackCards}</div>`,
    );

    const createForm = document.getElementById('truth-create-attack');
    createForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = new FormData(createForm);
      const status = createForm.querySelector('[data-form-status]');
      try {
        status.textContent = 'Opening…';
        const body = await api('/attacks', { method: 'POST', body: JSON.stringify({ claimId: fields.get('claimId'), attackType: fields.get('attackType'), severity: fields.get('severity'), challenge: fields.get('challenge') }) });
        rememberReceipt('truth-attacks', 'Attack opened', [
          ['attack', body.attack?.id ?? '', 'code'],
          ['status', body.attack?.status ?? 'open', 'badge'],
          ['authority effect', body.authorityEffect ?? 'none'],
        ]);
        await renderAttacks(root);
      } catch (error) { status.textContent = error.message; }
    });

    root.querySelectorAll('.truth-resolve-attack').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = new FormData(form);
        const status = form.querySelector('[data-form-status]');
        try {
          status.textContent = 'Resolving…';
          const body = await api(`/attacks/${encodeURIComponent(form.dataset.attackId)}/resolve`, { method: 'POST', body: JSON.stringify({ answer: fields.get('answer'), evidenceId: fields.get('evidenceId') }) });
          rememberReceipt('truth-attacks', 'Attack resolved', [
            ['attack', body.attack?.id ?? '', 'code'],
            ['claim revision', body.claim?.revision ?? ''],
            ['proof cookies invalidated', body.invalidatedContinuity?.length ?? 0],
            ['cookie state', body.cookieState ?? 'stale', 'badge'],
            ['authority effect', body.authorityEffect ?? 'none'],
          ]);
          await renderAttacks(root);
        } catch (error) { status.textContent = error.message; }
      });
    });
  } catch (error) {
    root.innerHTML = errorScreen('truth-attacks', 'Attack Center', error);
  }
}

async function renderWorld(root) {
  try {
    const data = await api('/world-radar');
    const cards = [
      ['Jurisdictions', data.jurisdictions?.length ?? 0],
      ['Programs', data.programs?.length ?? 0],
      ['Opportunities', data.opportunities?.length ?? 0],
      ['Outcomes', data.outcomes?.length ?? 0],
      ['Signal observations', data.observations?.length ?? 0],
    ].map(([label, count]) => `<article class="truth-metric"><strong>${escapeHtml(count)}</strong><span>${escapeHtml(label)}</span></article>`).join('');
    const opportunityRows = (data.opportunities ?? []).map((item) => `<tr><td>${escapeHtml(item.title ?? item.name ?? item.id)}</td><td>${escapeHtml(item.status ?? item.category ?? '')}</td><td>${fmtDate(item.updated_at ?? item.created_at)}</td></tr>`);
    root.innerHTML = screenFrame(
      'truth-world',
      'World Radar',
      'Read-only view of persisted economic intelligence and portfolio signal observations. Empty means no ingested records, not synthetic demo data.',
      `<div class="truth-metrics">${cards}</div>
       ${data.empty ? '<div class="truth-empty">No persisted world-radar records yet. The screen is live and intentionally refuses to substitute fixtures.</div>' : ''}
       <h3>Opportunities</h3>${tableHtml(['Opportunity', 'State', 'Observed'], opportunityRows)}`,
    );
  } catch (error) {
    root.innerHTML = errorScreen('truth-world', 'World Radar', error);
  }
}

async function renderContinuity(root) {
  try {
    const { continuity } = await api('/continuity');
    const rows = (continuity ?? []).map((item) => `<tr>
      <td><code>${escapeHtml(short(item.id, 12))}</code></td>
      <td>${badge(item.state)}</td>
      <td><code title="${escapeHtml(item.proof_cookie ?? '')}">${escapeHtml(short(item.proof_cookie, 34))}</code></td>
      <td><code>${escapeHtml(short(item.subject_fingerprint, 20))}</code></td>
      <td>${escapeHtml(item.invalidation_reason ?? '')}</td>
      <td>${fmtDate(item.valid_until)}</td>
    </tr>`);
    root.innerHTML = screenFrame(
      'truth-continuity',
      'Continuity',
      'Historical fingerprints and proof cookies. These markers can become stale or expire; they never create or expand authority.',
      tableHtml(['Record', 'State', 'Proof cookie', 'Subject fingerprint', 'Invalidation', 'Valid until'], rows),
    );
  } catch (error) {
    root.innerHTML = errorScreen('truth-continuity', 'Continuity', error);
  }
}

async function renderTruthTab(tab) {
  const root = contentRoot();
  if (!root) return;
  activeTruthTab = tab;
  setActive(tab);
  setUrlTab(tab);
  root.innerHTML = '<div class="truth-loading" role="status" aria-live="polite">Loading verified state…</div>';
  if (tab === 'truth-dashboard') return renderDashboard(root);
  if (tab === 'truth-claims') return renderClaims(root);
  if (tab === 'truth-evidence') return renderEvidence(root);
  if (tab === 'truth-reconcile') return renderReconcile(root);
  if (tab === 'truth-attacks') return renderAttacks(root);
  if (tab === 'truth-world') return renderWorld(root);
  if (tab === 'truth-continuity') return renderContinuity(root);
}

function ensureStylesheet() {
  if (document.querySelector('link[data-truth-console-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/control-room/truth-console.css';
  link.dataset.truthConsoleCss = 'true';
  document.head.append(link);
}

function truthTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = TRUTH_TABS
    .map(([id]) => document.getElementById(`truth-tab-${id}`))
    .filter((button) => button instanceof HTMLButtonElement);
  if (!buttons.length) return;
  const current = buttons.indexOf(event.currentTarget);
  if (current < 0) return;
  event.preventDefault();
  let next = current;
  if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
  if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  buttons[next].focus();
  buttons[next].click();
}

function injectTabs() {
  const tabs = document.querySelector('.tabs');
  if (!(tabs instanceof HTMLElement)) return false;
  for (const [id, label] of TRUTH_TABS) {
    let button = tabs.querySelector(`button[data-tab="${id}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = id;
      button.textContent = label;
      button.addEventListener('click', () => { void renderTruthTab(id); });
      button.addEventListener('keydown', truthTabKeydown);
      tabs.append(button);
    }
    button.id = `truth-tab-${id}`;
    button.dataset.truthTab = 'true';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'tab-content');
    button.setAttribute('aria-selected', activeTruthTab === id ? 'true' : 'false');
    button.tabIndex = activeTruthTab === id ? 0 : -1;
  }
  if (activeTruthTab && document.querySelector('[data-truth-screen]')) setActive(activeTruthTab);
  return true;
}

export function installTruthConsole() {
  ensureStylesheet();
  injectTabs();
  if (!installObserver) {
    const root = document.getElementById('root');
    if (root) {
      installObserver = new MutationObserver(() => { injectTabs(); });
      installObserver.observe(root, { childList: true, subtree: true });
    }
  }
}
