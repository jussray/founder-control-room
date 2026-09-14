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

async function bootLegacyCockpit() {
  scrubLegacyBrowserCredentials();
  installCookieBackedSignOut();

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
