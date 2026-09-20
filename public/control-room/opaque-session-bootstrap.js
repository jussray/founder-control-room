// Transitional bootstrap for the legacy Control Room SPA.
//
// The authoritative browser session is the same-origin HttpOnly
// __Host-fcr_session capability. This file deliberately never reads, stores,
// reconstructs, or forwards Supabase access/refresh credentials. It asks the
// server for the authenticated platform-founder identity before the legacy SPA
// is allowed to boot. Signed-out users and workspace-scoped founders are sent
// to the canonical onboarding Composer instead of inheriting the global shell.

const LEGACY_SESSION_KEY = 'fcr_session';
const ONBOARDING_PATH = '/founder-onboarding/';

function unwrapApiData(value) {
  return value && value.success === true && value.data ? value.data : value;
}

function scrubLegacyBrowserCredentials() {
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
        throw new Error('Founder sign-out failed (' + response.status + ')');
      }
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      location.replace(ONBOARDING_PATH);
    } catch (error) {
      target.disabled = false;
      target.textContent = 'Sign out failed';
      console.error(error instanceof Error ? error.message : String(error));
    }
  }, true);
}

async function bootLegacyCockpit() {
  scrubLegacyBrowserCredentials();
  installCookieBackedSignOut();

  let founder = null;
  try {
    founder = await founderIdentityFromOpaqueSession();
  } catch {
    founder = null;
  }

  if (!founder) {
    location.replace(ONBOARDING_PATH);
    return;
  }

  // Compatibility marker only. There is intentionally no access_token,
  // refresh_token, expiry credential, or other bearer material here.
  sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(founder));
  await import('/control-room/app.js');
}

void bootLegacyCockpit();
