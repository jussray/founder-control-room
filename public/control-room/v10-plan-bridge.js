(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const privilegedActions = new Set(['create_branch', 'merge']);
  const executePath = /^\/approvals\/([^/]+)\/execute$/;
  const HASH = /^[0-9a-f]{64}$/i;
  const FULL_SHA = /^[0-9a-f]{40}$/i;
  const FOUNDER_DECISION_CONTRACT = 'juss-v10/founder-control-decision@v1';
  let lastExecutionEvidence = null;

  function formForAction(actionType) {
    return actionType === 'merge'
      ? document.querySelector('#execute-merge-form')
      : document.querySelector('#create-branch-form');
  }

  function planFieldForAction(actionType) {
    return formForAction(actionType)?.querySelector('textarea[name="capabilityPlan"]') ?? null;
  }

  function parseJsonObject(raw, label) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return value;
  }

  function readCapabilityPlan(actionType) {
    const field = planFieldForAction(actionType);
    const raw = field?.value.trim() ?? '';
    if (!raw) {
      throw new Error('Attach the Chief AI V10 capability plan before privileged execution.');
    }
    return parseJsonObject(raw, 'Chief AI V10 capability plan');
  }

  function readDecisionReceipt() {
    const field = formForAction('merge')?.querySelector('textarea[name="decisionReceipt"]');
    const raw = field?.value.trim() ?? '';
    if (!raw) {
      throw new Error('Attach the Chief AI V10 decision receipt before merge execution.');
    }
    return parseJsonObject(raw, 'Chief AI V10 decision receipt');
  }

  function readPromptOSDecisionHash() {
    const field = formForAction('merge')?.querySelector('input[name="promptOSDecisionHash"]');
    const value = field?.value.trim().toLowerCase() ?? '';
    if (!HASH.test(value)) {
      throw new Error('PromptOS decision hash must be the exact 64-character SHA-256 from the validated Chief decision.');
    }
    return value;
  }

  function addAuthorityFields(form, actionType) {
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
      ${actionType === 'merge' ? `
        <label>Chief AI V10 decision receipt JSON</label>
        <textarea
          class="code"
          name="decisionReceipt"
          rows="8"
          required
          autocomplete="off"
          spellcheck="false"
          aria-describedby="v10-decision-help-merge"
          placeholder='{"contract":"juss-v10/decision-cycle@v1", ...}'
        ></textarea>
        <p class="muted" id="v10-decision-help-merge">
          Paste the exact portable decision receipt from Chief AI. Founder Control Room validates the receipt and keeps only its decision hash on the execution envelope.
        </p>
        <label>PromptOS decision hash</label>
        <input
          class="code"
          name="promptOSDecisionHash"
          inputmode="text"
          minlength="64"
          maxlength="64"
          pattern="[0-9a-fA-F]{64}"
          required
          autocomplete="off"
          spellcheck="false"
          aria-describedby="v10-promptos-help-merge"
          placeholder="64-character SHA-256"
        />
        <p class="muted" id="v10-promptos-help-merge">
          Supply the exact PromptOS handoff hash. Clicking Execute merge is the founder-explicit approval event; the browser binds that click to this decision, the capability plan, project, mission, and exact head before the server re-validates everything.
        </p>
      ` : ''}
    `;

    const submitRow = form.querySelector('button[type="submit"]')?.parentElement ?? null;
    form.insertBefore(wrapper, submitRow);
  }

  function normalizeProposal(proposal) {
    return {
      proposalId: String(proposal.proposalId ?? '').trim(),
      proposalHash: String(proposal.proposalHash ?? '').trim().toLowerCase(),
      projectSlug: String(proposal.projectSlug ?? '').trim(),
      actionType: String(proposal.actionType ?? '').trim(),
      expectedHeadSha: String(proposal.expectedHeadSha ?? '').trim().toLowerCase() || null,
      capabilityPlanHash: String(proposal.capabilityPlanHash ?? '').trim().toLowerCase() || null,
    };
  }

  async function sha256Hex(value) {
    if (!window.crypto?.subtle) {
      throw new Error('Secure browser hashing is unavailable; founder decision binding cannot be created.');
    }
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function createFounderMergeDecision(missionId, plan, decisionReceipt) {
    const proposal = normalizeProposal({
      proposalId: missionId,
      proposalHash: decisionReceipt?.decisionHash,
      projectSlug: plan?.projectSlug,
      actionType: 'merge',
      expectedHeadSha: plan?.expectedHeadSha,
      capabilityPlanHash: plan?.planHash,
    });

    if (!proposal.proposalId) throw new Error('Mission identity is required for founder decision binding.');
    if (!HASH.test(proposal.proposalHash)) throw new Error('Chief decision receipt must contain a valid decisionHash.');
    if (!proposal.projectSlug) throw new Error('Capability plan project is required for founder decision binding.');
    if (!FULL_SHA.test(proposal.expectedHeadSha ?? '')) throw new Error('Capability plan exact head is required for founder decision binding.');
    if (!HASH.test(proposal.capabilityPlanHash ?? '')) throw new Error('Capability plan hash is required for founder decision binding.');

    const surface = 'fcr';
    const decision = 'approved';
    const decisionHash = await sha256Hex(JSON.stringify([
      FOUNDER_DECISION_CONTRACT,
      proposal.proposalId,
      proposal.proposalHash,
      proposal.projectSlug,
      proposal.actionType,
      proposal.expectedHeadSha,
      proposal.capabilityPlanHash,
      surface,
      decision,
      true,
      true,
      false,
    ]));

    return {
      contract: FOUNDER_DECISION_CONTRACT,
      proposal,
      surface,
      decision,
      founderExplicit: true,
      scopeLocked: true,
      changesAllowed: false,
      executionAuthorized: true,
      decisionHash,
    };
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
    addAuthorityFields(document.querySelector('#create-branch-form'), 'create_branch');
    addAuthorityFields(document.querySelector('#execute-merge-form'), 'merge');
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
    const executeMatch = url.pathname.match(executePath);

    if (method !== 'POST' || !executeMatch || typeof init.body !== 'string') {
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

    const capabilityPlan = body.capabilityPlan ?? readCapabilityPlan(body.actionType);
    let nextBody = { ...body, capabilityPlan };

    if (body.actionType === 'merge') {
      const decisionReceipt = body.decisionReceipt ?? readDecisionReceipt();
      const promptOSDecisionHash = String(body.promptOSDecisionHash ?? readPromptOSDecisionHash()).trim().toLowerCase();
      const founderDecision = body.founderDecision
        ?? await createFounderMergeDecision(decodeURIComponent(executeMatch[1]), capabilityPlan, decisionReceipt);
      nextBody = {
        ...nextBody,
        decisionReceipt,
        promptOSDecisionHash,
        founderDecision,
      };
    }

    const response = await nativeFetch(input, {
      ...init,
      body: JSON.stringify(nextBody),
    });
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