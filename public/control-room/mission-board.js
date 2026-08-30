const BOARD_SELECTOR = '#mission-lanes';
const MAX_PROOF_READS = 6;
const PROOF_CACHE_TTL_MS = 10_000;
const PROOF_READ_STATUSES = new Set(['in_review', 'approved']);
const TERMINAL_STATUSES = new Set(['integrated', 'deployed', 'rejected', 'rolled_back']);
const STYLE_ID = 'fcr-mission-board-styles';
const proofCache = new Map();

async function founderGet(path) {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error(`Mission board proof read failed (${response.status})`);
  return response.json();
}

function tasksFromBoard(board) {
  const tasks = [];
  board.querySelectorAll('.lane').forEach((lane) => {
    const heading = lane.querySelector('h4')?.textContent?.trim() ?? '';
    const status = heading.replace(/\s*\(\d+\)\s*$/, '').trim();
    if (!status) return;

    lane.querySelectorAll('.card[data-id]').forEach((card) => {
      if (card.dataset.id) tasks.push({ id: card.dataset.id, status });
    });
  });
  return tasks;
}

function proofStateFromRuns(runs) {
  const latest = Array.isArray(runs) ? runs[0] : null;
  if (!latest) return { state: 'unknown', label: 'Proof unknown', checkedAt: null };

  if (latest.status === 'passed') {
    return { state: 'passed', label: 'Proof passed', checkedAt: latest.finished_at ?? latest.started_at ?? null };
  }

  if (latest.status === 'failed') {
    return { state: 'failed', label: 'Proof failed', checkedAt: latest.finished_at ?? latest.started_at ?? null };
  }

  return {
    state: 'pending',
    label: `Proof ${String(latest.status ?? 'pending')}`,
    checkedAt: latest.finished_at ?? latest.started_at ?? null,
  };
}

function lifecycleProof(task) {
  if (task.status === 'proposed') return { state: 'not-required', label: 'Proof not required yet', checkedAt: null };
  if (task.status === 'sandboxed') return { state: 'pending', label: 'Proof pending', checkedAt: null };
  return { state: 'unknown', label: 'Proof unknown', checkedAt: null };
}

function nextGate(task, proof) {
  if (proof.state === 'failed') return 'Repair failed proof before advancing.';
  if (task.status === 'approved' && proof.state !== 'passed') {
    return 'Reacquire fresh exact-head proof before the founder can consider integration.';
  }
  if (task.status === 'proposed') return 'Founder decides whether to authorize a bounded sandbox branch.';
  if (task.status === 'sandboxed') return 'Build the focused change, then produce exact-head proof.';
  if (task.status === 'in_review') return proof.state === 'passed'
    ? 'Independent review is the next authority gate.'
    : 'Complete exact-head proof before review can carry authority.';
  if (task.status === 'approved') return 'Founder decides whether to integrate the exact approved head.';
  if (task.status === 'integrated') return 'Verify deployed runtime before claiming production truth.';
  if (task.status === 'deployed') return 'Observe runtime evidence and reopen only on material drift.';
  if (task.status === 'rejected') return 'Preserve provenance; mint a clean successor only if the goal still matters.';
  if (task.status === 'rolled_back') return 'Verify rollback truth before reopening the mission.';
  return 'Reacquire current evidence before taking another consequential action.';
}

function authorityLabel(task, proof) {
  if (proof.state === 'failed') return { tone: 'blocked', text: 'Repair required' };
  if (task.status === 'approved' && proof.state !== 'passed') return { tone: 'blocked', text: 'Proof required' };
  if (task.status === 'approved') return { tone: 'founder', text: 'Founder gate' };
  if (task.status === 'in_review' && proof.state === 'passed') return { tone: 'review', text: 'Review gate' };
  if (TERMINAL_STATUSES.has(task.status)) return { tone: 'terminal', text: 'Observed state' };
  return { tone: 'bounded', text: 'No execution authority' };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .mission-board-intel{margin:0 0 1rem;padding:1rem;border:1px solid rgba(148,163,184,.28);border-radius:1rem;background:linear-gradient(135deg,rgba(124,58,237,.12),rgba(15,23,42,.78) 44%,rgba(15,23,42,.72))}
    .mission-board-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.85rem}
    .mission-board-heading h3{margin:0;color:#f8fafc;font-size:1.05rem}
    .mission-board-heading p{margin:.25rem 0 0;color:#aebbd0;font-size:.78rem;line-height:1.4;max-width:48rem}
    .mission-board-mode{flex:0 0 auto;padding:.3rem .52rem;border:1px solid rgba(167,139,250,.42);border-radius:999px;color:#ddd6fe;background:rgba(76,29,149,.18);font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .mission-board-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}
    .mission-board-stat{min-width:0;padding:.72rem;border:1px solid rgba(148,163,184,.18);border-radius:.8rem;background:rgba(2,6,23,.5)}
    .mission-board-stat span{display:block;color:#94a3b8;font-size:.68rem;font-weight:750;text-transform:uppercase;letter-spacing:.06em}
    .mission-board-stat strong{display:block;margin-top:.18rem;color:#f8fafc;font-size:1.2rem}
    .mission-evidence-row{display:flex;align-items:center;gap:.38rem;flex-wrap:wrap;margin-top:.55rem}
    .mission-proof-badge,.mission-authority-badge{display:inline-flex;align-items:center;width:max-content;max-width:100%;padding:.23rem .42rem;border:1px solid rgba(148,163,184,.24);border-radius:999px;background:rgba(15,23,42,.72);color:#cbd5e1;font-size:.66rem;font-weight:800;line-height:1.2}
    .mission-proof-badge[data-proof='passed']{border-color:rgba(103,232,165,.42);color:#a7f3d0}
    .mission-proof-badge[data-proof='failed']{border-color:rgba(251,113,133,.48);color:#fecdd3}
    .mission-proof-badge[data-proof='pending']{border-color:rgba(250,204,21,.38);color:#fde68a}
    .mission-authority-badge[data-tone='founder']{border-color:rgba(196,181,253,.5);color:#ddd6fe}
    .mission-authority-badge[data-tone='review']{border-color:rgba(125,211,252,.45);color:#bae6fd}
    .mission-authority-badge[data-tone='blocked']{border-color:rgba(251,113,133,.48);color:#fecdd3}
    .mission-next-gate{margin:.45rem 0 0;color:#aebbd0;font-size:.7rem;line-height:1.35}
    .mission-next-gate strong{color:#e2e8f0}
    @media(max-width:760px){.mission-board-heading{display:grid}.mission-board-mode{justify-self:start}.mission-board-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.mission-board-intel{padding:.85rem}}
  `;
  document.head.appendChild(style);
}

function cachedProof(task) {
  if (task.status === 'approved') return null;
  const cached = proofCache.get(task.id);
  if (!cached) return null;
  if (cached.taskStatus !== task.status) return null;
  if (Date.now() - cached.cachedAt > PROOF_CACHE_TTL_MS) return null;
  return cached.proof;
}

async function readProof(task) {
  const cached = cachedProof(task);
  if (cached) return cached;

  const body = await founderGet(`/missions/${encodeURIComponent(task.id)}/runs`);
  const proof = proofStateFromRuns(body?.runs ?? []);
  proofCache.set(task.id, { taskStatus: task.status, cachedAt: Date.now(), proof });
  return proof;
}

async function collectProof(tasks) {
  const proof = new Map(tasks.map((task) => [task.id, lifecycleProof(task)]));
  const candidates = tasks
    .filter((task) => PROOF_READ_STATUSES.has(task.status))
    .sort((left, right) => Number(right.status === 'approved') - Number(left.status === 'approved'))
    .slice(0, MAX_PROOF_READS);

  const results = await Promise.allSettled(candidates.map(async (task) => [task.id, await readProof(task)]));
  results.forEach((result) => {
    if (result.status === 'fulfilled') proof.set(result.value[0], result.value[1]);
  });
  return proof;
}

function buildSummary(tasks, proofById) {
  const active = tasks.filter((task) => ['proposed', 'sandboxed', 'in_review', 'approved'].includes(task.status)).length;
  const passed = tasks.filter((task) => proofById.get(task.id)?.state === 'passed').length;
  const repair = tasks.filter((task) => proofById.get(task.id)?.state === 'failed').length;
  const founder = tasks.filter((task) => task.status === 'approved' && proofById.get(task.id)?.state === 'passed').length;

  return [
    ['Active work', active],
    ['Proof passed', passed],
    ['Needs repair', repair],
    ['Founder gate', founder],
  ];
}

function decorateCards(board, tasks, proofById) {
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  board.querySelectorAll('.card[data-id]').forEach((card) => {
    const task = byId.get(String(card.dataset.id));
    if (!task || card.querySelector('.mission-evidence-row')) return;

    const proof = proofById.get(task.id) ?? { state: 'unknown', label: 'Proof unknown' };
    const authority = authorityLabel(task, proof);
    const row = element('div', 'mission-evidence-row');

    const proofBadge = element('span', 'mission-proof-badge', proof.label);
    proofBadge.dataset.proof = proof.state;
    const authorityBadge = element('span', 'mission-authority-badge', authority.text);
    authorityBadge.dataset.tone = authority.tone;
    row.append(proofBadge, authorityBadge);

    const gate = element('p', 'mission-next-gate');
    const lead = element('strong', '', 'Next gate: ');
    gate.append(lead, document.createTextNode(nextGate(task, proof)));
    card.append(row, gate);
  });
}

function renderIntelligence(board, tasks, proofById) {
  board.parentElement?.querySelector('.mission-board-intel')?.remove();

  const panel = element('section', 'mission-board-intel');
  panel.setAttribute('aria-label', 'Mission board evidence summary');

  const heading = element('div', 'mission-board-heading');
  const copy = element('div');
  copy.append(
    element('h3', '', 'Evidence-aware mission board'),
    element('p', '', 'This is a read-only projection of existing mission state and Bench proof. Moving a card visually cannot grant merge, deploy, secret, or destructive authority.'),
  );
  heading.append(copy, element('span', 'mission-board-mode', 'Truth projection'));

  const summary = element('div', 'mission-board-summary');
  buildSummary(tasks, proofById).forEach(([label, value]) => {
    const stat = element('div', 'mission-board-stat');
    stat.append(element('span', '', label), element('strong', '', String(value)));
    summary.append(stat);
  });

  panel.append(heading, summary);
  board.parentElement?.insertBefore(panel, board);
  decorateCards(board, tasks, proofById);
}

async function enhanceMissionBoard(board) {
  if (!(board instanceof HTMLElement)) return;
  if (board.dataset.missionBoardState === 'loading' || board.dataset.missionBoardState === 'ready') return;

  board.dataset.missionBoardState = 'loading';
  try {
    const tasks = tasksFromBoard(board);
    const proofById = await collectProof(tasks);
    ensureStyles();
    renderIntelligence(board, tasks, proofById);
    board.dataset.missionBoardState = 'ready';
  } catch {
    board.dataset.missionBoardState = 'error';
  }
}

function findAndEnhance() {
  const board = document.querySelector(BOARD_SELECTOR);
  if (board) void enhanceMissionBoard(board);
}

export function installMissionBoard() {
  findAndEnhance();
  const root = document.getElementById('root');
  if (!root) return;

  const observer = new MutationObserver(() => findAndEnhance());
  observer.observe(root, { childList: true, subtree: true });
}
