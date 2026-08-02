import type { FounderOsLabPlan, FounderOsLabRequest } from './contracts.js';
import { planFounderOsLab } from './engine.js';

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
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertJsonSafe(value: unknown, path = '$', seen = new WeakSet<object>()): void {
  if (value === null) return;

  const type = typeof value;
  if (type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number is not sandbox-safe`);
    return;
  }
  if (type !== 'object') throw new TypeError(`${path}: ${type} is not sandbox-safe`);

  const object = value as object;
  if (seen.has(object)) throw new TypeError(`${path}: circular input is not sandbox-safe`);
  seen.add(object);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path}: custom prototypes are not sandbox-safe`);
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertJsonSafe(nested, `${path}.${key}`, seen);
    }
  }
  seen.delete(object);
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
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  const input = cloneAndFreeze(request) as FounderOsLabRequest;
  const inputFingerprint = fingerprint(input);
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
      sandbox,
      plan: null,
    });
  }

  if (
    options.expectedInputFingerprint
    && options.expectedInputFingerprint !== inputFingerprint
  ) {
    return deepFreeze({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['input_fingerprint_mismatch'],
      sandbox,
      plan: null,
    });
  }

  const before = stableStringify(input);
  const rawPlan = planFounderOsLab(input);
  const after = stableStringify(input);
  const plan = cloneAndFreeze(rawPlan) as Readonly<FounderOsLabPlan>;
  const violations = [
    ...(before === after ? [] : ['sandbox_input_mutated']),
    ...inspectFounderOsSandboxPlan(rawPlan),
  ];

  return deepFreeze({
    status: violations.length > 0 ? 'quarantined' : 'simulated',
    plannerInvoked: true,
    violations: [...new Set(violations)],
    sandbox: {
      ...sandbox,
      outputFingerprint: fingerprint(plan),
    },
    plan,
  });
}
