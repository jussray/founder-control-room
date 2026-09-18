const POLL_MS = 5000;
const PROOF_FORM_SELECTOR = '#proof-gate-form';
const MISSION_TAB_SELECTOR = '.tabs button[data-tab="missions"]';

let proofGateDraft = null;
let pollTimer = null;
let observer = null;
let pollInFlight = false;

function activeMissionTab() {
  return document.querySelector(`${MISSION_TAB_SELECTOR}.active`) instanceof HTMLButtonElement;
}

function proofForm() {
  const form = document.querySelector(PROOF_FORM_SELECTOR);
  return form instanceof HTMLFormElement ? form : null;
}

function founderIsEditingMissionForm() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (!active.closest('#mission-detail')) return false;
  return active.matches('input, textarea, select');
}

function captureProofGateDraft() {
  const form = proofForm();
  if (!form) return;
  const values = {};
  form.querySelectorAll('[name]').forEach((field) => {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      values[field.name] = field.value;
    }
  });
  proofGateDraft = values;
}

function restoreProofGateDraft() {
  const form = proofForm();
  if (!form) {
    if (activeMissionTab()) proofGateDraft = null;
    return;
  }
  if (!proofGateDraft) return;
  Object.entries(proofGateDraft).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      if (field.value !== value) field.value = value;
    }
  });
}

function laneName(lane) {
  const heading = lane.querySelector('h4')?.textContent ?? '';
  return heading.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function boardSignatureFromDom() {
  const entries = [];
  document.querySelectorAll('#mission-lanes .lane').forEach((lane) => {
    const status = laneName(lane);
    lane.querySelectorAll('.card[data-id]').forEach((card) => {
      entries.push(`${card.getAttribute('data-id')}:${status}`);
    });
  });
  return entries.sort().join('|');
}

function boardSignatureFromTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => `${String(task?.id ?? '')}:${String(task?.status ?? '')}`)
    .filter((entry) => !entry.startsWith(':'))
    .sort()
    .join('|');
}

function ensureLiveStatus(text = 'Live status · synced') {
  const toolbar = document.querySelector('#refresh-missions')?.closest('.toolbar');
  if (!(toolbar instanceof HTMLElement)) return;
  let status = toolbar.querySelector('[data-mission-live-status]');
  if (!(status instanceof HTMLElement)) {
    status = document.createElement('span');
    status.dataset.missionLiveStatus = '';
    status.className = 'muted';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    toolbar.appendChild(status);
  }
  if (status.textContent !== text) status.textContent = text;
}

async function pollMissionStatus() {
  if (pollInFlight || document.hidden || !activeMissionTab()) return;
  const refreshButton = document.querySelector('#refresh-missions');
  if (!(refreshButton instanceof HTMLButtonElement)) return;
  if (founderIsEditingMissionForm()) {
    ensureLiveStatus('Live status · paused while editing');
    return;
  }

  pollInFlight = true;
  try {
    const response = await fetch('/dashboard/tasks', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401) {
      ensureLiveStatus('Live status · sign in required');
      return;
    }
    if (!response.ok) {
      ensureLiveStatus(`Live status · unavailable (${response.status})`);
      return;
    }
    const body = await response.json();
    const remoteSignature = boardSignatureFromTasks(body?.tasks);
    const localSignature = boardSignatureFromDom();
    if (remoteSignature !== localSignature) {
      ensureLiveStatus('Live status · updating');
      refreshButton.click();
      return;
    }
    ensureLiveStatus();
  } catch {
    ensureLiveStatus('Live status · unavailable');
  } finally {
    pollInFlight = false;
  }
}

function onDraftInput(event) {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(PROOF_FORM_SELECTOR)) return;
  captureProofGateDraft();
}

function onNavigationClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.lane .card[data-id]') || target.closest('.tabs button')) {
    proofGateDraft = null;
  }
}

export function installMissionLiveUx() {
  if (pollTimer) return () => {};

  document.addEventListener('input', onDraftInput, true);
  document.addEventListener('change', onDraftInput, true);
  document.addEventListener('click', onNavigationClick, true);

  const root = document.getElementById('root');
  if (root) {
    observer = new MutationObserver(() => {
      restoreProofGateDraft();
      if (activeMissionTab()) ensureLiveStatus();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  restoreProofGateDraft();
  if (activeMissionTab()) ensureLiveStatus();
  void pollMissionStatus();
  pollTimer = window.setInterval(() => { void pollMissionStatus(); }, POLL_MS);

  return () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
    observer?.disconnect();
    observer = null;
    document.removeEventListener('input', onDraftInput, true);
    document.removeEventListener('change', onDraftInput, true);
    document.removeEventListener('click', onNavigationClick, true);
  };
}