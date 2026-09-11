const BIP_SLUG = 'sekret-bip';
const STYLE_ID = 'fcr-project-shell-styles';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .project-truth-shell{margin:0 0 1rem;border:1px solid rgba(167,139,250,.4);background:linear-gradient(145deg,rgba(76,29,149,.18),rgba(15,23,42,.92));box-shadow:inset 0 0 36px rgba(59,130,246,.06)}
    .project-truth-shell__head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
    .project-truth-shell__head h3{margin:.15rem 0 .35rem;letter-spacing:.04em}
    .project-truth-shell__eyebrow{margin:0;color:#c4b5fd;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .project-truth-shell__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin-top:1rem}
    .project-truth-shell__grid>div{display:grid;gap:.25rem;min-height:5.3rem;padding:.75rem;border:1px solid rgba(148,163,184,.2);border-radius:.85rem;background:rgba(2,6,23,.46)}
    .project-truth-shell__grid strong{color:#ddd6fe;font-size:.76rem;letter-spacing:.04em;text-transform:uppercase}
    .project-truth-shell__grid span{color:#cbd5e1;font-size:.82rem;line-height:1.4}
    @media(max-width:720px){.project-truth-shell__grid{grid-template-columns:1fr}.project-truth-shell__head{align-items:center}}
  `;
  document.head.appendChild(style);
}
function selectedProjectSlug(panel) {
  const mono = panel.querySelector('h2 .mono');
  return mono?.textContent?.replace(/[()]/g, '').trim() ?? '';
}
function badgeClass(classification) {
  if (classification === 'VERIFIED') return 'ok';
  if (classification === 'BLOCKED' || classification === 'CONFLICTED') return 'danger';
  return 'warn';
}
function describeRecovery(recovery) {
  if (!recovery) return 'No canonical recovery plan recorded.';
  return `${recovery.status ?? 'planned'} · rollback · retry · reconcile · compensate · abandon`;
}
function describeResources(resources) {
  if (!Array.isArray(resources) || resources.length === 0) return 'No canonical resource budget recorded.';
  return resources.map((r) => `${r.resource_type}: ${r.consumed ?? 0}${r.ceiling == null ? '' : ` / ${r.ceiling}`} ${r.unit ?? ''}`.trim()).join(' · ');
}
async function loadCanonicalState() {
  const response = await fetch(`/projects/${encodeURIComponent(BIP_SLUG)}/shell-state`, {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`shell-state HTTP ${response.status}`);
  const body = await response.json();
  if (body?.contract !== 'fcr/project-shell-state@v1') throw new Error('shell-state contract mismatch');
  return body.canonical;
}
function shellMarkup(canonical) {
  const classification = String(canonical?.classification ?? 'unknown').toUpperCase();
  const truth = canonical?.truth;
  const truthText = canonical?.available === false
    ? 'Canonical shell state is unavailable. FCR will not manufacture verification.'
    : truth
      ? `Observed ${truth.observed_at ?? 'at an unknown time'}${truth.expires_at ? ` · expires ${truth.expires_at}` : ''}.`
      : 'No canonical TruthSnapshot has been recorded. Classification remains UNKNOWN.';
  const outcome = canonical?.outcome;
  const outcomeText = outcome ? `${outcome.classification ?? 'unknown'}${outcome.actual_outcome ? ` · ${outcome.actual_outcome}` : ''}` : 'No canonical outcome recorded.';
  const continuity = canonical?.continuity;
  const continuityText = continuity ? `${continuity.invalidated_at ? 'Invalidated' : 'Present'}${continuity.valid_until ? ` · valid until ${continuity.valid_until}` : ''}. Continuity never renews authority.` : 'No continuity record. Authority is not inferred.';
  return `
    <div class="project-truth-shell__head"><div><p class="project-truth-shell__eyebrow">Se’kret Bip · individualized project shell</p><h3>TRUTHMODE / CONFESS</h3></div><span class="badge ${badgeClass(classification)}">${escapeHtml(classification)}</span></div>
    <p class="muted">Customer safety and privacy stay inside Bip's boundary. FCR observes and operates only through bounded project authority.</p>
    <div class="project-truth-shell__grid">
      <div><strong>Intent</strong><span>Safe, verified emotional-wellness product progress</span></div>
      <div><strong>Truth</strong><span>${escapeHtml(truthText)}</span></div>
      <div><strong>Continuity</strong><span>${escapeHtml(continuityText)}</span></div>
      <div><strong>Outcome</strong><span>${escapeHtml(outcomeText)}</span></div>
      <div><strong>Resources</strong><span>${escapeHtml(describeResources(canonical?.resources))}</span></div>
      <div><strong>Recovery</strong><span>${escapeHtml(describeRecovery(canonical?.recovery))}</span></div>
      <div><strong>Safety</strong><span>Teen/family product boundary remains isolated from the FCR founder shell.</span></div>
      <div><strong>Next gate</strong><span>Require exact runtime and Playwright evidence before promoting this shell to VERIFIED.</span></div>
    </div>`;
}
async function renderBipShell(panel) {
  if (panel.querySelector('[data-project-shell="sekret-bip"]')) return;
  const shell = document.createElement('section');
  shell.className = 'panel project-truth-shell';
  shell.dataset.projectShell = BIP_SLUG;
  shell.setAttribute('aria-label', 'Se’kret Bip project truth shell');
  shell.innerHTML = shellMarkup({ classification: 'unknown', reason: 'loading' });
  panel.prepend(shell);
  try {
    shell.innerHTML = shellMarkup(await loadCanonicalState());
  } catch {
    shell.innerHTML = shellMarkup({ available: false, classification: 'unknown', reason: 'canonical_shell_state_unavailable' });
  }
}
function reconcileProjectShell() {
  const panel = document.querySelector('#project-detail');
  if (!(panel instanceof HTMLElement) || panel.style.display === 'none') return;
  if (selectedProjectSlug(panel) === BIP_SLUG) void renderBipShell(panel);
}
export function installProjectShellUi() {
  const root = document.getElementById('root');
  if (!root) return;
  installStyles();
  reconcileProjectShell();
  new MutationObserver(reconcileProjectShell).observe(root, { childList: true, subtree: true });
}
