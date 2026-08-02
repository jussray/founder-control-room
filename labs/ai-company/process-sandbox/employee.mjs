export const SYNTHETIC_EMPLOYEE_VERSION = 'synthetic-evidence-analyst-v1';

const HTTPS_URL = /^https:\/\/[^\s]+$/;

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty array`);
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`));
}

function normalizeFact(fact, index) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    throw new TypeError(`task.facts[${index}] must be an object`);
  }

  return Object.freeze({
    label: requireString(fact.label, `task.facts[${index}].label`),
    value: requireString(fact.value, `task.facts[${index}].value`),
    proofUrl: requireString(fact.proofUrl, `task.facts[${index}].proofUrl`),
  });
}

function assertRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('request must be an object');
  }
  if (request.version !== 'synthetic-employee-request-v1') {
    throw new TypeError('request.version is not supported');
  }
  if (request.dataClassification !== 'synthetic') {
    throw new TypeError('only synthetic data is accepted');
  }
  if (request.employee !== 'synthetic-evidence-analyst') {
    throw new TypeError('employee is not allowed');
  }
  if (
    request.authority?.level !== 'L0'
    || request.authority?.mode !== 'simulation'
    || request.authority?.executionAllowed !== false
  ) {
    throw new TypeError('authority must remain L0 simulation-only');
  }
  if (request.task?.kind !== 'evidence-brief') {
    throw new TypeError('task.kind is not allowed');
  }
}

export function runSyntheticEmployee(request) {
  assertRequest(request);

  const taskId = requireString(request.taskId, 'taskId');
  const goal = requireString(request.task.goal, 'task.goal');
  const audiences = requireStringArray(request.task.audiences, 'task.audiences').sort();
  const facts = request.task.facts.map(normalizeFact).sort((left, right) => (
    left.label.localeCompare(right.label)
  ));

  if (facts.length === 0 || facts.length > 12) {
    throw new TypeError('task.facts must contain between 1 and 12 facts');
  }

  const missingProof = facts
    .filter((fact) => !HTTPS_URL.test(fact.proofUrl))
    .map((fact) => fact.label);
  const decision = missingProof.length === 0 ? 'ready_for_review' : 'blocked_missing_proof';
  const brief = facts.map((fact) => `${fact.label}: ${fact.value} (${fact.proofUrl})`);

  return Object.freeze({
    version: 'synthetic-employee-result-v1',
    taskId,
    employee: Object.freeze({
      id: 'synthetic-evidence-analyst',
      version: SYNTHETIC_EMPLOYEE_VERSION,
      model: Object.freeze({
        provider: 'deterministic-fixture',
        id: 'synthetic-model-v1',
        externalCalls: false,
      }),
    }),
    authority: Object.freeze({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    }),
    decision,
    goal,
    audiences: Object.freeze(audiences),
    missingProof: Object.freeze(missingProof),
    brief: Object.freeze(brief),
    liveSideEffects: false,
    publicUrl: null,
  });
}
