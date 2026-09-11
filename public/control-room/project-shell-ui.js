const BIP_SLUG = 'sekret-bip';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectedProjectSlug(panel) {
  const mono = panel.querySelector('h2 .mono');
  return mono?.textContent?.replace(/[()]/g, '').trim() ?? '';
}

function truthClass(panel) {
  if (panel.querySelector('.error')) return 'BLOCKED';
  return 'UNKNOWN';
}

function renderBipShell(panel) {
  if (panel.querySelector('[data-project-shell="sekret-bip"]')) return;
  const classification = truthClass(panel);
  const shell = document.createElement('section');
  shell.className = 'panel project-truth-shell';
  shell.dataset.projectShell = BIP_SLUG;
  shell.setAttribute('aria-label', 'Se’kret Bip project truth shell');
  shell.innerHTML = `
    <div class="project-truth-shell__head">
      <div>
        <p class="project-truth-shell__eyebrow">Se’kret Bip · individualized project shell</p>
        <h3>TRUTHMODE / CONFESS</h3>
      </div>
      <span class="badge ${classification === 'BLOCKED' ? 'danger' : 'warn'}">${escapeHtml(classification)}</span>
    </div>
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
    </div>
  `;
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
  reconcileProjectShell();
  const observer = new MutationObserver(reconcileProjectShell);
  observer.observe(root, { childList: true, subtree: true });
}
