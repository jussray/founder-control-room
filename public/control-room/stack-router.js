const PENDING_TAB_KEY = 'fcr_pending_tab';
const ALLOWED_TABS = new Set([
  'projects',
  'missions',
  'activity',
  'l99',
  'promptos',
  'analytics',
  'terminal',
]);

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

function activateTab(tab) {
  const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
  if (!(button instanceof HTMLButtonElement)) return false;

  button.click();
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
