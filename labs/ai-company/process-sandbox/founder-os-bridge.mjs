import { runSyntheticEmployeeContainer } from './host.mjs';

const BRIDGE_VERSION = 'founder-os-container-bridge-v1';
const RECEIPT_VERSION = 'founder-os-container-control-receipt-v1';
const WORKER_REQUEST_VERSION = 'synthetic-employee-request-v1';
const ALLOWED_ACTIONS = new Set(['inspect', 'plan']);
const EXPECTED_WORKER_CAPABILITIES = Object.freeze({
  network: false,
  providers: false,
  database: false,
  filesystemWrite: false,
  childProcess: false,
  workerThreads: false,
  nativeAddons: false,
  wasi: false,
  inspector: false,
  dynamicCode: false,
  environment: false,
});
const FINGERPRINT8 = /^[0-9a-f]{8}$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const SHA40 = /^[0-9a-f]{40}$/i;

const EXPECTED_BOUNDARY = Object.freeze({
  type: 'docker-container',
  network: 'none',
  rootFilesystem: 'read-only',
  inheritedHostEnvironment: false,
  user: '65534:65534',
  capabilitiesDropped: 'ALL',
  noNewPrivileges: true,
  memory: '64m',
  memorySwap: '64m',
  cpus: '0.50',
  pids: '32',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value) {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

class FounderOsContainerBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FounderOsContainerBridgeError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new FounderOsContainerBridgeError(code, message);
}

function assertRecord(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(code, message);
}

function assertFounderOsEligibility(request, plan) {
  assertRecord(request, 'handoff_request_invalid', 'request must be an object');
  assertRecord(plan, 'handoff_plan_invalid', 'plan must be an object');

  if (!ALLOWED_ACTIONS.has(request.action)) {
    reject('action_not_allowlisted', 'only inspect and plan may enter the container worker');
  }
  if (plan.version !== 'founder-os-lab-v1') {
    reject('plan_contract_mismatch', 'unsupported Founder OS plan version');
  }
  if (plan.action !== request.action || plan.goal !== request.goal.trim()) {
    reject('plan_contract_mismatch', 'plan does not match the Founder OS request');
  }
  if (plan.readiness !== 'ready_for_review') {
    reject('plan_not_review_ready', 'container tasks require ready_for_review');
  }
  if (
    plan.authority?.level !== 'L0'
    || plan.authority?.mode !== 'simulation'
    || plan.authority?.executionAllowed !== false
  ) {
    reject('authority_not_l0', 'Founder OS authority must remain L0 simulation-only');
  }
  if (plan.route?.chiefSkill !== 'juss-chief-ai') {
    reject('chief_route_mismatch', 'container handoff must route through juss-chief-ai');
  }
  if (
    typeof plan.route?.command?.id !== 'string'
    || !plan.route.command.id.trim()
    || typeof plan.route?.provider?.id !== 'string'
    || !plan.route.provider.id.trim()
  ) {
    reject('route_contract_invalid', 'Founder OS command and provider route are required');
  }
  if (
    plan.route.provider.mode !== 'preview'
    || plan.route.provider.supported !== true
    || plan.route.provider.executionAllowed !== false
  ) {
    reject('provider_route_not_preview', 'Founder OS provider must remain a supported non-executing preview');
  }
  if (
    !Array.isArray(plan.route.provider.preflightEvidenceMissing)
    || plan.route.provider.preflightEvidenceMissing.length !== 0
  ) {
    reject('provider_preflight_incomplete', 'Founder OS provider preflight evidence must be complete');
  }
  if (plan.authority.approvalRequired !== false) {
    reject('approval_state_invalid', 'inspect and plan container tasks must never require approval');
  }
  if (!Array.isArray(plan.truth?.blocked) || plan.truth.blocked.length !== 0) {
    reject('plan_blocked', 'blocked Founder OS plans may not enter the worker');
  }
  if (
    !plan.isolation
    || Object.values(plan.isolation).some((value) => value !== false)
  ) {
    reject('isolation_not_preserved', 'Founder OS isolation flags must all remain false');
  }

  const evidence = request.evidence;
  if (!evidence || typeof evidence.repository !== 'string' || !evidence.repository.trim()) {
    reject('evidence_incomplete', 'authoritative repository is required');
  }
  if (typeof evidence.commitSha !== 'string' || !SHA40.test(evidence.commitSha)) {
    reject('evidence_incomplete', 'exact 40-character commit SHA is required');
  }
  if (
    !Array.isArray(evidence.proofUrls)
    || evidence.proofUrls.length === 0
    || evidence.proofUrls.length > 8
    || evidence.proofUrls.some((url) => typeof url !== 'string' || !HTTPS_URL.test(url))
  ) {
    reject('evidence_incomplete', 'one to eight HTTPS proof URLs are required');
  }
}

export function buildFounderOsWorkerRequest(request, plan) {
  assertFounderOsEligibility(request, plan);

  const proofUrls = [...request.evidence.proofUrls];
  const primaryProof = proofUrls[0];
  const facts = [
    {
      label: 'Authoritative repository',
      value: request.evidence.repository.trim(),
      proofUrl: primaryProof,
    },
    {
      label: 'Exact source commit',
      value: request.evidence.commitSha.toLowerCase(),
      proofUrl: primaryProof,
    },
    {
      label: 'Founder OS route',
      value: `juss-chief-ai -> ${plan.route.command.id} -> ${plan.route.provider.id}`,
      proofUrl: primaryProof,
    },
    {
      label: 'Founder OS readiness',
      value: plan.readiness,
      proofUrl: primaryProof,
    },
    ...proofUrls.map((url, index) => ({
      label: `Proof ${index + 1}`,
      value: url,
      proofUrl: url,
    })),
  ];

  const taskSeed = {
    version: BRIDGE_VERSION,
    action: request.action,
    goal: request.goal.trim(),
    repository: request.evidence.repository.trim(),
    commitSha: request.evidence.commitSha.toLowerCase(),
    proofUrls,
    commandId: plan.route.command.id,
    providerId: plan.route.provider.id,
  };

  return deepFreeze({
    version: WORKER_REQUEST_VERSION,
    dataClassification: 'synthetic',
    employee: 'synthetic-evidence-analyst',
    taskId: `founder-os-${fingerprint(taskSeed)}`,
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    task: {
      kind: 'evidence-brief',
      goal: request.goal.trim(),
      audiences: ['founder-control-plane'],
      facts,
    },
  });
}

function boundaryMatches(boundary) {
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) return false;
  return Object.entries(EXPECTED_BOUNDARY).every(([key, value]) => boundary[key] === value);
}

function validWorkerReceipt(workerRequest, worker) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker)) return false;
  if (
    worker.status !== 'simulated'
    || worker.workerVersion !== 'ai-company-process-worker-v1'
    || worker.environmentCleared !== true
  ) return false;
  if (
    worker.authority?.level !== 'L0'
    || worker.authority?.mode !== 'simulation'
    || worker.authority?.executionAllowed !== false
  ) return false;
  if (!worker.capabilities || typeof worker.capabilities !== 'object' || Array.isArray(worker.capabilities)) {
    return false;
  }
  const capabilityKeys = Object.keys(EXPECTED_WORKER_CAPABILITIES);
  if (
    Object.keys(worker.capabilities).length !== capabilityKeys.length
    || capabilityKeys.some((key) => worker.capabilities[key] !== false)
  ) {
    return false;
  }
  if (
    typeof worker.inputFingerprint !== 'string'
    || typeof worker.outputFingerprint !== 'string'
    || !FINGERPRINT8.test(worker.inputFingerprint)
    || !FINGERPRINT8.test(worker.outputFingerprint)
  ) {
    return false;
  }

  const result = worker.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (result.version !== 'synthetic-employee-result-v1') return false;
  if (result.taskId !== workerRequest.taskId) return false;
  if (result.employee?.id !== 'synthetic-evidence-analyst') return false;
  if (result.employee?.version !== 'synthetic-evidence-analyst-v1') return false;
  if (result.employee?.model?.provider !== 'deterministic-fixture') return false;
  if (result.employee?.model?.id !== 'synthetic-model-v1') return false;
  if (result.employee?.model?.externalCalls !== false) return false;
  if (
    result.authority?.level !== 'L0'
    || result.authority?.mode !== 'simulation'
    || result.authority?.executionAllowed !== false
  ) return false;
  if (result.decision !== 'ready_for_review') return false;
  if (!Array.isArray(result.missingProof) || result.missingProof.length !== 0) return false;
  if (
    !Array.isArray(result.brief)
    || result.brief.length === 0
    || result.brief.some((line) => typeof line !== 'string')
  ) return false;
  if (result.liveSideEffects !== false || result.publicUrl !== null) return false;
  return true;
}

function blockedControlReceipt(plan, violations, containerInvoked) {
  return deepFreeze({
    version: RECEIPT_VERSION,
    status: 'blocked',
    controlPlane: 'juss-chief-ai',
    action: plan?.action ?? null,
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    containerInvoked,
    violations: [...new Set(violations)],
    receiptFingerprint: null,
    employee: null,
    liveSideEffects: false,
    publicUrl: null,
    nextGate: 'Repair the blocked handoff before any new container attempt.',
  });
}

export function sealFounderOsContainerReceipt(workerRequest, plan, containerReceipt) {
  const violations = [];
  if (containerReceipt?.version !== 'container-execution-receipt-v1') {
    violations.push('container_receipt_version_invalid');
  }
  if (containerReceipt?.status !== 'simulated') {
    violations.push('container_not_simulated');
    for (const violation of containerReceipt?.violations ?? []) {
      if (typeof violation === 'string') violations.push(`container:${violation}`);
    }
  }
  if (!boundaryMatches(containerReceipt?.boundary)) violations.push('container_boundary_invalid');
  if (containerReceipt?.exitCode !== 0 || containerReceipt?.signal !== null) {
    violations.push('container_process_invalid');
  }
  if (!validWorkerReceipt(workerRequest, containerReceipt?.worker)) {
    violations.push('worker_receipt_invalid');
  }

  if (violations.length > 0) return blockedControlReceipt(plan, violations, true);

  const payload = {
    version: RECEIPT_VERSION,
    status: 'simulated',
    controlPlane: 'juss-chief-ai',
    founderOs: {
      version: plan.version,
      action: plan.action,
      readiness: plan.readiness,
      commandId: plan.route.command.id,
      providerId: plan.route.provider.id,
    },
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    containerInvoked: true,
    container: {
      boundary: containerReceipt.boundary,
      workerVersion: containerReceipt.worker.workerVersion,
      inputFingerprint: containerReceipt.worker.inputFingerprint,
      outputFingerprint: containerReceipt.worker.outputFingerprint,
    },
    employee: {
      id: containerReceipt.worker.result.employee.id,
      version: containerReceipt.worker.result.employee.version,
      decision: containerReceipt.worker.result.decision,
      missingProof: [...containerReceipt.worker.result.missingProof],
      brief: [...containerReceipt.worker.result.brief],
    },
    liveSideEffects: false,
    publicUrl: null,
    nextGate: 'Founder review only. No external executor authority was granted.',
  };

  return deepFreeze({
    ...payload,
    receiptFingerprint: fingerprint(payload),
  });
}

export async function executeFounderOsContainerTask(request, plan, options = {}) {
  let workerRequest;
  try {
    workerRequest = buildFounderOsWorkerRequest(request, plan);
  } catch (error) {
    const code = error instanceof FounderOsContainerBridgeError
      ? error.code
      : 'handoff_rejected';
    return blockedControlReceipt(plan, [code], false);
  }

  let containerReceipt;
  try {
    containerReceipt = await runSyntheticEmployeeContainer(workerRequest, options);
  } catch {
    return blockedControlReceipt(plan, ['container_unavailable'], true);
  }

  return sealFounderOsContainerReceipt(workerRequest, plan, containerReceipt);
}
