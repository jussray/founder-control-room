(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const privilegedActions = new Set(['create_branch', 'merge']);
  const executePath = /^\/approvals\/[^/]+\/execute$/;

  function formForAction(actionType) {
    return actionType === 'merge'
      ? document.querySelector('#execute-merge-form')
      : document.querySelector('#create-branch-form');
  }

  function planFieldForAction(actionType) {
    return formForAction(actionType)?.querySelector('textarea[name="capabilityPlan"]') ?? null;
  }

  function readCapabilityPlan(actionType) {
    const field = planFieldForAction(actionType);
    const raw = field?.value.trim() ?? '';
    if (!raw) {
      throw new Error('Attach the Chief AI V10 capability plan before privileged execution.');
    }

    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      throw new Error('Chief AI V10 capability plan must be valid JSON.');
    }

    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new Error('Chief AI V10 capability plan must be a JSON object.');
    }

    return plan;
  }

  function addPlanField(form, actionType) {
    if (!form || form.querySelector('[data-v10-plan-bridge]')) return;

    const wrapper = document.createElement('div');
    wrapper.dataset.v10PlanBridge = 'true';
    wrapper.innerHTML = `
      <label>Chief AI V10 capability plan JSON</label>
      <textarea
        class="code"
        name="capabilityPlan"
        rows="8"
        required
        autocomplete="off"
        spellcheck="false"
        aria-describedby="v10-plan-help-${actionType}"
        placeholder='{"contract":"juss-v10/capability-plan@v1", ...}'
      ></textarea>
      <p class="muted" id="v10-plan-help-${actionType}">
        Paste the exact plan produced by Chief AI for this ${actionType === 'merge' ? 'merge' : 'branch creation'}.
        Founder Control Room transports it unchanged and validates it server-side; it does not generate or persist the plan here.
      </p>
    `;

    const submitRow = form.querySelector('button[type="submit"]')?.parentElement ?? null;
    form.insertBefore(wrapper, submitRow);
  }

  function augmentPrivilegedForms() {
    addPlanField(document.querySelector('#create-branch-form'), 'create_branch');
    addPlanField(document.querySelector('#execute-merge-form'), 'merge');
  }

  const observer = new MutationObserver(augmentPrivilegedForms);
  const root = document.getElementById('root');
  if (root) observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', augmentPrivilegedForms, { once: true });
  augmentPrivilegedForms();

  window.fetch = async function v10BoundFetch(input, init = {}) {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.origin);
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method !== 'POST' || !executePath.test(url.pathname) || typeof init.body !== 'string') {
      return nativeFetch(input, init);
    }

    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      return nativeFetch(input, init);
    }

    if (!body || !privilegedActions.has(body.actionType) || body.capabilityPlan !== undefined) {
      return nativeFetch(input, init);
    }

    const nextInit = {
      ...init,
      body: JSON.stringify({
        ...body,
        capabilityPlan: readCapabilityPlan(body.actionType),
      }),
    };

    return nativeFetch(input, nextInit);
  };
})();
