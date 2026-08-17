(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const privilegedActions = new Set(['create_branch', 'merge']);
  const executePath = /^\/approvals\/[^/]+\/execute$/;
  let lastExecutionEvidence = null;

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

  function shortSha(value) {
    return typeof value === 'string' && value.length >= 12 ? value.slice(0, 12) : value;
  }

  function completionClaim(actionType, payload) {
    const label = actionType === 'merge' ? 'Merge' : 'Branch';
    const receipt = payload?.executionId;
    const result = payload?.result && typeof payload.result === 'object' ? payload.result : {};
    const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];

    if (!receipt) {
      return { text: `${label} accepted, but completion is not claimed: execution receipt unavailable.`, status: 'unverified', evidenceKinds: [], warningCount: 0 };
    }

    if (warnings.length > 0) {
      return { text: `${label} executed; completion is not claimed. Evidence: execution ${receipt}. Warning: ${warnings.join(' | ')}`, status: 'incomplete', evidenceKinds: ['execution'], warningCount: warnings.length };
    }

    if (actionType === 'merge') {
      const checks = result.evidence && typeof result.evidence === 'object'
        ? Object.entries(result.evidence)
        : [];
      if (!result.mergeCommitSha || !result.expectedHeadSha || checks.length === 0) {
        return { text: `Merge executed; completion is not claimed. Evidence: execution ${receipt}; exact completion evidence is incomplete.`, status: 'incomplete', evidenceKinds: ['execution'], warningCount: 0 };
      }
      return { text: `Merge witnessed. Evidence: execution ${receipt}; merge ${shortSha(result.mergeCommitSha)}; exact head ${shortSha(result.expectedHeadSha)}; checks ${checks.map(([kind, value]) => `${kind}=${value}`).join(', ')}.`, status: 'witnessed', evidenceKinds: ['execution', 'merge_commit', 'exact_head', 'checks'], warningCount: 0 };
    }

    if (!result.branchName || !result.expectedHeadSha) {
      return { text: `Branch executed; completion is not claimed. Evidence: execution ${receipt}; exact-head evidence is incomplete.`, status: 'incomplete', evidenceKinds: ['execution'], warningCount: 0 };
    }

    return { text: `Branch witnessed. Evidence: execution ${receipt}; branch ${result.branchName}; exact head ${shortSha(result.expectedHeadSha)}.`, status: 'witnessed', evidenceKinds: ['execution', 'branch', 'exact_head'], warningCount: 0 };
  }

  function emitCompletionObservation(actionType, claim) {
    window.dispatchEvent(new CustomEvent('fcr:completion-claim', {
      detail: {
        actionType,
        claimStatus: claim.status,
        evidenceKinds: claim.evidenceKinds,
        evidenceCount: claim.evidenceKinds.length,
        warningCount: claim.warningCount,
      },
    }));
  }

  function applyEvidenceBackedCompletionClaim() {
    const evidence = lastExecutionEvidence;
    if (!evidence) return;

    const expectedText = evidence.actionType === 'merge' ? 'Merge executed.' : 'Branch created.';
    const notice = [...document.querySelectorAll('#root .notice')]
      .find((node) => node.textContent?.trim() === expectedText);
    if (!notice) return;

    const claim = completionClaim(evidence.actionType, evidence.payload);
    notice.textContent = claim.text;
    notice.dataset.completionClaim = claim.status === 'witnessed' ? 'evidence-backed' : 'unverified';
    notice.dataset.claimStatus = claim.status;
    notice.dataset.evidenceCount = String(claim.evidenceKinds.length);
    emitCompletionObservation(evidence.actionType, claim);
    lastExecutionEvidence = null;
  }

  function augmentPrivilegedForms() {
    addPlanField(document.querySelector('#create-branch-form'), 'create_branch');
    addPlanField(document.querySelector('#execute-merge-form'), 'merge');
    applyEvidenceBackedCompletionClaim();
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

    if (!body || !privilegedActions.has(body.actionType)) {
      return nativeFetch(input, init);
    }

    const nextInit = body.capabilityPlan !== undefined
      ? init
      : {
          ...init,
          body: JSON.stringify({
            ...body,
            capabilityPlan: readCapabilityPlan(body.actionType),
          }),
        };

    const response = await nativeFetch(input, nextInit);
    try {
      const payload = await response.clone().json();
      lastExecutionEvidence = response.ok && payload?.ok === true
        ? { actionType: body.actionType, payload }
        : null;
    } catch {
      lastExecutionEvidence = null;
    }
    return response;
  };
})();