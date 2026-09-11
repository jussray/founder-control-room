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
function truthClass(panel) { return panel.querySelector('.error') ? 'BLOCKED' : 'UNKNOWN'; }
function renderBipShell(panel) {
  if (panel.querySelector('[data-project-shell="sekret-bip"]')) return;
  const classification = truthClass(panel);
  const shell = document.createElement('section');
  shell.className = 'panel project-truth-shell';
  shell.dataset.projectShell = BIP_SLUG;
  shell.setAttribute('aria-label', 'Se’kret Bip project truth shell');
  shell.innerHTML = `
    <div class="project-truth-shell__head"><div><p class="project-truth-shell__eyebrow">Se’kret Bip · individualized project shell</p><h3>TRUTHMODE / CONFESS</h3></div><span class="badge ${classification === 'BLOCKED' ? 'danger' : 'warn'}">${escapeHtml(classification)}</span></div>
    <p class="muted">Customer safety and privacy stay inside Bip's boundary. FCR observes and operates only through bounded project authority.</p>
    <div class="project-truth-shell__grid">
      <div><strong>Intent</strong><span>Safe, verified emotional-wellness product progress</span></div>
      <div><strong>Truth</strong><span>${classification === 'BLOCKED' ? 'A visible project error blocks a verified claim.' : 'No canonical TruthSnapshot is exposed to this browser view yet.'}</span></div>
      <div><strong>Authority</strong><span>Project-scoped. No authority is inferred from connection or continuity.</span></div>
      <div><strong>Safety</strong><span>Teen/family product boundary remains isolated from the FCR founder shell.</span></div>
      <div><strong>Runtime</strong><span>Mobile · Supabase · Cloudflare · Firebase</span></div>
      <div><strong>Proof</strong><span>Playwright + runtime + provider + outcome evidence required.</span></div>
      <div><strong>Recovery</strong><span>Rollback · retry · reconcile · compensate · abandon</span></div>
      <div><strong>Next gate</strong><span>Expose canonical project-shell state through the founder-gated API, then verify this surface end to end.</span></div>
    </div>`;
  panel.prepend(shell);
}
function reconcileProjectShell() {
  const panel = document.querySelector('#project-detail');
  if (!(panel instanceof HTMLElement) || panel.style.display === 'none') return;
  if (selectedProjectSlug(panel) === BIP_SLUG) renderBipShell(panel);
}
export function installProjectShellUi() {
  const root = document.getElementById('root');
  if (!root) return;
  installStyles();
  reconcileProjectShell();
  new MutationObserver(reconcileProjectShell).observe(root, { childList: true, subtree: true });
}
