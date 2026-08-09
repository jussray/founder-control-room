import { createHash } from 'node:crypto';

export const V10_CAPABILITY_PLAN_CONTRACT = 'juss-v10/capability-plan@v1' as const;
export const V10_CAPABILITY_REGISTRY_CONTRACT = 'juss-v10/capability-registry@v1' as const;
export const V10_CAPABILITY_SELECTOR = 'chief-ai-machine' as const;

export const V10_CAPABILITY_ORIGINS = [
  'founder-native',
  'repo-native',
  'generated',
  'provider',
  'community',
  'vendor',
] as const;

export const V10_CAPABILITY_AUTHORITY_LEVELS = [
  'reason',
  'draft',
  'reversible',
  'privileged',
] as const;

export type V10CapabilityOrigin = (typeof V10_CAPABILITY_ORIGINS)[number];
export type V10CapabilityAuthority = (typeof V10_CAPABILITY_AUTHORITY_LEVELS)[number];

export interface V10CapabilityRef {
  id: string;
  version: string;
  origin: V10CapabilityOrigin;
  owner: string;
  sourceHash: string;
  authorityCeiling: V10CapabilityAuthority;
}

export interface V10CapabilityPlan {
  contract: typeof V10_CAPABILITY_PLAN_CONTRACT;
  selectedBy: typeof V10_CAPABILITY_SELECTOR;
  goal: string;
  projectSlug: string;
  expectedHeadSha: string;
  registryHash: string;
  requestedAuthority: V10CapabilityAuthority;
  strategicLenses: string[];
  routingReason: string;
  capabilities: V10CapabilityRef[];
  proofRequirements: string[];
  outcomeSignals: string[];
  rollback: string;
  planHash: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const ORIGINS = new Set<string>(V10_CAPABILITY_ORIGINS);
const AUTHORITIES = new Set<string>(V10_CAPABILITY_AUTHORITY_LEVELS);
const AUTHORITY_RANK = new Map<string, number>(
  V10_CAPABILITY_AUTHORITY_LEVELS.map((value, index) => [value, index]),
);
const ORIGIN_AUTHORITY_CEILING: Readonly<Record<V10CapabilityOrigin, V10CapabilityAuthority>> = {
  'founder-native': 'privileged',
  'repo-native': 'privileged',
  generated: 'draft',
  provider: 'draft',
  community: 'draft',
  vendor: 'draft',
};
const PLAN_FIELDS = new Set([
  'contract',
  'selectedBy',
  'goal',
  'projectSlug',
  'expectedHeadSha',
  'registryHash',
  'requestedAuthority',
  'strategicLenses',
  'routingReason',
  'capabilities',
  'proofRequirements',
  'outcomeSignals',
  'rollback',
  'planHash',
]);
const CAPABILITY_FIELDS = new Set([
  'id',
  'version',
  'origin',
  'owner',
  'sourceHash',
  'authorityCeiling',
]);

function text(value: unknown, maxLength = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isV10CapabilityRef(value: unknown): value is V10CapabilityRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const capability = value as Record<string, unknown>;
  return hasOnlyFields(capability, CAPABILITY_FIELDS)
    && typeof capability.id === 'string'
    && typeof capability.version === 'string'
    && typeof capability.origin === 'string'
    && typeof capability.owner === 'string'
    && typeof capability.sourceHash === 'string'
    && typeof capability.authorityCeiling === 'string';
}

/**
 * Runtime shape guard for capability plans crossing JSON/provider boundaries.
 * Semantic authority, hashes, provenance, and execution bindings are validated separately.
 * Unknown fields are rejected so a valid plan hash cannot authenticate an unhashed payload.
 */
export function isV10CapabilityPlan(value: unknown): value is V10CapabilityPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return hasOnlyFields(plan, PLAN_FIELDS)
    && typeof plan.contract === 'string'
    && typeof plan.selectedBy === 'string'
    && typeof plan.goal === 'string'
    && typeof plan.projectSlug === 'string'
    && typeof plan.expectedHeadSha === 'string'
    && typeof plan.registryHash === 'string'
    && typeof plan.requestedAuthority === 'string'
    && stringArray(plan.strategicLenses)
    && typeof plan.routingReason === 'string'
    && Array.isArray(plan.capabilities)
    && plan.capabilities.every(isV10CapabilityRef)
    && stringArray(plan.proofRequirements)
    && stringArray(plan.outcomeSignals)
    && typeof plan.rollback === 'string'
    && typeof plan.planHash === 'string';
}

function authorityAllows(requested: string, ceiling: string): boolean {
  const requestedRank = AUTHORITY_RANK.get(requested);
  const ceilingRank = AUTHORITY_RANK.get(ceiling);
  return requestedRank !== undefined && ceilingRank !== undefined && requestedRank <= ceilingRank;
}

function normalizedStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sortedCapabilities(values: readonly V10CapabilityRef[]): V10CapabilityRef[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

export function v10CapabilityRegistrySeed(entries: readonly V10CapabilityRef[]): string {
  return JSON.stringify([
    V10_CAPABILITY_REGISTRY_CONTRACT,
    sortedCapabilities(entries).map((capability) => [
      capability.id.trim(),
      capability.version.trim(),
      capability.origin,
      capability.owner.trim(),
      capability.sourceHash.trim().toLowerCase(),
      capability.authorityCeiling,
    ]),
  ]);
}

export function v10CapabilityRegistryHash(entries: readonly V10CapabilityRef[]): string {
  return createHash('sha256').update(v10CapabilityRegistrySeed(entries)).digest('hex');
}

export function v10CapabilityPlanSeed(plan: Omit<V10CapabilityPlan, 'planHash'> | V10CapabilityPlan): string {
  return JSON.stringify([
    plan.contract,
    plan.selectedBy,
    plan.goal.trim(),
    plan.projectSlug.trim(),
    plan.expectedHeadSha.trim().toLowerCase(),
    plan.registryHash.trim().toLowerCase(),
    plan.requestedAuthority,
    normalizedStrings(plan.strategicLenses),
    plan.routingReason.trim(),
    sortedCapabilities(plan.capabilities).map((capability) => [
      capability.id.trim(),
      capability.version.trim(),
      capability.origin,
      capability.owner.trim(),
      capability.sourceHash.trim().toLowerCase(),
      capability.authorityCeiling,
    ]),
    normalizedStrings(plan.proofRequirements),
    normalizedStrings(plan.outcomeSignals),
    plan.rollback.trim(),
  ]);
}

export function v10CapabilityPlanHash(plan: Omit<V10CapabilityPlan, 'planHash'> | V10CapabilityPlan): string {
  return createHash('sha256').update(v10CapabilityPlanSeed(plan)).digest('hex');
}

export function validateV10CapabilityPlan(plan: V10CapabilityPlan): string[] {
  if (!isV10CapabilityPlan(plan)) return ['capability plan shape is invalid'];

  const errors: string[] = [];

  if (plan.contract !== V10_CAPABILITY_PLAN_CONTRACT) errors.push('unsupported capability plan contract');
  if (plan.selectedBy !== V10_CAPABILITY_SELECTOR) errors.push('capability selection must be owned by Chief AI Machine');
  if (!text(plan.goal)) errors.push('capability plan goal is required');
  if (!text(plan.projectSlug, 160)) errors.push('capability plan projectSlug is required');
  if (!FULL_SHA.test(text(plan.expectedHeadSha, 40))) errors.push('capability plan expectedHeadSha must be a full Git SHA');
  if (!HASH.test(text(plan.registryHash, 64))) errors.push('capability plan registryHash must be sha256');
  if (!AUTHORITIES.has(plan.requestedAuthority)) errors.push('unsupported requested authority');
  if (!text(plan.routingReason)) errors.push('capability plan routing reason is required');
  if (!text(plan.rollback)) errors.push('capability plan rollback is required');
  if (normalizedStrings(plan.strategicLenses).length === 0) errors.push('capability plan strategic lenses are required');
  if (normalizedStrings(plan.proofRequirements).length === 0) errors.push('capability plan proof requirements are required');
  if (normalizedStrings(plan.outcomeSignals).length === 0) errors.push('capability plan outcome signals are required');
  if (plan.strategicLenses.some((value) => !value.trim())) errors.push('capability plan strategic lenses cannot contain blank values');
  if (plan.proofRequirements.some((value) => !value.trim())) errors.push('capability plan proof requirements cannot contain blank values');
  if (plan.outcomeSignals.some((value) => !value.trim())) errors.push('capability plan outcome signals cannot contain blank values');

  if (plan.capabilities.length === 0) {
    errors.push('capability plan requires at least one capability');
  } else if (plan.capabilities.length > 30) {
    errors.push('capability plan exceeds the capability limit');
  } else {
    const ids = new Set<string>();
    for (const capability of plan.capabilities) {
      if (!text(capability.id, 160)) errors.push('capability id is required');
      if (!text(capability.version, 80)) errors.push(`capability ${capability.id || '<unknown>'} version is required`);
      if (!ORIGINS.has(capability.origin)) errors.push(`capability ${capability.id || '<unknown>'} has unsupported origin`);
      if (!text(capability.owner, 160)) errors.push(`capability ${capability.id || '<unknown>'} owner is required`);
      if (!HASH.test(text(capability.sourceHash, 64))) errors.push(`capability ${capability.id || '<unknown>'} sourceHash must be sha256`);
      if (!AUTHORITIES.has(capability.authorityCeiling)) errors.push(`capability ${capability.id || '<unknown>'} has unsupported authority ceiling`);

      if (ids.has(capability.id)) errors.push(`duplicate capability id: ${capability.id}`);
      ids.add(capability.id);

      if (ORIGINS.has(capability.origin) && AUTHORITIES.has(capability.authorityCeiling)) {
        const originCeiling = ORIGIN_AUTHORITY_CEILING[capability.origin];
        if (!authorityAllows(capability.authorityCeiling, originCeiling)) {
          errors.push(`capability ${capability.id} authority exceeds its ${capability.origin} origin ceiling`);
        }
      }

      if (AUTHORITIES.has(plan.requestedAuthority) && AUTHORITIES.has(capability.authorityCeiling)) {
        if (!authorityAllows(plan.requestedAuthority, capability.authorityCeiling)) {
          errors.push(`capability ${capability.id} cannot satisfy requested authority ${plan.requestedAuthority}`);
        }
      }
    }
  }

  if (!HASH.test(text(plan.planHash, 64))) {
    errors.push('capability plan hash must be sha256');
  } else if (v10CapabilityPlanHash(plan) !== plan.planHash.toLowerCase()) {
    errors.push('capability plan hash does not match plan content');
  }

  return errors;
}

export function validateV10CapabilityPlanContext(
  plan: V10CapabilityPlan,
  context: { goal: string; projectSlug: string; expectedHeadSha: string },
): string[] {
  const errors = validateV10CapabilityPlan(plan);
  if (!isV10CapabilityPlan(plan)) return errors;
  if (plan.goal.trim() !== context.goal.trim()) errors.push('capability plan goal does not match execution goal');
  if (plan.projectSlug.trim() !== context.projectSlug.trim()) errors.push('capability plan project does not match execution project');
  if (plan.expectedHeadSha.toLowerCase() !== context.expectedHeadSha.trim().toLowerCase()) {
    errors.push('capability plan head does not match execution head');
  }
  return errors;
}
