import { callbackHtml } from './callbackHtml.js';
import { callbackJs } from './callbackJs.js';
import { controlRoomHtml } from './controlRoomHtml.js';

export const workspaceControlRoomHtml = controlRoomHtml
  .replace(
    '<script type="module" src="/assets/control-room.js"></script>',
    '<script type="module" src="/assets/workspace-app.js"></script>\n  <script type="module" src="/assets/control-room.js"></script>',
  )
  .replace('Enter your private control plane.', 'Enter your Founder Control Room.')
  .replace(
    'Google or a secure email link verifies identity through Supabase Auth. The private founder allowlist still decides who gets access.',
    'Sign in or create an account through Supabase Auth. Your verified identity gets its own isolated Founder Control Room workspace without inheriting platform-owner authority.',
  )
  .replace('href="/auth/google"', 'href="/auth/workspace/google"');

export const workspaceCallbackHtml = callbackHtml
  .replace('/assets/auth-callback.js', '/assets/workspace-auth-callback.js')
  .replace('href="/" hidden', 'href="/app/" hidden');

export const workspaceCallbackJs = callbackJs
  .replaceAll('/auth/callback', '/auth/workspace/callback')
  .replace("fetch('/auth/session'", "fetch('/auth/workspace/session'")
  .replace("location.replace('/')", "location.replace('/app/')");

export const workspaceAppJs = `
const workspaceNotice = document.getElementById('notice');
const workspaceLoginForm = document.getElementById('login-form');
const workspaceLoginButton = document.getElementById('login-button');
const workspaceLogoutButton = document.getElementById('logout-button');

function workspaceSay(message, bad = false) {
  if (!workspaceNotice) return;
  workspaceNotice.textContent = message;
  workspaceNotice.style.color = bad ? '#ffc0c0' : '#c5d3ef';
}

if (workspaceLoginForm) {
  workspaceLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (workspaceLoginButton) workspaceLoginButton.disabled = true;
    workspaceSay('Requesting a secure Founder Control Room login link…');
    try {
      const email = new FormData(workspaceLoginForm).get('email');
      const response = await fetch('/auth/workspace/magic-link', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null);
      const message = body && body.success === true && body.data ? body.data.message : body?.error?.message || body?.error;
      if (!response.ok) throw new Error(message || 'Unable to request login link');
      workspaceSay(message || 'Check your inbox for the secure login link.');
      workspaceLoginForm.reset();
    } catch (error) {
      workspaceSay(error instanceof Error ? error.message : 'Unable to request login link', true);
    } finally {
      if (workspaceLoginButton) workspaceLoginButton.disabled = false;
    }
  }, true);
}

if (workspaceLogoutButton) {
  workspaceLogoutButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    workspaceLogoutButton.disabled = true;
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.replace('/app/');
  }, true);
}

async function enforceWorkspaceSurface() {
  try {
    const response = await fetch('/workspace/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const body = await response.json();
    const founder = body && body.success === true && body.data ? body.data.founder : body?.founder;
    if (founder && founder.role !== 'workspace_owner') {
      location.replace('/founder-onboarding/');
    }
  } catch {
    // The canonical Control Room script owns signed-out/error rendering.
  }
}

void enforceWorkspaceSurface();
`;
