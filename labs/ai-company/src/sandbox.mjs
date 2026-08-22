import { runCompanySimulation } from './company.mjs';
import { sha256Hex } from './sha256.mjs';

export const AI_COMPANY_SANDBOX_VERSION = 'ai-company-sandbox-v1';

export const AI_COMPANY_SANDBOX_CAPABILITIES = deepFreeze({
  network: false,
  providers: false,
  database: false,
  filesystem: false,
  environment: false,
  subprocess: false,
  secrets: false,
  dynamicCode: false,
  wallClock: false,
  randomness: false,
  publicUrls: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertDataDescriptor(descriptor, path) {
  if (!descriptor || !('value' in descriptor)) {
    throw new TypeError(`${path}: accessor properties are not sandbox-safe`);
  }
  if (descriptor.enumerable !== true) {
    throw new TypeError(`${path}: hidden properties are not sandbox-safe`);
  }
}

function assertJsonSafe(value, path = '$', ancestors = []) {
  if (value === null) return;

  const type = typeof value;
  if (['string', 'boolean'].includes(type)) return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number is not sandbox-safe`);
    return;
  }
  if (type !== 'object') throw new TypeError(`${path}: ${type} is not sandbox-safe`);
  if (ancestors.includes(value)) throw new TypeError(`${path}: circular input is not sandbox-safe`);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${path}: symbol properties are not sandbox-safe`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  ancestors.push(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(`${path}: custom array prototypes are not sandbox-safe`);
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === 'length') continue;
      if (!/^(0|[1-9]\d*)$/.test(key)) {
        throw new TypeError(`${path}.${key}: custom array properties are not sandbox-safe`);
      }
      assertDataDescriptor(descriptor, `${path}[${key}]`);
      assertJsonSafe(descriptor.value, `${path}[${key}]`, ancestors);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path}: custom prototypes are not sandbox-safe`);
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      assertDataDescriptor(descriptor, `${path}.${key}`);
      assertJsonSafe(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.pop();
}

export function sealSandboxValue(value) {
  assertJsonSafe(value);
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return sha256Hex(stableStringify(value));
}

function sandboxMetadata(inputFingerprint, outputFingerprint = null) {
  return {
    id: `ai-company-${inputFingerprint}`,
    version: AI_COMPANY_SANDBOX_VERSION,
    deterministic: true,
    inputFingerprint,
    outputFingerprint,
    capabilities: AI_COMPANY_SANDBOX_CAPABILITIES,
  };
}

function inspectReceipt(receipt, expectedEventId) {
  const violations = [];
  if (receipt?.provider !== 'fake-buffer') violations.push('receipt_provider_not_fake');
  if (receipt?.simulation !== true) violations.push('receipt_not_simulation');
  if (receipt?.executionAllowed !== false) violations.push('receipt_claims_execution');
  if (receipt?.liveSideEffects !== false) violations.push('receipt_claims_live_side_effects');
  if (receipt?.publicUrl !== null) violations.push('receipt_claims_public_url');
  if (receipt?.eventId !== expectedEventId) violations.push('receipt_event_mismatch');
  if (!['simulated_draft', 'simulated_queue', 'simulated_publish'].includes(receipt?.status)) {
    violations.push('receipt_status_invalid');
  }
  return violations;
}

export function inspectAuthorityBoundary(result) {
  const violations = [];
  if (result?.authority?.level !== 'L0') violations.push('authority_level_escalated');
  if (result?.authority?.mode !== 'simulation') violations.push('authority_mode_escalated');
  if (result?.authority?.executionAllowed !== false) violations.push('execution_authority_enabled');
  if (result?.liveSideEffects !== undefined && result.liveSideEffects !== false) {
    violations.push('live_side_effects_enabled');
  }

  const isolation = result?.isolation;
  if (isolation && Object.values(isolation).some((value) => value !== false)) {
    violations.push('isolation_boundary_broken');
  }

  for (const receipt of result?.receipts ?? []) {
    violations.push(...inspectReceipt(receipt, result?.campaign?.eventId ?? receipt?.eventId));
  }

  return [...new Set(violations)];
}

export function runCompanySandbox(companyInput, options = {}) {
  const input = sealSandboxValue(companyInput);
  const inputFingerprint = fingerprint(input);
  const killSwitch = options?.killSwitch === true;
  const expectedInputFingerprint = options?.expectedInputFingerprint;

  if (killSwitch) {
    return deepFreeze({
      status: 'blocked',
      simulatorInvoked: false,
      violations: ['kill_switch_active'],
      sandbox: sandboxMetadata(inputFingerprint),
      result: null,
    });
  }

  if (expectedInputFingerprint && expectedInputFingerprint !== inputFingerprint) {
    return deepFreeze({
      status: 'blocked',
      simulatorInvoked: false,
      violations: ['input_fingerprint_mismatch'],
      sandbox: sandboxMetadata(inputFingerprint),
      result: null,
    });
  }

  const before = stableStringify(input);
  let rawResult;
  try {
    rawResult = runCompanySimulation(input);
  } catch {
    return deepFreeze({
      status: 'blocked',
      simulatorInvoked: true,
      violations: ['simulation_input_rejected'],
      sandbox: sandboxMetadata(inputFingerprint),
      result: null,
    });
  }
  const after = stableStringify(input);
  const result = sealSandboxValue(rawResult);
  const violations = [
    ...(before === after ? [] : ['sandbox_input_mutated']),
    ...inspectAuthorityBoundary(result),
  ];

  return deepFreeze({
    status: violations.length > 0 ? 'quarantined' : 'simulated',
    simulatorInvoked: true,
    violations: [...new Set(violations)],
    sandbox: sandboxMetadata(inputFingerprint, fingerprint(result)),
    result,
  });
}
