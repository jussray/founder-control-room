// Founder Control Room cookie-native session bootstrap.
//
// The browser never receives Supabase access/refresh credentials. The only
// authentication capability is the opaque Secure/HttpOnly/SameSite cookie
// issued by the server. This compatibility bootstrap supplies the legacy UI
// with a non-authorizing identity marker (email/userId only) until app.js is
// fully decomposed away from its historical sessionStorage shape.

const UI_IDENTITY_KEY = 'fcr_session';
const AUTH_FRAGMENT_KEYS = new Set(['access_token', 'refresh_token', 'expires_at', 'email']);

function stripLegacyAuthFragment() {
  if (!location.hash || location.hash.length < 2) return;
  const params = new URLSearchParams(location.hash.slice(1));
  let changed = false;
  for (const key of AUTH_FRAGMENT_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const nextHash = params.toString();
  history.replaceState(null, '', `${location.pathname}${location.search}${nextHash ? `#${nextHash}` : ''}`);
}

async function readCookieBackedFounder() {
  try {
    const response = await fetch('/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const founder = body?.data?.founder ?? body?.founder ?? null;
    if (!founder || typeof founder.email !== 'string' || !founder.email.trim()) return null;
    return {
      email: founder.email.trim().toLowerCase(),
      userId: typeof founder.userId === 'string' ? founder.userId : '',
      cookieBacked: true,
    };
  } catch {
    return null;
  }
}

async function handleSignOut(event) {
  const button = event.target instanceof Element ? event.target.closest('#sign-out') : null;
  if (!button) return;

  // Run before the legacy click handler so local UI state cannot claim sign-out
  // while the server-side opaque capability remains valid.
  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled = true;

  try {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok && response.status !== 401) {
      throw new Error(`Sign out failed (${response.status})`);
    }
    sessionStorage.removeItem(UI_IDENTITY_KEY);
    location.assign('/control-room/');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Sign out failed';
    console.error(error instanceof Error ? error.message : String(error));
  }
}

stripLegacyAuthFragment();
document.addEventListener('click', handleSignOut, true);

const founder = await readCookieBackedFounder();
if (founder) {
  // This marker contains display identity only. It is not a credential and is
  // never accepted by the server as authentication or execution authority.
  sessionStorage.setItem(UI_IDENTITY_KEY, JSON.stringify(founder));
} else {
  sessionStorage.removeItem(UI_IDENTITY_KEY);
}

await import('/control-room/app.js');
