const POLL_MS = 5000;
const MISSION_DETAIL_SELECTOR = '#mission-detail';
const MISSION_TAB_SELECTOR = '.tabs button[data-tab="missions"]';

let missionDrafts = new Map();
let pollTimer = null;
let observer = null;
let pollInFlight = false;

function activeMissionTab() {
  return document.querySelector(`${MISSION_TAB_SELECTOR}.active`) instanceof HTMLButtonElement;
}

function missionDetail() {
  const detail = document.querySelector(MISSION_DETAIL_SELECTOR);
  return detail instanceof HTMLElement ? detail : null;
}

function isDraftField(field) {
  return (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) && field.name && !(field instanceof HTMLInputElement && field.type === 'file');
}

function fieldDraftKey(field) {
  const detail = missionDetail();
  const form = field.closest('form');
  if (!detail || !(form instanceof HTMLFormElement)) return null;
  const forms = [...detail.querySelectorAll('form')];
  const formKey = form.id || `form-${forms.indexOf(form)}`;
  const matching = [...form.querySelectorAll('[name]')].filter((candidate) => (
    isDraftField(candidate) && candidate.name === field.name
  ));
  return `${formKey}:${field.name}:${matching.indexOf(field)}`;
}

function founderIsEditingMissionForm() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (!active.closest(MISSION_DETAIL_SELECTOR)) return false;
  return active.matches('input, textarea, select');
}

function captureMissionDrafts() {
  const detail = missionDetail();
  if (!detail) return;
  const next = new Map(missionDrafts);
  detail.querySelectorAll('[name]').forEach((candidate) => {
    if (!isDraftField(candidate)) return;
    const key = fieldDraftKey(candidate);
    if (!key) return;
    if (candidate instanceof HTMLInputElement && (candidate.type === 'checkbox' || candidate.type === 'radio')) {
      next.set(key, { kind: 'checked', checked: candidate.checked });
      return;
    }
    if (candidate instanceof HTMLSelectElement && candidate.multiple) {
      next.set(key, {
        kind: 'multiple',
        values: [...candidate.selectedOptions].map((option) => option.value),
      });
      return;
    }
    next.set(key, { kind: 'value', value: candidate.value });
  });
  missionDrafts = next;
}

function restoreMissionDrafts() {
  const detail = missionDetail();
  if (!detail) {
    if (activeMissionTab()) missionDrafts = new Map();
    return;
  }
  if (missionDrafts.size === 0) return;
  detail.querySelectorAll('[name]').forEach((candidate) => {
    if (!isDraftField(candidate)) return;
    const key = fieldDraftKey(candidate);
    if (!key) return;
    const draft = missionDrafts.get(key);
    if (!draft) return;
    if (draft.kind === 'checked' && candidate instanceof HTMLInputElement) {
      candidate.checked = draft.checked;
      return;
    }
    if (draft.kind === 'multiple' && candidate instanceof HTMLSelectElement) {
      const wanted = new Set(draft.values);
      [...candidate.options].forEach((option) => { option.selected = wanted.has(option.value); });
      return;
    }
    if (draft.kind === 'value' && candidate.value !== draft.value) candidate.value = draft.value;
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

function clearExpiredFounderSession() {
  missionDrafts = new Map();
  const signOut = document.querySelector('#sign-out');
  if (signOut instanceof HTMLButtonElement) {
    signOut.click();
    return;
  }
  window.location.assign('/control-room/');
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
      clearExpiredFounderSession();
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
  if (!(target instanceof Element) || !target.closest(MISSION_DETAIL_SELECTOR)) return;
  captureMissionDrafts();
}

function onNavigationClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('#sign-out') || target.closest('.lane .card[data-id]') || target.closest('.tabs button')) {
    missionDrafts = new Map();
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
      restoreMissionDrafts();
      if (activeMissionTab()) ensureLiveStatus();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  restoreMissionDrafts();
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
