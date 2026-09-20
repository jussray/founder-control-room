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
const accountSecondary = id('account-secondary');
const projectName = id('project-name');
const projectSlug = id('project-slug');
const authorityConfirm = id('authority-confirm');
let founder = null;
let state = null;
let slugTouched = false;
let serverRecommendationId = null;

const projectTypeLabels = {
  'product-app': 'Product / App',
  'website': 'Website',
  'ai-agent': 'AI / Agent System',
  'business-company': 'Business / Company',
  'client-project': 'Client Project',
  'content-brand': 'Content / Brand',
  'store-commerce': 'Store / Commerce',
  'research-decision': 'Research / Decision',
  'other': 'Other',
};
const missionLabels = {
  build: 'Build', fix: 'Fix', launch: 'Launch', grow: 'Grow', operate: 'Operate', decide: 'Decide', prove: 'Prove',
};
const stateLabels = {
  idea: 'Idea', planning: 'Planning', building: 'Building', live: 'Already live', broken: 'Broken',
  'needs-improvement': 'Needs improvement', unsure: 'Unsure',
};
const nextGateLabels = {
  build: 'Define the first verifiable build slice',
  fix: 'Establish the failing path and its evidence',
  launch: 'Verify release readiness and exact runtime',
  grow: 'Choose the nearest measurable growth signal',
  operate: 'Establish current health and failure signals',
  decide: 'Gather the missing decision evidence',
  prove: 'Define the claim and required proof',
};

const say = (text, bad = false) => {
  notice.textContent = text;
  notice.style.color = bad ? '#ffc0c0' : '#c5d3ef';
};
const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const selectedValue = (name) => {
  const input = workspaceForm.querySelector('input[name="' + name + '"]:checked');
  return input ? String(input.value) : '';
};
const isWorkspaceOwner = () => founder && founder.role === 'workspace_owner';

function composerPayload() {
  const formData = new FormData(workspaceForm);
  const repoIdentifier = String(formData.get('repoIdentifier') || '').trim();
  return {
    project: {
      name: String(formData.get('projectName') || '').trim(),
      slug: String(formData.get('projectSlug') || '').trim(),
      repoProvider: repoIdentifier ? 'github' : 'none',
      repoIdentifier,
      stack: String(formData.get('stack') || '').trim(),
      riskLevel: 'medium',
    },
    controlRoom: {
      projectType: String(formData.get('projectType') || ''),
      mission: String(formData.get('mission') || ''),
      currentState: String(formData.get('currentState') || ''),
    },
  };
}

function ensureChiefUi() {
  const hero = document.querySelector('.composer-hero');
  if (hero && !id('chief-presence')) {
    const presence = document.createElement('aside');
    presence.id = 'chief-presence';
    presence.className = 'chief-presence';
    presence.setAttribute('aria-label', 'Chief recommendation guide');
    presence.innerHTML = '<div class="chief-emblem" aria-hidden="true"><span class="chief-crown">♛</span><span class="chief-lion">🦁</span></div><div class="chief-copy"><span class="chief-name">CHIEF</span><span class="chief-motto">LEAD · BUILD · EXECUTE</span><p>I will recommend the right Control Room. You decide whether to create it.</p></div>';
    hero.appendChild(presence);
  }

  const evidenceStep = document.querySelector('.composer-step[data-step="4"]');
  const authority = evidenceStep && evidenceStep.querySelector('.authority-confirmation');
  if (evidenceStep && authority && !id('chief-recommendation')) {
    const card = document.createElement('section');
    card.id = 'chief-recommendation';
    card.className = 'chief-recommendation';
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<div class="chief-emblem" aria-hidden="true"><span class="chief-crown">♛</span><span class="chief-lion">🦁</span></div><div class="chief-recommendation-copy"><span class="chief-label">Chief recommendation</span><strong id="chief-recommendation-title">Complete the project, mission, and reality steps.</strong><p id="chief-recommendation-detail">Chief will recommend a room after you provide the context.</p><p class="chief-authority">Recommendation only. Chief does not create, change, connect, merge, deploy, or authorize this room until you explicitly choose Create my Control Room.</p></div>';
    evidenceStep.insertBefore(card, authority);
  }
}

function updateChiefRecommendation() {
  serverRecommendationId = null;
  const projectType = selectedValue('projectType');
  const mission = selectedValue('mission');
  const currentState = selectedValue('currentState');
  const name = projectName.value.trim() || 'this project';
  const title = id('chief-recommendation-title');
  const detail = id('chief-recommendation-detail');
  if (!title || !detail) return;
  if (!projectType || !mission || !currentState) {
    title.textContent = 'Complete the project, mission, and reality steps.';
    detail.textContent = 'Chief will recommend a room after you provide the context.';
    return;
  }
  const typeLabel = projectTypeLabels[projectType] || 'Project';
  const missionLabel = missionLabels[mission] || 'Mission';
  const stateLabel = stateLabels[currentState] || 'Unknown';
  title.textContent = 'Chief recommends a ' + typeLabel + ' Control Room focused on ' + missionLabel + '.';
  detail.textContent = 'For ' + name + ', begin from the founder-declared ' + stateLabel + ' state. FCR will keep that declaration separate from independently verified reality and use ' + missionLabel + ' as the primary operating lens.';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = data && data.error && typeof data.error === 'object' ? data.error.message : data && data.error;
    throw new Error(errorMessage || 'Request failed (' + response.status + ')');
  }
  return data && data.success === true && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
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

async function requestWorkspaceRecommendation() {
  if (!isWorkspaceOwner()) return;
  const title = id('chief-recommendation-title');
  const detail = id('chief-recommendation-detail');
  serverRecommendationId = null;
  workspaceButton.disabled = true;
  title.textContent = 'Chief is binding this recommendation to your workspace…';
  detail.textContent = 'The exact project, mission, reality, and workspace are being fingerprinted before you can approve creation.';
  try {
    const result = await api('/workspace/projects/recommendation', {
      method: 'POST',
      body: JSON.stringify(composerPayload()),
    });
    const recommendation = result.recommendation;
    serverRecommendationId = recommendation.id;
    title.textContent = recommendation.title;
    detail.textContent = recommendation.detail + ' First gate: ' + recommendation.firstGate;
    say('Chief recommendation is bound to this exact workspace and project. Review it before creating the room.');
  } catch (error) {
    title.textContent = 'Chief could not bind this recommendation.';
    detail.textContent = error instanceof Error ? error.message : 'Request a fresh recommendation.';
    say(detail.textContent, true);
  } finally {
    workspaceButton.disabled = false;
  }
}

function showStep(step) {
  document.querySelectorAll('.composer-step').forEach((section) => {
    section.hidden = Number(section.dataset.step) !== step;
  });
  document.querySelectorAll('[data-step-indicator]').forEach((indicator) => {
    const value = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('active', value === step);
    indicator.classList.toggle('complete', value < step);
  });
  if (step === 4) {
    updateChiefRecommendation();
    if (isWorkspaceOwner()) void requestWorkspaceRecommendation();
  }
  flow.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(step) {
  const section = document.querySelector('.composer-step[data-step="' + step + '"]');
  if (!section) return true;
  const invalid = [...section.querySelectorAll('input')].find((input) => !input.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return false;
  }
  return true;
}

function resetComposer() {
  workspaceForm.reset();
  slugTouched = false;
  serverRecommendationId = null;
  updateChiefRecommendation();
  showStep(1);
  say('');
}

function profileFor(project) {
  return project && project.controlRoomProfile && typeof project.controlRoomProfile === 'object'
    ? project.controlRoomProfile
    : null;
}

function applyAccountMode() {
  const tenant = isWorkspaceOwner();
  const providerGrid = document.querySelector('.provider-grid');
  const providerFieldset = providerGrid && providerGrid.closest('fieldset');
  if (providerFieldset) providerFieldset.hidden = tenant;

  const moduleGrid = document.querySelector('.module-grid');
  if (moduleGrid) moduleGrid.hidden = tenant;

  const readyPrimary = document.querySelector('.ready-actions .primary-link');
  if (readyPrimary) readyPrimary.hidden = tenant;

  if (authorityConfirm) {
    const copy = authorityConfirm.closest('label')?.querySelector('span');
    if (copy && tenant) {
      copy.textContent = 'I approve this exact Chief recommendation to create this workspace-scoped Control Room. This does not approve provider access, merge, deployment, migration, spending, communication, deletion, or execution.';
    }
  }
}

function renderWorkspace(nextState) {
  state = nextState;
  const projects = Array.isArray(nextState.projects) ? nextState.projects : [];
  const connections = projects.reduce((count, project) => count + (Array.isArray(project.connections) ? project.connections.length : 0), 0);
  id('project-count').textContent = String(projects.length);
  id('connection-count').textContent = String(connections);

  if (projects.length === 0) {
    ready.hidden = true;
    flow.hidden = false;
    accountSecondary.hidden = true;
    cancelOnboarding.hidden = true;
    showStep(1);
    return;
  }

  const primary = projects[projects.length - 1];
  const profile = profileFor(primary);
  const profileEvidenceUnavailable = nextState && nextState.composerProfileEvidence && nextState.composerProfileEvidence.status === 'unavailable';
  const stateLabel = id('profile-current-state').previousElementSibling;
  if (stateLabel) stateLabel.textContent = 'Declared state';
  id('workspace-title').textContent = (primary && primary.name ? primary.name : 'Founder Control Room') + ' is ready.';
  const profileSummary = profile
    ? (projectTypeLabels[profile.projectType] || 'Project') + ' · ' + (missionLabels[profile.mission] || 'Mission') + ' · ' + (stateLabels[profile.currentState] || 'State unknown')
    : null;
  id('workspace-summary').textContent = profileSummary || projects.length + ' Control Room' + (projects.length === 1 ? '' : 's') + ' configured. Provider slots remain disconnected until separately authorized and verified.';
  id('profile-project-type').textContent = profile ? projectTypeLabels[profile.projectType] || 'Project' : profileEvidenceUnavailable ? 'Unavailable' : 'Legacy project';
  id('profile-mission').textContent = profile ? missionLabels[profile.mission] || 'Not classified' : profileEvidenceUnavailable ? 'Unavailable' : 'Not classified';
  id('profile-current-state').textContent = profile ? stateLabels[profile.currentState] || 'Unknown' : profileEvidenceUnavailable ? 'Unavailable' : 'Unknown';
  id('profile-next-gate').textContent = profile ? nextGateLabels[profile.mission] || 'Establish evidence' : profileEvidenceUnavailable ? 'Re-check onboarding profile evidence' : 'Compose this room to establish a mission';
  flow.hidden = true;
  ready.hidden = false;
  accountSecondary.hidden = isWorkspaceOwner();
  cancelOnboarding.hidden = true;
}

async function loadState() {
  const nextState = isWorkspaceOwner()
    ? await api('/workspace/projects')
    : await api('/onboarding/state');
  renderWorkspace(nextState);
}

function openOnboarding() {
  resetComposer();
  flow.hidden = false;
  ready.hidden = true;
  accountSecondary.hidden = true;
  cancelOnboarding.hidden = !(state && Array.isArray(state.projects) && state.projects.length > 0);
}

async function session() {
  const response = await fetch('/workspace/me', { credentials: 'same-origin', cache: 'no-store' });
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
    accountSecondary.hidden = true;
    showStep(1);
    say(error instanceof Error ? error.message : 'Unable to load onboarding state', true);
  }
}

ensureChiefUi();
document.querySelectorAll('input[name="projectType"],input[name="mission"],input[name="currentState"]').forEach((input) => input.addEventListener('change', updateChiefRecommendation));
document.querySelectorAll('.next-step').forEach((button) => button.addEventListener('click', () => {
  const current = Number(button.closest('.composer-step')?.dataset.step || 1);
  if (validateStep(current)) showStep(Number(button.dataset.nextStep));
}));
document.querySelectorAll('.previous-step').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.previousStep))));
projectName.addEventListener('input', () => {
  if (!slugTouched) projectSlug.value = slugify(projectName.value);
  updateChiefRecommendation();
});
projectSlug.addEventListener('input', () => {
  slugTouched = true;
  projectSlug.value = slugify(projectSlug.value);
  serverRecommendationId = null;
});
id('repo-identifier').addEventListener('input', () => { serverRecommendationId = null; });
id('project-stack').addEventListener('input', () => { serverRecommendationId = null; });

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  say('Requesting a one-time founder link…');
  try {
    const email = new FormData(loginForm).get('email');
    const data = await api('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
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
  if (!validateStep(4)) return;
  const tenant = isWorkspaceOwner();
  if (tenant && !serverRecommendationId) {
    say('Chief recommendation is stale or unavailable. Return to Reality, then continue to Evidence for a fresh recommendation.', true);
    return;
  }

  workspaceButton.disabled = true;
  say(tenant ? 'Creating the approved workspace-scoped Control Room…' : 'Composing the Control Room and declaring evidence boundaries…');
  try {
    const formData = new FormData(workspaceForm);
    const payload = composerPayload();
    const providers = tenant ? [] : formData.getAll('providers').map(String);

    if (tenant) {
      const result = await api('/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          providers,
          chiefRecommendationId: serverRecommendationId,
          chiefApproval: true,
        }),
      });
      const recommendation = result && result.chief && result.chief.recommendation;
      say('Control Room ready. ' + (recommendation ? recommendation.firstGate : 'Chief configuration recorded.') + ' No provider or execution authority was granted.');
      serverRecommendationId = null;
    } else {
      const result = await api('/onboarding/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ ...payload, providers }),
      });
      const created = Array.isArray(result.connectionsCreated) ? result.connectionsCreated.length : 0;
      say('Control Room ready. ' + created + ' evidence slot' + (created === 1 ? ' was' : 's were') + ' declared. No credentials or execution authority were granted.');
    }
    await loadState();
  } catch (error) {
    say(error instanceof Error ? error.message : 'Unable to create Control Room', true);
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
    const data = await api('/auth/password', { method: 'POST', body: JSON.stringify({ password, confirmPassword }) });
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
  accountSecondary.hidden = isWorkspaceOwner();
  say('');
});
await Promise.all([health(), session()]);
`;
