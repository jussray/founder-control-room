const INTENT_STORAGE_KEY = 'fcr_last_intent';

function rememberedIntent() {
  try { return sessionStorage.getItem(INTENT_STORAGE_KEY) ?? ''; } catch { return ''; }
}
function rememberIntent(value) {
  try { sessionStorage.setItem(INTENT_STORAGE_KEY, value); } catch {}
}
function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.appendChild(node);
  return node;
}
function resultRow(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'intent-result-row';
  appendText(row, 'span', 'intent-result-label', label);
  appendText(row, 'strong', '', value);
  parent.appendChild(row);
}
function simplifySignIn() {
  const card = document.querySelector('.sign-in-card');
  if (!(card instanceof HTMLElement) || card.dataset.simpleLogin === 'true') return false;
  const heading = card.querySelector('h2');
  const description = card.querySelector(':scope > .muted');
  const label = card.querySelector('#magic-link-form label');
  const button = card.querySelector('#magic-link-form button[type="submit"]');
  if (heading) heading.textContent = 'Who are you?';
  if (description) description.textContent = 'Use your founder email. We’ll send one secure sign-in link.';
  if (label) label.textContent = 'Email';
  if (button) button.textContent = 'Continue';
  card.dataset.simpleLogin = 'true';
  return true;
}
function renderPlanResult(container, payload) {
  container.replaceChildren();
  if (!payload || payload.status !== 'simulated' || !payload.plan) {
    container.dataset.state = 'blocked';
    appendText(container, 'strong', '', 'Plan held.');
    appendText(container, 'p', 'muted', 'FCR could not produce a safe preview. Nothing was executed.');
    return;
  }
  const plan = payload.plan;
  const chiefPlanObserved = plan.route?.capabilityPlan?.observed === true;
  container.dataset.state = 'ready';
  appendText(container, 'p', 'intent-kicker', 'PREVIEW ONLY');
  appendText(container, 'h3', '', 'Here is the route before anything moves.');
  const rows = document.createElement('div');
  rows.className = 'intent-result-grid';
  resultRow(rows, 'PromptOS', 'Intent is ready for structured handoff');
  resultRow(rows, 'Chief', chiefPlanObserved ? 'Capability plan observed' : 'Capability selection is the next handoff');
  resultRow(rows, 'FCR', plan.authority?.executionAllowed === false ? 'Authority locked for review' : 'Authority state needs review');
  container.appendChild(rows);
  const next = chiefPlanObserved
    ? 'Review the exact Chief capability plan. Execution still requires its own authority and proof gate.'
    : 'Chief must select the capability plan, then return that exact plan to FCR for validation. Nothing executed.';
  appendText(container, 'p', 'intent-next', next);
}
async function previewGoal(goal, button, result) {
  button.disabled = true;
  button.textContent = 'Shaping…';
  result.replaceChildren();
  result.dataset.state = 'loading';
  appendText(result, 'p', 'muted', 'Intent → Chief → FCR');
  try {
    const response = await fetch('/founder-os/preview', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ goal, action: 'plan', command: 'v10' }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? `Plan preview failed (${response.status})`);
    renderPlanResult(result, payload);
  } catch (error) {
    result.replaceChildren();
    result.dataset.state = 'blocked';
    appendText(result, 'strong', '', 'Plan held.');
    appendText(result, 'p', 'muted', error instanceof Error ? error.message : 'FCR could not create the preview.');
    appendText(result, 'p', 'intent-next', 'Nothing was executed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Shape plan';
  }
}
function installIntentEntry() {
  const shell = document.querySelector('.shell');
  const tabs = shell?.querySelector('.tabs');
  if (!(shell instanceof HTMLElement) || !(tabs instanceof HTMLElement)) return false;
  if (shell.querySelector('#intent-entry')) return true;
  const section = document.createElement('section');
  section.id = 'intent-entry'; section.className = 'intent-entry';
  const copy = document.createElement('div'); copy.className = 'intent-copy';
  appendText(copy, 'p', 'intent-kicker', 'NOW');
  appendText(copy, 'h1', '', 'What do you want to move?');
  appendText(copy, 'p', 'muted', 'Describe the outcome. FCR shapes a review-only route before anything can execute.');
  const form = document.createElement('form'); form.id = 'intent-form'; form.className = 'intent-form';
  const label = document.createElement('label'); label.htmlFor = 'founder-intent'; label.textContent = 'Outcome';
  const input = document.createElement('textarea');
  input.id = 'founder-intent'; input.name = 'goal'; input.rows = 3; input.required = true; input.maxLength = 2000;
  input.placeholder = 'Example: make the FCR login easier to understand.'; input.value = rememberedIntent();
  const button = document.createElement('button'); button.className = 'primary intent-submit'; button.type = 'submit'; button.textContent = 'Shape plan';
  form.append(label, input, button);
  const result = document.createElement('div'); result.className = 'intent-result'; result.setAttribute('aria-live', 'polite');
  section.append(copy, form, result); shell.insertBefore(section, tabs);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const goal = input.value.trim();
    if (!goal) return;
    rememberIntent(goal);
    void previewGoal(goal, button, result);
  });
  return true;
}
function reconcileEntrySurface() { simplifySignIn(); installIntentEntry(); }
const root = document.getElementById('root');
if (root) {
  reconcileEntrySurface();
  const observer = new MutationObserver(reconcileEntrySurface);
  observer.observe(root, { childList: true, subtree: true });
}
