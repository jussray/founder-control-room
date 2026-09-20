// Transitional bootstrap for the legacy Control Room SPA.
//
// The authoritative browser session is the same-origin HttpOnly
// __Host-fcr_session capability. This file deliberately never reads, stores,
// reconstructs, or forwards Supabase access/refresh credentials. It asks the
// server for the authenticated founder identity, gives the legacy SPA only the
// non-secret identity marker it still expects during boot, and lets every API
// request authenticate through the browser's same-origin cookie.

const LEGACY_SESSION_KEY = 'fcr_session';

function unwrapApiData(value) {
  return value && value.success === true && value.data ? value.data : value;
}

function scrubLegacyBrowserCredentials() {
  // Old builds used both URL fragments and sessionStorage for Supabase tokens.
  // Neither is accepted as browser authority after the opaque-session cutover.
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

async function founderIdentityFromOpaqueSession() {
  const response = await fetch('/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return null;
  const payload = unwrapApiData(await response.json().catch(() => null));
  const email = typeof payload?.founder?.email === 'string'
    ? payload.founder.email.trim().toLowerCase()
    : '';
  return email ? { email, transport: 'opaque-http-only-cookie' } : null;
}

function installCookieBackedSignOut() {
  // app.js historically cleared only sessionStorage. Capture the click before
  // its legacy handler and revoke the server-side opaque session instead.
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('#sign-out') : null;
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    target.disabled = true;

    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok && response.status !== 401) {
        throw new Error(`Founder sign-out failed (${response.status})`);
      }
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      location.replace('/control-room/');
    } catch (error) {
      // Do not lie about revocation. If server-side logout fails, keep the
      // compatibility marker and current page intact so the browser remains
      // visibly authenticated until the session can actually be revoked.
      target.disabled = false;
      target.textContent = 'Sign out failed';
      console.error(error instanceof Error ? error.message : String(error));
    }
  }, true);
}

function installLegacyTerminalAuthorityBoundary() {
  // The legacy SPA still renders/sends `confirmWrite`, but the authoritative
  // terminal contract no longer treats that boolean as execution authority.
  // Keep the compatibility shell honest until app.js is retired: remove the
  // fake authority affordance and strip the legacy field from terminal-run
  // requests. This never creates authority; L99 approval receipts remain the
  // only execution-authority path for write/verify commands.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const path = typeof input === 'string' ? input : '';
    if (/^\/terminal\/[^/]+\/run$/.test(path) && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          delete payload.confirmWrite;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch {
        // Preserve the original request. The server owns JSON/error handling.
      }
    }
    return nativeFetch(input, init);
  };

  const reconcileTerminalForm = () => {
    document.querySelectorAll('#terminal-run-form input[name="confirmWrite"]').forEach((input) => {
      const label = input.closest('label');
      if (label) label.remove();
      else input.remove();
    });

    const form = document.querySelector('#terminal-run-form');
    if (!form || form.querySelector('[data-l99-authority-copy]')) return;

    const copy = document.createElement('p');
    copy.className = 'muted';
    copy.dataset.l99AuthorityCopy = 'true';
    copy.textContent = 'Write and verify commands require a fresh L99 approval receipt. This form never grants execution authority.';
    const submitRow = form.querySelector('button[type="submit"]')?.parentElement ?? null;
    form.insertBefore(copy, submitRow);
  };

  const observer = new MutationObserver(reconcileTerminalForm);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  reconcileTerminalForm();
}

async function bootLegacyCockpit() {
  scrubLegacyBrowserCredentials();
  installCookieBackedSignOut();
  installLegacyTerminalAuthorityBoundary();

  try {
    const founder = await founderIdentityFromOpaqueSession();
    if (founder) {
      // Compatibility marker only. There is intentionally no access_token,
      // refresh_token, expiry credential, or other bearer material here.
      sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(founder));
    }
  } catch {
    // app.js will render its normal signed-out surface if /auth/me is
    // unavailable or the opaque session is invalid.
  }

  await import('/control-room/app.js');
}

void bootLegacyCockpit();
