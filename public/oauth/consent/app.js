const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('request-details');
const signInEl = document.getElementById('sign-in-required');
const errorEl = document.getElementById('error');
const approveButton = document.getElementById('approve');
const denyButton = document.getElementById('deny');
const retryButton = document.getElementById('retry');

const authorizationId = new URLSearchParams(location.search).get('authorization_id')?.trim() ?? '';
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,256}$/;

function setError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  statusEl.textContent = 'Authorization could not continue.';
}

function clearError() {
  errorEl.textContent = '';
  errorEl.hidden = true;
}

function setBusy(busy) {
  approveButton.disabled = busy;
  denyButton.disabled = busy;
  retryButton.disabled = busy;
}

function safeRedirect(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Authorization server did not return a redirect URL.');
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) throw new Error('Authorization redirect must use HTTPS.');
  return url.toString();
}

function renderDetails(data) {
  document.getElementById('client-name').textContent = data.client?.name || data.client?.id || 'Unnamed OAuth client';
  document.getElementById('user-email').textContent = data.user?.email || 'Authenticated founder';
  document.getElementById('redirect-uri').textContent = data.redirect_uri || 'Registered callback';
  document.getElementById('scope-list').textContent = typeof data.scope === 'string' && data.scope.trim()
    ? data.scope.trim().split(/\s+/).join(', ')
    : 'email';
  statusEl.textContent = 'Review the requesting client before approving.';
  signInEl.hidden = true;
  detailsEl.hidden = false;
}

async function parseResponse(response) {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  return isJson ? response.json().catch(() => null) : null;
}

async function loadAuthorization() {
  clearError();
  detailsEl.hidden = true;
  signInEl.hidden = true;

  if (!AUTHORIZATION_ID.test(authorizationId)) {
    setError('Missing or invalid authorization_id. Restart the connection from the requesting app.');
    return;
  }

  setBusy(true);
  statusEl.textContent = 'Loading authorization request…';
  try {
    const response = await fetch(`/auth/oauth/authorizations/${encodeURIComponent(authorizationId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await parseResponse(response);

    if (response.status === 401) {
      statusEl.textContent = 'Founder sign-in required.';
      signInEl.hidden = false;
      return;
    }
    if (!response.ok || !body) {
      throw new Error(body?.error || `Authorization request failed (${response.status}).`);
    }
    if (body.redirect_url) {
      location.assign(safeRedirect(body.redirect_url));
      return;
    }
    if (body.authorization_id !== authorizationId) {
      throw new Error('Authorization response did not match the current request.');
    }
    renderDetails(body);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

async function decide(action) {
  clearError();
  setBusy(true);
  statusEl.textContent = action === 'approve' ? 'Approving connection…' : 'Denying connection…';
  try {
    const response = await fetch(`/auth/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    const body = await parseResponse(response);
    if (response.status === 401) {
      detailsEl.hidden = true;
      signInEl.hidden = false;
      statusEl.textContent = 'Founder sign-in required.';
      return;
    }
    if (!response.ok || !body) {
      throw new Error(body?.error || `Authorization decision failed (${response.status}).`);
    }
    location.assign(safeRedirect(body.redirect_url));
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

approveButton.addEventListener('click', () => decide('approve'));
denyButton.addEventListener('click', () => decide('deny'));
retryButton.addEventListener('click', loadAuthorization);

loadAuthorization();
