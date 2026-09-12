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
let founder = null;
let state = null;

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

  if (tenant) {
    id('workspace-heading').textContent = 'Add a project to your private workspace.';
    id('workspace-description').textContent = 'This project stays isolated inside your workspace. Provider connections, Chief execution, merge, deployment, spending, and external mutations remain locked until separately authorized and tenant-safe.';
    id('tools-step').textContent = '2. Isolation';
    workspaceButton.textContent = 'Add project to my workspace';
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
    ? projects.length + ' isolated project' + (projects.length === 1 ? '' : 's') + ' in this workspace. Provider connections and Chief execution remain locked until their tenant-safe capability gates are proved.'
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

workspaceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  workspaceButton.disabled = true;
  const tenant = isWorkspaceOwner();
  say(tenant ? 'Adding the project inside your isolated workspace…' : 'Creating the workspace and declaring provider boundaries…');
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
      await api('/workspace/projects', {
        method: 'POST',
        body: JSON.stringify(project),
      });
      say('Project added to your isolated workspace. Provider connections and Chief execution remain locked.');
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
  } finally {
    workspaceButton.disabled = false;
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
