const CANON = 'dashboard-v3';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'GOOD MORNING, RAY' : h < 18 ? 'GOOD AFTERNOON, RAY' : 'GOOD EVENING, RAY';
}

function injectStylesheet() {
  if (document.querySelector('link[data-fcr-visual-canon]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/control-room/fcr-visual-shell.css';
  link.dataset.fcrVisualCanon = CANON;
  document.head.appendChild(link);
}

function addTopbarSearch() {
  const topbar = document.querySelector('.topbar');
  if (!(topbar instanceof HTMLElement) || topbar.querySelector('[data-fcr-nav-search]')) return;
  const input = document.createElement('input');
  input.className = 'fcr-nav-search';
  input.type = 'search';
  input.placeholder = 'Search this Control Room…';
  input.setAttribute('aria-label', 'Filter Control Room navigation');
  input.dataset.fcrNavSearch = '';
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('.tabs button, .side-link').forEach((node) => {
      node.hidden = q !== '' && !node.textContent.toLowerCase().includes(q);
    });
  });
  topbar.prepend(input);

  if (!topbar.querySelector('[data-fcr-workspace]')) {
    const chip = document.createElement('div');
    chip.className = 'fcr-workspace-chip';
    chip.dataset.fcrWorkspace = '';
    chip.innerHTML = '<small>Workspace</small><strong>FCR System</strong><span>USER · BUILDER · FOUNDER · OWNER</span>';
    const actions = topbar.querySelector('.topbar-actions');
    if (actions) topbar.insertBefore(chip, actions);
  }
}

function decorateSidebar() {
  const side = document.querySelector('.sidebar');
  if (!(side instanceof HTMLElement)) return;
  const labels = { home: 'Home', projects: 'My Work', missions: 'Build', activity: 'Live Signals', l99: 'Proof', promptos: 'PromptOS', analytics: 'Spend', terminal: 'Run' };
  side.querySelectorAll('.tabs button[data-tab]').forEach((button) => {
    const label = button.querySelector('span:last-child');
    const desired = labels[button.dataset.tab];
    if (label && desired && label.textContent !== desired) label.textContent = desired;
  });

  if (!side.querySelector('[data-founder-chip]')) {
    const chip = document.createElement('div');
    chip.className = 'fcr-founder-chip';
    chip.dataset.founderChip = '';
    chip.innerHTML = '<span class="fcr-founder-avatar">R</span><span><strong>Ray 👑</strong><small>Founder • Owner</small></span>';
    side.appendChild(chip);
  }
}

function decorateCouncil(chief) {
  if (!(chief instanceof HTMLElement)) return;
  chief.classList.add('fcr-council');
  const kicker = chief.querySelector('.chief-kicker');
  if (kicker) kicker.innerHTML = 'AI COUNCIL <span class="fcr-online">3 online</span>';
  const heading = chief.querySelector('h2');
  if (heading) heading.textContent = 'Strategy · Build · Intelligence · Automation';
  const prompt = chief.querySelector('.chief-prompt');
  if (prompt) prompt.textContent = 'Ask the Council anything…';

  if (!chief.querySelector('[data-council-roster]')) {
    const roster = document.createElement('div');
    roster.className = 'fcr-council-roster';
    roster.dataset.councilRoster = '';
    roster.innerHTML = '<div class="fcr-agent"><span>♛</span><strong>Chief</strong><small>Strategy</small></div><div class="fcr-agent"><span>S</span><strong>Sol</strong><small>Build</small></div><div class="fcr-agent"><span>P</span><strong>PromptOS</strong><small>Intelligence</small></div><div class="fcr-agent"><span>L</span><strong>Lindy</strong><small>Automation</small></div>';
    const promptNode = chief.querySelector('.chief-prompt');
    chief.insertBefore(roster, promptNode ?? chief.firstChild);
  }

  const commandLabels = ['Strategize', 'Build', 'Create', 'Analyze', 'Solve', 'Launch'];
  chief.querySelectorAll('.chief-route strong').forEach((strong, index) => {
    const desired = commandLabels[index];
    if (desired && strong.textContent !== desired) strong.textContent = desired;
  });
  chief.querySelectorAll('.chief-route span').forEach((span) => {
    if (span.textContent !== '') span.textContent = '';
  });
}

function decorateHome() {
  const home = document.querySelector('[data-home]');
  if (!(home instanceof HTMLElement) || home.dataset.fcrCanon === CANON) return;
  home.dataset.fcrCanon = CANON;
  const greetingNode = home.querySelector('.hero-greeting');
  if (greetingNode) greetingNode.textContent = greeting();
  const title = home.querySelector('.hero-title');
  if (title) title.innerHTML = 'SAME TRUTH.<br><span>HIGHER OUTCOMES.</span>';
  const tagline = home.querySelector('.hero-tagline');
  if (tagline) tagline.textContent = 'FOUNDER · BUILDER · OPERATOR · VISIONARY · IMPACT';
  const lede = home.querySelector('.hero-lede');
  if (lede) lede.textContent = 'Turn ideas into products, products into revenue, and vision into lasting impact, all from one place.';
  decorateCouncil(home.querySelector('.chief'));
}

function decorate() {
  document.body.dataset.fcrCanon = CANON;
  injectStylesheet();
  addTopbarSearch();
  decorateSidebar();
  decorateHome();
}

injectStylesheet();
decorate();
const root = document.getElementById('root');
if (root) {
  const observer = new MutationObserver(() => decorate());
  observer.observe(root, { childList: true, subtree: true });
}
