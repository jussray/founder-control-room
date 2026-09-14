export const controlRoomJs = `
const id = (value) => document.getElementById(value);
const out = id('signed-out');
const inside = id('signed-in');
const notice = id('notice');
const status = id('system-status');
const loginForm = id('login-form');
const loginButton = id('login-button');
const logout = id('logout-button');
const passwordForm = id('password-form');
const passwordButton = id('password-button');
const workspaceForm = id('workspace-form');
const workspaceButton = id('workspace-button');
const flow = id('onboarding-flow');
const ready = id('workspace-ready');
const startOnboarding = id('start-onboarding');
const cancelOnboarding = id('cancel-onboarding');
const chiefComposer = id('chief-composer-fieldset');
const chiefRecommendButton = id('chief-recommend-button');
const chiefRecommendationPanel = id('chief-recommendation');
const chiefApproval = id('chief-approval');
let founder = null;
let state = null;
let chiefRecommendation = null;

const say = (text, bad = false) => {
  notice.textContent = text;
  notice.style.color = bad ? '#ffc0c0' : '#c5d3ef';
};

const isWorkspaceOwner = () => founder && founder.role === 'workspace_owner';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = data && data.error && typeof data.error === 'object'
      ? data.error.message
      : data && data.error;
    throw new Error(errorMessage || 'Request failed (' + response.status + ')');
  }
  return data && data.success === true && Object.prototype.hasOwnProperty.call(data, 'data')
    ? data.data
    : data;
}

async function health() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    status.textContent = 'System online';
    status.className = 'status ok';
  } catch {
    status.textContent = 'System unavailable';
    status.className = 'status error';
  }
}

function composerPayload() {
  const formData = new FormData(workspaceForm);
  return {
    name: String(formData.get('projectName') || ''),
    slug: String(formData.get('projectSlug') || ''),
    projectType: String(formData.get('projectType') || ''),
    mission: String(formData.get('mission') || ''),
    currentState: String(formData.get('currentState') || ''),
    evidenceNotes: String(formData.get('evidenceNotes') || ''),
  };
}

function resetChiefRecommendation() {
  chiefRecommendation = null;
  chiefRecommendationPanel.hidden = true;
  chiefApproval.checked = false;
  if (isWorkspaceOwner()) workspaceButton.disabled = true;
}

function applyAccountMode() {
  const tenant = isWorkspaceOwner();
  const boundary = id('workspace-boundary-note');
  boundary.hidden = !tenant;
  boundary.textContent = tenant
    ? 'Workspace isolation is active. Only projects assigned to this workspace are visible here.'
    : '';
  id('provider-slots-fieldset').hidden = tenant;
  id('platform-modules').hidden = tenant;
  id('password-panel').hidden = tenant;
  chiefComposer.hidden = !tenant;

  id('project-type').required = tenant;
  id('project-mission').required = tenant;
  chiefApproval.required = tenant;

  if (tenant) {
    id('workspace-heading').textContent = 'Meet Chief. Compose your first Control Room.';
    id('workspace-description').textContent = 'Tell Chief what you are building, what must become true, and what is true now. Chief recommends the first gate; only your explicit approval creates the project.';
    id('tools-step').textContent = '2. Chief';
    workspaceButton.textContent = 'Approve plan & create Control Room';
    resetChiefRecommendation();
  }
}

function renderWorkspace(nextState) {
  state = nextState;
  const projects = Array.isArray(nextState.projects) ? nextState.projects : [];
  const connections = projects.reduce(
    (count, project) => count + (Array.isArray(project.connections) ? project.connections.length : 0),
    0,
  );
  id('project-count').textContent = String(projects.length);
  id('connection-count').textContent = String(connections);

  if (projects.length === 0) {
    ready.hidden = true;
    flow.hidden = false;
    cancelOnboarding.hidden = true;
    return;
  }

  const primary = projects.find((project) => project.slug === 'founder-control-room') || projects[0];
  id('workspace-title').textContent = (primary && primary.name ? primary.name : 'Founder Control Room') + ' is online.';
  id('workspace-summary').textContent = isWorkspaceOwner()
    ? projects.length + ' isolated project' + (projects.length === 1 ? '' : 's') + ' in this workspace. Chief recommendation was configuration only; provider connections and Chief execution remain locked until their tenant-safe capability gates are proved.'
    : projects.length + ' project' + (projects.length === 1 ? '' : 's') + ' and ' + connections + ' declared tool slot' + (connections === 1 ? ' was' : 's were') + '. Provider slots remain disconnected until separately authorized and verified.';
  flow.hidden = true;
  ready.hidden = false;
  cancelOnboarding.hidden = true;
}

async function loadState() {
  if (isWorkspaceOwner()) {
    const tenantState = await api('/workspace/projects');
    const projects = Array.isArray(tenantState.projects)
      ? tenantState.projects.map((project) => ({ ...project, connections: [] }))
      : [];
    renderWorkspace({ projects });
    return;
  }
  const nextState = await api('/onboarding/state');
  renderWorkspace(nextState);
}

function openOnboarding() {
  flow.hidden = false;
  ready.hidden = true;
  cancelOnboarding.hidden = !(state && Array.isArray(state.projects) && state.projects.length > 0);
  if (isWorkspaceOwner()) resetChiefRecommendation();
  flow.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function session() {
  const response = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    out.hidden = false;
    inside.hidden = true;
    return;
  }
  const data = await response.json();
  const payload = data && data.success === true && data.data ? data.data : data;
  founder = payload.founder;
  id('founder-email').textContent = founder.email;
  applyAccountMode();
  out.hidden = true;
  inside.hidden = false;
  try {
    await loadState();
  } catch (error) {
    flow.hidden = false;
    say(error instanceof Error ? error.message : 'Unable to load onboarding state', true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  say('Requesting a one-time founder link…');
  try {
    const email = new FormData(loginForm).get('email');
    const data = await api('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    say(data.message);
    loginForm.reset();
  } catch (error) {
    say(error instanceof Error ? error.message : 'Unable to request login link', true);
  } finally {
    loginButton.disabled = false;
  }
});

chiefRecommendButton.addEventListener('click', async () => {
  chiefRecommendButton.disabled = true;
  workspaceButton.disabled = true;
  chiefApproval.checked = false;
  say('Chief is composing the smallest useful first gate…');
  try {
    const data = await api('/workspace/projects/recommendation', {
      method: 'POST',
      body: JSON.stringify(composerPayload()),
    });
    chiefRecommendation = data.recommendation;
    id('chief-recommendation-title').textContent = chiefRecommendation.title;
    id('chief-first-gate').textContent = chiefRecommendation.firstGate;
    id('chief-reasoning').textContent = chiefRecommendation.reasoning;
    id('chief-authority-boundary').textContent = chiefRecommendation.authorityBoundary;
    chiefRecommendationPanel.hidden = false;
    say('Chief recommendation ready. Review it, then approve this exact plan to create the Control Room.');
    chiefRecommendationPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    resetChiefRecommendation();
    say(error instanceof Error ? error.message : 'Unable to compose a Chief recommendation', true);
  } finally {
    chiefRecommendButton.disabled = false;
  }
});

chiefApproval.addEventListener('change', () => {
  workspaceButton.disabled = !chiefApproval.checked || !chiefRecommendation;
});

for (const fieldId of ['project-name', 'project-slug', 'project-type', 'project-mission', 'project-current-state', 'project-evidence-notes']) {
  id(fieldId).addEventListener('input', () => {
    if (isWorkspaceOwner() && chiefRecommendation) resetChiefRecommendation();
  });
  id(fieldId).addEventListener('change', () => {
    if (isWorkspaceOwner() && chiefRecommendation) resetChiefRecommendation();
  });
}

workspaceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const tenant = isWorkspaceOwner();
  if (tenant && (!chiefRecommendation || !chiefApproval.checked)) {
    say('Request and approve the current Chief recommendation before creating this Control Room.', true);
    workspaceButton.disabled = !chiefRecommendation || !chiefApproval.checked;
    return;
  }

  workspaceButton.disabled = true;
  say(tenant ? 'Creating the approved Control Room inside your isolated workspace…' : 'Creating the workspace and declaring provider boundaries…');
  try {
    const formData = new FormData(workspaceForm);
    const project = {
      name: String(formData.get('projectName') || ''),
      slug: String(formData.get('projectSlug') || ''),
      repoProvider: 'github',
      repoIdentifier: String(formData.get('repoIdentifier') || ''),
      stack: String(formData.get('stack') || ''),
      riskLevel: 'medium',
    };

    if (tenant) {
      const composer = composerPayload();
      const result = await api('/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...project,
          ...composer,
          chiefRecommendationId: chiefRecommendation.id,
          chiefApproval: true,
        }),
      });
      const recommendationTitle = result && result.chief && result.chief.recommendation
        ? result.chief.recommendation.title
        : 'Chief configuration recorded';
      say('Control Room created from the approved Chief plan. ' + recommendationTitle + '. No execution authority was granted.');
      resetChiefRecommendation();
    } else {
      const providers = formData.getAll('providers').map(String);
      const result = await api('/onboarding/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ project, providers }),
      });
      const created = Array.isArray(result.connectionsCreated) ? result.connectionsCreated.length : 0;
      say('Workspace ready. ' + created + ' provider slot' + (created === 1 ? ' was' : 's were') + ' declared. No credentials or execution authority were granted.');
    }
    await loadState();
  } catch (error) {
    say(error instanceof Error ? error.message : 'Unable to create workspace', true);
    if (tenant) workspaceButton.disabled = !chiefApproval.checked || !chiefRecommendation;
  } finally {
    if (!tenant) workspaceButton.disabled = false;
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  passwordButton.disabled = true;
  const formData = new FormData(passwordForm);
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  if (password.length < 12) {
    say('Password must be at least 12 characters.', true);
    passwordButton.disabled = false;
    return;
  }
  if (password !== confirmPassword) {
    say('Passwords do not match.', true);
    passwordButton.disabled = false;
    return;
  }
  say('Updating founder password…');
  try {
    const data = await api('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ password, confirmPassword }),
    });
    passwordForm.reset();
    say(data.message || 'Founder password updated.');
  } catch (error) {
    say(error instanceof Error ? error.message : 'Unable to update password', true);
  } finally {
    passwordButton.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  logout.disabled = true;
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.replace('/');
});
startOnboarding.addEventListener('click', openOnboarding);
cancelOnboarding.addEventListener('click', () => {
  flow.hidden = true;
  ready.hidden = false;
});
await Promise.all([health(), session()]);
`;
