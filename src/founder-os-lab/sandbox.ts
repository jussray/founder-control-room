import { createHash } from 'node:crypto';
import type { FounderOsLabPlan, FounderOsLabRequest } from './contracts.js';
import { planFounderOsLab } from './engine.js';
import {
  evaluateUntrustedArtifactBoundary,
  type UntrustedArtifactBoundaryResult,
} from '../security/untrustedArtifactBoundary.js';

export const FOUNDER_OS_SANDBOX_VERSION = 'founder-os-sandbox-v1' as const;

export const FOUNDER_OS_SANDBOX_CAPABILITIES = Object.freeze({
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

export interface FounderOsSandboxOptions {
  killSwitch?: boolean;
  expectedInputFingerprint?: string;
}

export interface FounderOsSandboxRun {
  status: 'blocked' | 'quarantined' | 'simulated';
  plannerInvoked: boolean;
  violations: string[];
  trustBoundary: UntrustedArtifactBoundaryResult;
  sandbox: {
    id: string;
    version: typeof FOUNDER_OS_SANDBOX_VERSION;
    deterministic: true;
    inputFingerprint: string;
    outputFingerprint: string | null;
    capabilities: typeof FOUNDER_OS_SANDBOX_CAPABILITIES;
  };
  plan: Readonly<FounderOsLabPlan> | null;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value) as Readonly<T>;
}

function assertDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
  path: string,
): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!descriptor || !('value' in descriptor)) {
    throw new TypeError(`${path}: accessor properties are not sandbox-safe`);
  }
  if (descriptor.enumerable !== true) {
    throw new TypeError(`${path}: hidden properties are not sandbox-safe`);
  }
}

function assertJsonSafe(value: unknown, path = '$', ancestors: object[] = []): void {
  if (value === null) return;

  const type = typeof value;
  if (type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number is not sandbox-safe`);
    return;
  }
  if (type !== 'object') throw new TypeError(`${path}: ${type} is not sandbox-safe`);

  const object = value as object;
  if (ancestors.includes(object)) throw new TypeError(`${path}: circular input is not sandbox-safe`);
  if (Object.getOwnPropertySymbols(object).length > 0) {
    throw new TypeError(`${path}: symbol properties are not sandbox-safe`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(object);
  ancestors.push(object);
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

function cloneAndFreeze<T>(value: T): Readonly<T> {
  assertJsonSafe(value);
  return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function inspectFounderOsSandboxPlan(plan: FounderOsLabPlan): string[] {
  const violations: string[] = [];
  if (plan.authority.level !== 'L0') violations.push('authority_level_escalated');
  if (plan.authority.mode !== 'simulation') violations.push('authority_mode_escalated');
  if (plan.authority.executionAllowed !== false) violations.push('execution_authority_enabled');
  if (Object.values(plan.isolation).some((value) => value !== false)) {
    violations.push('isolation_boundary_broken');
  }
  return [...new Set(violations)];
}

export function runFounderOsSandbox(
  request: FounderOsLabRequest,
  options: FounderOsSandboxOptions = {},
): Readonly<FounderOsSandboxRun> {
  const input = cloneAndFreeze(request) as Readonly<FounderOsLabRequest>;
  const inputFingerprint = fingerprint(input);
  const trustBoundary = evaluateUntrustedArtifactBoundary(input.untrustedArtifacts ?? []);
  const sandbox = {
    id: `founder-os-${inputFingerprint}`,
    version: FOUNDER_OS_SANDBOX_VERSION,
    deterministic: true as const,
    inputFingerprint,
    outputFingerprint: null as string | null,
    capabilities: FOUNDER_OS_SANDBOX_CAPABILITIES,
  };

  if (options.killSwitch === true) {
    return deepFreeze({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['kill_switch_active'],
      trustBoundary,
      sandbox,
      plan: null,
    } satisfies FounderOsSandboxRun);
  }

  if (
    options.expectedInputFingerprint
    && options.expectedInputFingerprint !== inputFingerprint
  ) {
    return deepFreeze({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['input_fingerprint_mismatch'],
      trustBoundary,
      sandbox,
      plan: null,
    } satisfies FounderOsSandboxRun);
  }

  if (trustBoundary.errors.length > 0) {
    return deepFreeze({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['untrusted_artifact_input_invalid'],
      trustBoundary,
      sandbox,
      plan: null,
    } satisfies FounderOsSandboxRun);
  }

  if (!trustBoundary.plannerInputAllowed) {
    const violations = [
      ...(trustBoundary.quarantinedArtifactIds.length > 0 ? ['untrusted_artifact_quarantined'] : []),
      ...(trustBoundary.excludedArtifactIds.length > 0 ? ['untrusted_artifact_excluded'] : []),
    ];
    return deepFreeze({
      status: 'quarantined',
      plannerInvoked: false,
      violations,
      trustBoundary,
      sandbox,
      plan: null,
    } satisfies FounderOsSandboxRun);
  }

  // External artifact text is deliberately not forwarded to the deterministic
  // planner. Future model adapters must recompile allowed artifacts through the
  // untrusted-reference renderer rather than treating retrieved text as authority.
  const { untrustedArtifacts: _untrustedArtifacts, ...plannerRequest } = input;
  const before = stableStringify(plannerRequest);
  let rawPlan: FounderOsLabPlan;
  try {
    rawPlan = planFounderOsLab(plannerRequest as FounderOsLabRequest);
  } catch {
    return deepFreeze({
      status: 'blocked',
      plannerInvoked: true,
      violations: ['planner_input_rejected'],
      trustBoundary,
      sandbox,
      plan: null,
    } satisfies FounderOsSandboxRun);
  }
  const after = stableStringify(plannerRequest);
  const plan = cloneAndFreeze(rawPlan) as Readonly<FounderOsLabPlan>;
  const violations = [
    ...(before === after ? [] : ['sandbox_input_mutated']),
    ...inspectFounderOsSandboxPlan(rawPlan),
  ];

  return deepFreeze({
    status: violations.length > 0 ? 'quarantined' : 'simulated',
    plannerInvoked: true,
    violations: [...new Set(violations)],
    trustBoundary,
    sandbox: {
      ...sandbox,
      outputFingerprint: fingerprint(plan),
    },
    plan,
  } satisfies FounderOsSandboxRun);
}
