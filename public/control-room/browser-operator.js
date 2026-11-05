// Browser Operator UI deliberately does not read founder credentials.
// Same-origin opaque HttpOnly session authenticates /auth/me and preview API.
const gate = document.getElementById('login-gate');
const status = document.getElementById('login-status');
const signIn = document.getElementById('signin-link');
const workspace = document.getElementById('operator-workspace');
const form = document.getElementById('preview-form');
const task = document.getElementById('task');
const previewButton = document.getElementById('preview-button');
const previewStatus = document.getElementById('preview-status');
const plan = document.getElementById('plan-result');

function setNode(id, text) {
  document.getElementById(id).textContent = text;
}

function showGate(message) {
  workspace.hidden = true;
  gate.hidden = false;
  status.textContent = message;
  signIn.hidden = false;
}

async function responseJson(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('FCR API response unavailable');
  return response.json();
}

async function authenticate() {
  try {
    const response = await fetch('/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      showGate('Sign in through Founder Control Room to preview a browser test. This page cannot run tests.');
      return;
    }
    const data = await responseJson(response);
    // A server-authenticated founder identity is required; neither email
    // nor any bearer data is needed in this client.
    const identity = data?.data?.founder ?? data?.founder;
    if (!identity || typeof identity.email !== 'string' || !identity.email) {
      showGate('The founder session could not be verified. Sign in again.');
      return;
    }
    gate.hidden = true;
    workspace.hidden = false;
  } catch {
    showGate('Unable to verify the founder session. Private controls stay closed.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  previewButton.disabled = true;
  plan.hidden = true;
  previewStatus.textContent = 'Validating the request. No browser will run.';
  try {
    const response = await fetch('/browser-operator/preview', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ request: task.value }),
    });
    if (response.status === 401 || response.status === 403) {
      showGate('Founder permission is no longer valid. Sign in to continue.');
      return;
    }
    const result = await responseJson(response);
    if (response.status === 422 || result?.status === 'REJECTED') {
      plan.hidden = false;
      setNode('plan-state', 'Rejected');
      document.getElementById('plan-state').className = 'rejected';
      setNode('plan-project', '—');
      setNode('plan-target', '—');
      setNode('plan-actors', '—');
      setNode('plan-steps', '—');
      setNode('plan-gate', 'Unsupported or unsafe request: ' + String(result.reason || 'UNKNOWN') + '. Nothing executed.');
      previewStatus.textContent = 'Rejected. No browser execution.';
      return;
    }
    if (!response.ok || result?.status !== 'REQUIRES_FOUNDER_RUN_APPROVAL'
      || result?.browserExecuted !== false || result?.approvalIssued !== false) {
      throw new Error('No trustworthy preview was returned');
    }
    plan.hidden = false;
    setNode('plan-state', 'Review required');
    document.getElementById('plan-state').className = 'needs-review';
    setNode('plan-project', result.project);
    setNode('plan-target', result.targetOrigin);
    setNode('plan-actors', String(result.actorCount));
    setNode('plan-steps', String(result.stepCount));
    setNode('plan-gate', result.nextGate);
    previewStatus.textContent = 'Preview received. No browser execution.';
  } catch {
    previewStatus.textContent = 'Unable to verify a plan. Nothing executed.';
    plan.hidden = true;
  } finally {
    previewButton.disabled = false;
  }
});

await authenticate();
