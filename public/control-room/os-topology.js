export const FCR_OS_TOPOLOGY_CONTRACT = 'fcr/os-topology@v1';

export const FCR_OS_SYSTEMS = Object.freeze([
  Object.freeze({
    id: 'ultrathink',
    label: 'ULTRATHINK',
    role: 'Reason, red-team, and constrain the goal before capability selection.',
    authorityCeiling: 'reason',
    href: '/control-room/goalfix.html',
  }),
  Object.freeze({
    id: 'promptos',
    label: 'PromptOS',
    role: 'Govern reusable prompts, skills, instructions, and behavior contracts.',
    authorityCeiling: 'reason',
    screen: 'PromptOS',
  }),
  Object.freeze({
    id: 'chief-ai-machine',
    label: 'Chief',
    role: 'Compose capabilities, synthesize evidence, and recommend the bounded next move.',
    authorityCeiling: 'reason',
    screen: 'Chief',
  }),
  Object.freeze({
    id: 'founder-control-room',
    label: 'FCR Control',
    role: 'Resolve founder authority, coordination, exact-head evidence, and execution gates.',
    authorityCeiling: 'govern',
    authorityOwner: true,
    screen: 'Control',
  }),
  Object.freeze({
    id: 'project-runtime',
    label: 'Project runtime',
    role: 'Execute only inside the selected project shell and its bounded provider/runtime authority.',
    authorityCeiling: 'bounded-execution',
    screen: 'Control',
  }),
  Object.freeze({
    id: 'evidence-trust',
    label: 'Proof',
    role: 'Return runtime, browser, provider, and outcome receipts to the evidence plane.',
    authorityCeiling: 'observe',
    screen: 'Proof',
  }),
  Object.freeze({
    id: 'solcontinuity',
    label: 'Continuity',
    role: 'Carry non-secret context, fingerprints, proof cookies, invalidation state, and the next gate into the next cycle.',
    authorityCeiling: 'context',
    href: '/control-room/evidence-trust.html',
  }),
]);

export const FCR_OS_HANDOFFS = Object.freeze([
  Object.freeze({ from: 'ultrathink', to: 'promptos', payload: 'strategy-and-constraints', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'promptos', to: 'chief-ai-machine', payload: 'governed-capability-context', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'chief-ai-machine', to: 'founder-control-room', payload: 'recommendation-and-capability-plan', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'founder-control-room', to: 'project-runtime', payload: 'founder-authorized-execution-envelope', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'project-runtime', to: 'evidence-trust', payload: 'runtime-and-outcome-evidence', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'evidence-trust', to: 'founder-control-room', payload: 'verified-receipt', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'founder-control-room', to: 'solcontinuity', payload: 'continuity-snapshot', authorityTransfer: false, recipientVerificationRequired: true }),
  Object.freeze({ from: 'solcontinuity', to: 'ultrathink', payload: 'next-cycle-context', authorityTransfer: false, recipientVerificationRequired: true }),
]);

export const FCR_OS_TOPOLOGY = Object.freeze({
  contract: FCR_OS_TOPOLOGY_CONTRACT,
  authorityOwner: 'founder-control-room',
  executionAuthorized: false,
  authorityTransferred: false,
  systems: FCR_OS_SYSTEMS,
  handoffs: FCR_OS_HANDOFFS,
});

const STYLE_ID = 'fcr-os-topology-style';
const PANEL_SELECTOR = '[data-fcr-os-topology]';
const CONTEXT_KEY = 'fcr_founder_context';

export function validateFcrOsTopology(topology = FCR_OS_TOPOLOGY) {
  const errors = [];
  const ids = new Set(topology.systems.map((system) => system.id));
  if (ids.size !== topology.systems.length) errors.push('system ids must be unique');
  if (topology.contract !== FCR_OS_TOPOLOGY_CONTRACT) errors.push('topology contract mismatch');
  if (topology.authorityOwner !== 'founder-control-room') errors.push('FCR must remain the authority owner');
  if (topology.executionAuthorized !== false) errors.push('topology metadata must never authorize execution');
  if (topology.authorityTransferred !== false) errors.push('topology metadata must never transfer authority');

  const authorityOwners = topology.systems.filter((system) => system.authorityOwner === true);
  if (authorityOwners.length !== 1 || authorityOwners[0]?.id !== 'founder-control-room') {
    errors.push('exactly one control-plane authority owner is required');
  }

  for (const handoff of topology.handoffs) {
    if (!ids.has(handoff.from) || !ids.has(handoff.to)) errors.push(`unknown handoff endpoint: ${handoff.from}->${handoff.to}`);
    if (handoff.authorityTransfer !== false) errors.push(`authority transfer forbidden: ${handoff.from}->${handoff.to}`);
    if (handoff.recipientVerificationRequired !== true) errors.push(`recipient verification required: ${handoff.from}->${handoff.to}`);
  }

  const required = [
    'ultrathink->promptos',
    'promptos->chief-ai-machine',
    'chief-ai-machine->founder-control-room',
    'founder-control-room->project-runtime',
    'project-runtime->evidence-trust',
    'evidence-trust->founder-control-room',
    'founder-control-room->solcontinuity',
    'solcontinuity->ultrathink',
  ];
  const actual = new Set(topology.handoffs.map((handoff) => `${handoff.from}->${handoff.to}`));
  for (const edge of required) if (!actual.has(edge)) errors.push(`missing required handoff: ${edge}`);

  return errors;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function selectedProjectLabel() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    const context = raw ? JSON.parse(raw) : null;
    const label = context?.projectName || context?.projectSlug;
    return typeof label === 'string' && label.trim() ? label.trim() : 'Selected project shell';
  } catch {
    return 'Selected project shell';
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .founder-os-topology{margin:1rem 0;padding:1rem;border:1px solid rgba(167,139,250,.34);border-radius:12px;background:linear-gradient(145deg,rgba(76,29,149,.12),rgba(15,23,42,.72))}
    .founder-os-topology__head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
    .founder-os-topology__head h3{margin:.15rem 0 .25rem;font-size:1rem}
    .founder-os-topology__head p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.45}
    .founder-os-topology__badge{padding:.3rem .5rem;border:1px solid rgba(103,232,165,.32);border-radius:999px;color:#9de8c4;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .founder-os-topology__flow{display:grid;grid-template-columns:repeat(7,minmax(7.25rem,1fr));gap:.42rem;margin-top:.85rem;overflow-x:auto;padding:.15rem .05rem .35rem}
    .founder-os-node{position:relative;display:grid;align-content:start;gap:.2rem;min-height:5rem;padding:.65rem;border:1px solid var(--panel-border);border-radius:9px;background:rgba(10,13,20,.74);color:var(--text);text-align:left;text-decoration:none;font:inherit}
    button.founder-os-node{cursor:pointer}
    .founder-os-node:not(:last-child)::after{content:'→';position:absolute;right:-.36rem;top:50%;z-index:2;transform:translate(50%,-50%);color:#a78bfa;font-weight:900}
    .founder-os-node strong{font-size:.78rem}
    .founder-os-node small{color:var(--muted);font-size:.66rem;line-height:1.35}
    .founder-os-node[data-authority-owner='true']{border-color:rgba(79,209,197,.52);box-shadow:inset 0 0 24px rgba(79,209,197,.06)}
    .founder-os-topology__return{margin:.65rem 0 0;color:var(--muted);font-size:.72rem;line-height:1.45}
    @media(max-width:760px){.founder-os-topology__flow{grid-template-columns:repeat(7,minmax(7.8rem,1fr))}}
  `;
  document.head.appendChild(style);
}

function nodeMarkup(system, projectLabel) {
  const label = system.id === 'project-runtime' ? projectLabel : system.label;
  const common = `class="founder-os-node" data-os-system="${escapeText(system.id)}" data-authority-owner="${system.authorityOwner === true}"`;
  const content = `<strong>${escapeText(label)}</strong><small>${escapeText(system.role)}</small>`;
  if (system.screen) return `<button type="button" ${common} data-os-screen="${escapeText(system.screen)}">${content}</button>`;
  return `<a ${common} href="${escapeText(system.href)}">${content}</a>`;
}

function topologyMarkup(projectLabel) {
  const validationErrors = validateFcrOsTopology();
  if (validationErrors.length > 0) {
    return `<p class="error">Founder OS topology invalid: ${escapeText(validationErrors.join('; '))}</p>`;
  }
  return `
    <div class="founder-os-topology__head">
      <div><p class="eyebrow">Founder OS spine</p><h3>One loop, one authority plane.</h3><p>Each system keeps its job. Handoffs carry evidence and context, never borrowed authority.</p></div>
      <span class="founder-os-topology__badge">FCR governs · no authority transfer</span>
    </div>
    <div class="founder-os-topology__flow" data-authority-transfer="false">
      ${FCR_OS_SYSTEMS.map((system) => nodeMarkup(system, projectLabel)).join('')}
    </div>
    <p class="founder-os-topology__return"><strong>Return loop:</strong> project evidence → Proof → FCR verification → Continuity → the next ULTRATHINK cycle. L99 stays a Chief operating method, not a rival control plane.</p>
  `;
}

function activateScreen(label) {
  const button = [...document.querySelectorAll('.founder-screen-nav button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (button instanceof HTMLButtonElement) button.click();
}

function reconcileTopologyUi() {
  const home = document.querySelector('.founder-home');
  if (!(home instanceof HTMLElement) || home.hidden) return;
  installStyles();

  const projectLabel = selectedProjectLabel();
  let panel = home.querySelector(PANEL_SELECTOR);
  if (!(panel instanceof HTMLElement)) {
    panel = document.createElement('section');
    panel.className = 'founder-os-topology';
    panel.dataset.fcrOsTopology = FCR_OS_TOPOLOGY_CONTRACT;
    panel.setAttribute('aria-label', 'Founder OS connection spine');
    const intro = home.querySelector('.founder-screen-intro');
    if (intro) intro.insertAdjacentElement('afterend', panel);
    else home.prepend(panel);
  }

  if (panel.dataset.projectLabel !== projectLabel) {
    panel.dataset.projectLabel = projectLabel;
    panel.innerHTML = topologyMarkup(projectLabel);
  }
}

export function installFounderOsTopologyUi() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-os-screen]') : null;
    if (!(target instanceof HTMLElement)) return;
    const screen = target.dataset.osScreen;
    if (screen) activateScreen(screen);
  });

  const observer = new MutationObserver(() => queueMicrotask(reconcileTopologyUi));
  observer.observe(root, { childList: true, subtree: true });
  reconcileTopologyUi();
}

if (typeof document !== 'undefined') installFounderOsTopologyUi();
