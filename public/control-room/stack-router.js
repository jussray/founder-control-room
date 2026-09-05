const PENDING_TAB_KEY = 'fcr_pending_tab';
const CONVEYOR_CONTRACT = 'founder-control-room/n8n-conveyor@v3';
const ALLOWED_TABS = new Set([
  'projects',
  'missions',
  'activity',
  'l99',
  'promptos',
  'analytics',
  'terminal',
]);

const READINESS_COPY = {
  'not-configured': 'n8n not configured',
  'ready-for-probe': 'n8n configured · live probe required',
  'enabled-awaiting-proof': 'n8n enabled · live proof missing',
  'enabled-live-verified': 'n8n live · exact-head receipt verified',
};

let missionBoardInstallPromise = null;

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The links still open the Control Room even when storage is unavailable.
  }
}

function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function setConveyorReadiness(state, label) {
  const status = document.querySelector('[data-conveyor-readiness]');
  const text = document.querySelector('[data-conveyor-readiness-label]');
  if (!(status instanceof HTMLElement) || !(text instanceof HTMLElement)) return;

  status.dataset.state = state;
  text.textContent = label;
}

function readinessCopy(readiness) {
  if (readiness?.state === 'enabled-awaiting-proof') {
    if (readiness?.proof?.state === 'stale-head') return 'n8n enabled · prior proof stale';
    if (readiness?.proof?.state === 'readback-unavailable') return 'n8n enabled · proof readback unavailable';
    if (readiness?.proof?.state === 'runtime-sha-unavailable') return 'n8n enabled · runtime SHA unavailable';
  }
  return READINESS_COPY[readiness?.state] ?? null;
}

async function refreshConveyorReadiness() {
  setConveyorReadiness('checking', 'Checking n8n readiness…');

  try {
    const response = await fetch('/automation/conveyor/', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      setConveyorReadiness('signed-out', 'Sign in to check n8n readiness');
      return;
    }

    if (!response.ok) {
      throw new Error(`readiness request failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    if (body?.contract !== CONVEYOR_CONTRACT) {
      setConveyorReadiness('error', 'n8n contract mismatch');
      return;
    }

    const state = body?.readiness?.state;
    const label = readinessCopy(body?.readiness);
    if (!label) {
      setConveyorReadiness('error', 'n8n readiness unavailable');
      return;
    }

    setConveyorReadiness(state, label);
  } catch {
    setConveyorReadiness('error', 'n8n readiness unavailable');
  }
}

function requestedTabFromUrl() {
  const tab = new URL(window.location.href).searchParams.get('tab');
  return tab && ALLOWED_TABS.has(tab) ? tab : null;
}

function removeTabQueryParameter() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('tab')) return;

  url.searchParams.delete('tab');
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  history.replaceState(null, '', nextUrl);
}

function installMissionBoardWhenNeeded() {
  if (missionBoardInstallPromise) return missionBoardInstallPromise;
  missionBoardInstallPromise = import('./mission-board.js')
    .then(({ installMissionBoard }) => {
      installMissionBoard();
    })
    .catch((error) => {
      missionBoardInstallPromise = null;
      throw error;
    });
  return missionBoardInstallPromise;
}

function activateTab(tab) {
  const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
  if (!(button instanceof HTMLButtonElement)) return false;

  button.click();
  if (tab === 'missions') void installMissionBoardWhenNeeded();
  safeSessionRemove(PENDING_TAB_KEY);
  removeTabQueryParameter();
  return true;
}

const requestedTab = requestedTabFromUrl();
if (requestedTab) safeSessionSet(PENDING_TAB_KEY, requestedTab);

const pendingTab = requestedTab ?? safeSessionGet(PENDING_TAB_KEY);
if (pendingTab && ALLOWED_TABS.has(pendingTab) && !activateTab(pendingTab)) {
  const root = document.getElementById('root');
  if (root) {
    const observer = new MutationObserver(() => {
      if (!activateTab(pendingTab)) return;
      observer.disconnect();
    });

    observer.observe(root, { childList: true, subtree: true });
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest('.tabs button[data-tab="missions"]')
    : null;
  if (target) void installMissionBoardWhenNeeded();
});

const launchDock = document.querySelector('.launch-dock');
if (launchDock instanceof HTMLDetailsElement) {
  launchDock.addEventListener('toggle', () => {
    if (launchDock.open) void refreshConveyorReadiness();
  });
}
