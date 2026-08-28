import { createHash } from 'node:crypto';

export const ATTACK20_IDS = [
  'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10',
  'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20',
] as const;

export type Attack20Id = (typeof ATTACK20_IDS)[number];

export type Attack20Layer =
  | 'NETWORK_INGRESS'
  | 'IDENTITY'
  | 'APPLICATION_DATA'
  | 'AUTHORITY_EXECUTION'
  | 'RUNTIME_TRUTH'
  | 'FRESHNESS';

export type FingerprintClass =
  | 'sourceSha'
  | 'runtime'
  | 'ingress'
  | 'routes'
  | 'access'
  | 'waf'
  | 'rateLimit'
  | 'schema'
  | 'bindings'
  | 'rls'
  | 'authority'
  | 'provider'
  | 'fixture'
  | 'evidenceBundle';

export type CookieContextType =
  | 'founder-session'
  | 'builder-run'
  | 'verification-run'
  | 'provider-run'
  | 'exception-review';

export type AttackApplicabilityState =
  | 'PASS_REQUIRED'
  | 'NOT_APPLICABLE'
  | 'BLOCKED_BY_DISCOVERY';

export type AttackVerdict = 'PASS' | 'FAILED' | 'UNVERIFIED' | 'NOT_APPLICABLE';
export type AggregateSecurityState = 'PASS' | 'FAILED' | 'UNVERIFIED';

export interface ProofCookieContract {
  cookieId: string;
  contextType: CookieContextType;
  owner: string;
  createdAt: string;
  expiresAt: string | null;
  parentCookieId: string | null;
  revokedAt?: string | null;
}

export interface ProofBinding {
  fingerprints: Partial<Record<FingerprintClass, string>>;
  cookieContract: ProofCookieContract;
}

export interface AttackDefinition {
  id: Attack20Id;
  layer: Attack20Layer;
  name: string;
}

export const ATTACK20_DEFINITIONS: readonly AttackDefinition[] = [
  { id: 'A01', layer: 'NETWORK_INGRESS', name: 'unknown-route-enumeration' },
  { id: 'A02', layer: 'NETWORK_INGRESS', name: 'method-confusion' },
  { id: 'A03', layer: 'NETWORK_INGRESS', name: 'payload-abuse' },
  { id: 'A04', layer: 'NETWORK_INGRESS', name: 'schema-enforcement' },
  { id: 'A05', layer: 'NETWORK_INGRESS', name: 'rate-resource-pressure' },
  { id: 'A06', layer: 'NETWORK_INGRESS', name: 'bot-scanner-protocol-anomaly' },
  { id: 'A07', layer: 'NETWORK_INGRESS', name: 'alternate-ingress-bypass' },
  { id: 'A08', layer: 'IDENTITY', name: 'invalid-user-credential' },
  { id: 'A09', layer: 'IDENTITY', name: 'invalid-service-identity' },
  { id: 'A10', layer: 'APPLICATION_DATA', name: 'webhook-forgery-replay' },
  { id: 'A11', layer: 'APPLICATION_DATA', name: 'bola' },
  { id: 'A12', layer: 'APPLICATION_DATA', name: 'bopla-mass-assignment' },
  { id: 'A13', layer: 'APPLICATION_DATA', name: 'business-flow-abuse' },
  { id: 'A14', layer: 'APPLICATION_DATA', name: 'supabase-rls-bypass' },
  { id: 'A15', layer: 'AUTHORITY_EXECUTION', name: 'self-approval-scope-escalation' },
  { id: 'A16', layer: 'AUTHORITY_EXECUTION', name: 'stale-authority-replay' },
  { id: 'A17', layer: 'AUTHORITY_EXECUTION', name: 'duplicate-reordered-execution' },
  { id: 'A18', layer: 'RUNTIME_TRUTH', name: 'provider-runtime-false-success' },
  { id: 'A19', layer: 'RUNTIME_TRUTH', name: 'observability-failure' },
  { id: 'A20', layer: 'FRESHNESS', name: 'dependency-fingerprint-freshness' },
] as const;

export const ATTACK20_DEPENDENCIES: Readonly<Record<Attack20Id, readonly FingerprintClass[]>> = Object.freeze({
  A01: ['runtime', 'ingress', 'routes'],
  A02: ['runtime', 'routes'],
  A03: ['runtime', 'routes', 'waf'],
  A04: ['runtime', 'routes', 'schema', 'waf'],
  A05: ['runtime', 'waf', 'rateLimit'],
  A06: ['runtime', 'waf'],
  A07: ['runtime', 'ingress', 'routes', 'access', 'bindings'],
  A08: ['runtime', 'routes', 'access'],
  A09: ['runtime', 'access', 'bindings'],
  A10: ['runtime', 'routes', 'provider'],
  A11: ['runtime', 'routes', 'rls'],
  A12: ['runtime', 'routes', 'rls'],
  A13: ['runtime', 'routes', 'authority'],
  A14: ['runtime', 'routes', 'rls'],
  A15: ['runtime', 'authority'],
  A16: ['runtime', 'authority', 'provider'],
  A17: ['runtime', 'authority', 'provider'],
  A18: ['runtime', 'provider'],
  A19: ['runtime', 'provider', 'evidenceBundle'],
  A20: ['sourceSha', 'runtime', 'ingress', 'routes', 'access', 'waf', 'rateLimit', 'schema', 'bindings', 'rls', 'authority', 'provider'],
});

export const REQUIRED_FCR_PRODUCTION_WORKERS = [
  'founder-control-room',
  'founder-control-room-review-email',
  'founder-control-room-deletion-queue',
] as const;

export type CapabilityValue = boolean | 'unknown';

export interface WorkerAttackCapabilities {
  publicHttp: CapabilityValue;
  authenticatedUser: CapabilityValue;
  serviceOnlyBoundaries: CapabilityValue;
  providerWebhook: CapabilityValue;
  tenantOwnedData: CapabilityValue;
  mutableProtectedFields: CapabilityValue;
  businessStateMachine: CapabilityValue;
  supabaseData: CapabilityValue;
  consequentialActions: CapabilityValue;
  providerMutation: CapabilityValue;
  runtimeOutcomeClaims: CapabilityValue;
  schemaGoverned?: CapabilityValue;
}

export interface WorkerApplicabilityInput {
  project: string;
  worker: string;
  environment: 'production' | 'staging' | 'preview' | 'development';
  capabilities: WorkerAttackCapabilities;
  capabilityAbsenceEvidence?: Partial<Record<Attack20Id, readonly string[]>>;
}

export interface AttackApplicabilityDecision {
  attackId: Attack20Id;
  decision: AttackApplicabilityState;
  rationale: string;
  capabilityAbsenceEvidence: readonly string[];
  proofBinding: ProofBinding;
}

export interface Attack20ReceiptV3 {
  receiptId: string;
  runId: string;
  attackId: Attack20Id;
  suiteVersion: 'attack-20-v3';
  target: {
    project: string;
    worker: string;
    environment: 'production' | 'staging' | 'preview';
    hostname: string | null;
    route: string | null;
    ingressSurface: string;
  };
  test: {
    fixtureId: string;
    requestFingerprint: string;
    expectedOutcome: 'PASS' | 'BLOCK' | 'CHALLENGE' | 'THROTTLE' | 'DENY' | 'UNKNOWN';
    observedOutcome: 'PASS' | 'BLOCK' | 'CHALLENGE' | 'THROTTLE' | 'DENY' | 'FAILED' | 'UNKNOWN';
    statusCode: number | null;
    sideEffectObserved: boolean | 'unknown';
    applicationReached: boolean | 'unknown';
    executedAt: string;
  };
  evidence: {
    cloudflareRayId: string | null;
    edgeRuleIds: readonly string[];
    accessPolicyIds: readonly string[];
    applicationEventIds: readonly string[];
    authorityReceiptIds: readonly string[];
    providerActionIds: readonly string[];
    runtimeReadbackIds: readonly string[];
  };
  dependsOn: readonly FingerprintClass[];
  proofBinding: ProofBinding;
  verdict: Exclude<AttackVerdict, 'NOT_APPLICABLE'>;
  reason: string | null;
  expiresAt: string | null;
}

export interface FreshnessDecision {
  receiptId: string;
  verdict: 'FRESH' | 'STALE' | 'UNVERIFIED';
  invalidatedBy: readonly (FingerprintClass | CookieContextType)[];
  reason: string | null;
}

export interface WorkerPortfolioSecurityState {
  worker: string;
  environment: 'production';
  state: AggregateSecurityState;
}

function isIsoDate(value: string | null | undefined): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sortNormalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortNormalized);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortNormalized(child)]),
    );
  }
  return value;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value) => right.includes(value))
    && right.every((value) => left.includes(value));
}

function sameTarget(receipt: Attack20ReceiptV3, target: WorkerApplicabilityInput): boolean {
  return target.environment !== 'development'
    && receipt.target.project === target.project
    && receipt.target.worker === target.worker
    && receipt.target.environment === target.environment;
}

function evidenceReferenceCount(receipt: Attack20ReceiptV3): number {
  return (receipt.evidence.cloudflareRayId ? 1 : 0)
    + receipt.evidence.edgeRuleIds.length
    + receipt.evidence.accessPolicyIds.length
    + receipt.evidence.applicationEventIds.length
    + receipt.evidence.authorityReceiptIds.length
    + receipt.evidence.providerActionIds.length
    + receipt.evidence.runtimeReadbackIds.length;
}

export function fingerprintNormalized(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortNormalized(value))).digest('hex');
}

export function validateProofCookieContract(cookie: ProofCookieContract, now = new Date()): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(cookie.cookieId)) errors.push('proof cookieId must be opaque and 16-128 URL-safe characters');
  if (!cookie.owner.trim()) errors.push('proof cookie owner is required');
  if (!isIsoDate(cookie.createdAt)) errors.push('proof cookie createdAt must be an ISO timestamp');
  if (cookie.expiresAt !== null && !isIsoDate(cookie.expiresAt)) errors.push('proof cookie expiresAt must be null or an ISO timestamp');
  if (cookie.revokedAt != null && !isIsoDate(cookie.revokedAt)) errors.push('proof cookie revokedAt must be null or an ISO timestamp');
  if (cookie.parentCookieId === cookie.cookieId) errors.push('proof cookie cannot be its own parent');

  const nowMs = now.getTime();
  if (isIsoDate(cookie.createdAt) && Date.parse(cookie.createdAt) > nowMs) errors.push('proof cookie cannot be created in the future');
  if (isIsoDate(cookie.expiresAt) && Date.parse(cookie.expiresAt!) <= nowMs) errors.push('proof cookie is expired');
  if (isIsoDate(cookie.revokedAt) && Date.parse(cookie.revokedAt!) <= nowMs) errors.push('proof cookie is revoked');
  return errors;
}

export function validateProofBinding(
  binding: ProofBinding,
  requiredFingerprints: readonly FingerprintClass[] = [],
  now = new Date(),
): string[] {
  const errors = validateProofCookieContract(binding.cookieContract, now);
  for (const fingerprintClass of requiredFingerprints) {
    const value = binding.fingerprints[fingerprintClass];
    if (typeof value !== 'string' || value.length < 16) {
      errors.push(`missing or invalid ${fingerprintClass} fingerprint`);
    }
  }
  return errors;
}

function evidenceFor(input: WorkerApplicabilityInput, attackId: Attack20Id): readonly string[] {
  return input.capabilityAbsenceEvidence?.[attackId] ?? [];
}

function capabilityDecision(
  attackId: Attack20Id,
  value: CapabilityValue,
  positiveRationale: string,
  input: WorkerApplicabilityInput,
  proofBinding: ProofBinding,
): AttackApplicabilityDecision {
  if (value === true) {
    return {
      attackId,
      decision: 'PASS_REQUIRED',
      rationale: positiveRationale,
      capabilityAbsenceEvidence: [],
      proofBinding,
    };
  }

  const absenceEvidence = evidenceFor(input, attackId);
  if (value === false && absenceEvidence.length > 0) {
    return {
      attackId,
      decision: 'NOT_APPLICABLE',
      rationale: `Capability is declared absent for ${input.worker}.`,
      capabilityAbsenceEvidence: absenceEvidence,
      proofBinding,
    };
  }

  return {
    attackId,
    decision: 'BLOCKED_BY_DISCOVERY',
    rationale: value === 'unknown'
      ? `Capability state is unknown for ${input.worker}.`
      : `Capability is declared absent but lacks capability-absence evidence for ${input.worker}.`,
    capabilityAbsenceEvidence: absenceEvidence,
    proofBinding,
  };
}

function anyCapability(...values: CapabilityValue[]): CapabilityValue {
  if (values.some((value) => value === true)) return true;
  if (values.some((value) => value === 'unknown')) return 'unknown';
  return false;
}

export function generateAttack20ApplicabilityPlan(
  input: WorkerApplicabilityInput,
  proofBinding: ProofBinding,
): AttackApplicabilityDecision[] {
  const c = input.capabilities;
  const networkSurface = anyCapability(c.publicHttp, c.serviceOnlyBoundaries, c.providerWebhook);
  const schemaGoverned = c.schemaGoverned ?? c.publicHttp;

  const plan: AttackApplicabilityDecision[] = [
    capabilityDecision('A01', c.publicHttp, 'Public HTTP ingress requires unknown-route enumeration proof.', input, proofBinding),
    capabilityDecision('A02', networkSurface, 'Any callable network/service surface requires method or operation-discipline proof.', input, proofBinding),
    capabilityDecision('A03', networkSurface, 'Any callable network/service surface requires bounded payload/resource proof.', input, proofBinding),
    capabilityDecision('A04', schemaGoverned, 'Schema-governed ingress requires enforcement proof, not detection-only evidence.', input, proofBinding),
    capabilityDecision('A05', c.publicHttp, 'Public HTTP ingress requires rate/resource-pressure proof.', input, proofBinding),
    capabilityDecision('A06', c.publicHttp, 'Public HTTP ingress requires bot/scanner/protocol-anomaly proof.', input, proofBinding),
    capabilityDecision('A07', true, 'Every production Worker must prove alternate ingress is disabled or equally protected.', input, proofBinding),
    capabilityDecision('A08', c.authenticatedUser, 'User-authenticated ingress requires degraded/invalid credential denial proof.', input, proofBinding),
    capabilityDecision('A09', c.serviceOnlyBoundaries, 'Service-only boundaries require service-identity denial proof.', input, proofBinding),
    capabilityDecision('A10', c.providerWebhook, 'Provider webhook ingress requires authenticity, freshness, and replay proof.', input, proofBinding),
    capabilityDecision('A11', c.tenantOwnedData, 'Tenant/object data requires BOLA isolation proof.', input, proofBinding),
    capabilityDecision('A12', c.mutableProtectedFields, 'Mutable protected fields require property-level authorization proof.', input, proofBinding),
    capabilityDecision('A13', c.businessStateMachine, 'Stateful business flow requires illegal-transition abuse proof.', input, proofBinding),
    capabilityDecision('A14', c.supabaseData, 'Supabase-backed data requires RLS/grant boundary proof.', input, proofBinding),
    capabilityDecision('A15', c.consequentialActions, 'Consequential actions require independent authority proof.', input, proofBinding),
    capabilityDecision('A16', c.consequentialActions, 'Consequential actions require stale/scope/content/lease replay denial proof.', input, proofBinding),
    capabilityDecision('A17', anyCapability(c.consequentialActions, c.providerMutation, c.providerWebhook), 'Mutating or event-driven execution requires idempotency/reordering proof.', input, proofBinding),
    capabilityDecision('A18', anyCapability(c.providerMutation, c.runtimeOutcomeClaims), 'Provider/runtime success claims require independent readback proof.', input, proofBinding),
    capabilityDecision('A19', true, 'Every production Worker requires an independent observability witness for security-relevant claims.', input, proofBinding),
    capabilityDecision('A20', true, 'Every production Worker requires dependency-aware freshness invalidation.', input, proofBinding),
  ];

  if (plan.length !== ATTACK20_IDS.length || new Set(plan.map((item) => item.attackId)).size !== ATTACK20_IDS.length) {
    throw new Error('Attack-20 applicability plan must emit exactly one decision for A01-A20.');
  }
  return plan;
}

const ALLOWED_PARENT_CONTEXTS: Readonly<Record<CookieContextType, readonly CookieContextType[]>> = Object.freeze({
  'founder-session': [],
  'builder-run': ['founder-session'],
  'verification-run': ['builder-run', 'verification-run'],
  'provider-run': ['verification-run'],
  'exception-review': ['founder-session'],
});

export function validateCookieLineage(
  cookie: ProofCookieContract,
  cookieIndex: ReadonlyMap<string, ProofCookieContract>,
  now = new Date(),
): string[] {
  const errors = validateProofCookieContract(cookie, now);
  const seen = new Set<string>([cookie.cookieId]);
  let current = cookie;

  if (current.contextType === 'founder-session' && current.parentCookieId !== null) {
    errors.push('founder-session proof cookie must be a lineage root');
  }
  if (current.contextType !== 'founder-session' && current.parentCookieId === null) {
    errors.push(`${current.contextType} proof cookie requires a parent proof cookie`);
  }

  while (current.parentCookieId) {
    const parent = cookieIndex.get(current.parentCookieId);
    if (!parent) {
      errors.push(`unknown parent proof cookie: ${current.parentCookieId}`);
      break;
    }
    if (seen.has(parent.cookieId)) {
      errors.push('proof cookie lineage contains a cycle');
      break;
    }
    seen.add(parent.cookieId);
    errors.push(...validateProofCookieContract(parent, now));
    if (!ALLOWED_PARENT_CONTEXTS[current.contextType].includes(parent.contextType)) {
      errors.push(`invalid proof cookie lineage transition: ${parent.contextType} -> ${current.contextType}`);
    }
    if (isIsoDate(parent.createdAt) && isIsoDate(current.createdAt) && Date.parse(parent.createdAt) > Date.parse(current.createdAt)) {
      errors.push('parent proof cookie cannot be newer than child proof cookie');
    }
    current = parent;
  }

  if (current.contextType !== 'founder-session') {
    errors.push('proof cookie lineage must terminate at a founder-session root');
  }
  return [...new Set(errors)];
}

export function validateAttack20Receipt(
  receipt: Attack20ReceiptV3,
  expectedTarget: WorkerApplicabilityInput,
  now = new Date(),
): string[] {
  const errors: string[] = [];
  if (!receipt.receiptId.trim()) errors.push('receiptId is required');
  if (!receipt.runId.trim()) errors.push('runId is required');
  if (receipt.suiteVersion !== 'attack-20-v3') errors.push('receipt suiteVersion must be attack-20-v3');
  if (!sameTarget(receipt, expectedTarget)) errors.push('receipt target does not match the Worker under evaluation');
  if (!receipt.test.fixtureId.trim()) errors.push('receipt fixtureId is required');
  if (receipt.test.requestFingerprint.length < 16) errors.push('receipt request fingerprint is missing or invalid');
  if (!receipt.target.ingressSurface.trim()) errors.push('receipt ingress surface is required');
  if (!isIsoDate(receipt.test.executedAt)) {
    errors.push('receipt executedAt must be an ISO timestamp');
  } else if (Date.parse(receipt.test.executedAt) > now.getTime()) {
    errors.push('receipt executedAt cannot be in the future');
  }

  const canonicalDependencies = ATTACK20_DEPENDENCIES[receipt.attackId];
  if (!sameStringSet(receipt.dependsOn, canonicalDependencies)) {
    errors.push(`receipt dependency set does not match canonical ${receipt.attackId} dependencies`);
  }

  if (receipt.verdict === 'PASS') {
    if (receipt.test.expectedOutcome === 'UNKNOWN' || receipt.test.observedOutcome !== receipt.test.expectedOutcome) {
      errors.push('PASS receipt observed outcome does not match its expected defensive outcome');
    }
    if (receipt.test.sideEffectObserved !== false) {
      errors.push('PASS receipt must prove no prohibited side effect was observed');
    }
    if (evidenceReferenceCount(receipt) === 0) {
      errors.push('PASS receipt requires at least one correlated evidence reference');
    }
    if (receipt.attackId === 'A19' && receipt.evidence.runtimeReadbackIds.length === 0) {
      errors.push('A19 PASS requires an independent runtime readback witness');
    }
  }

  if (receipt.verdict === 'FAILED' && !receipt.reason?.trim()) {
    errors.push('FAILED receipt requires a reason');
  }
  return errors;
}

export function evaluateReceiptFreshness(
  receipt: Attack20ReceiptV3,
  currentFingerprints: Partial<Record<FingerprintClass, string>>,
  cookieIndex: ReadonlyMap<string, ProofCookieContract>,
  now = new Date(),
): FreshnessDecision {
  const invalidatedBy: (FingerprintClass | CookieContextType)[] = [];
  const reasons: string[] = [];
  const canonicalDependencies = ATTACK20_DEPENDENCIES[receipt.attackId];

  if (!sameStringSet(receipt.dependsOn, canonicalDependencies)) {
    reasons.push(`receipt dependency set does not match canonical ${receipt.attackId} dependencies`);
  }
  if (receipt.expiresAt !== null && (!isIsoDate(receipt.expiresAt) || Date.parse(receipt.expiresAt) <= now.getTime())) {
    reasons.push('receipt expired');
  }

  const lineageErrors = validateCookieLineage(receipt.proofBinding.cookieContract, cookieIndex, now);
  if (lineageErrors.length > 0) {
    invalidatedBy.push(receipt.proofBinding.cookieContract.contextType);
    reasons.push(...lineageErrors);
  }

  for (const dependency of canonicalDependencies) {
    const observed = receipt.proofBinding.fingerprints[dependency];
    const current = currentFingerprints[dependency];
    if (!observed || !current) {
      invalidatedBy.push(dependency);
      reasons.push(`${dependency} fingerprint is unavailable`);
      continue;
    }
    if (observed !== current) {
      invalidatedBy.push(dependency);
      reasons.push(`${dependency} fingerprint changed`);
    }
  }

  if (reasons.length > 0) {
    return {
      receiptId: receipt.receiptId,
      verdict: 'UNVERIFIED',
      invalidatedBy: [...new Set(invalidatedBy)],
      reason: [...new Set(reasons)].join('; '),
    };
  }

  return { receiptId: receipt.receiptId, verdict: 'FRESH', invalidatedBy: [], reason: null };
}

function latestReceiptsByFixture(receipts: readonly Attack20ReceiptV3[]): Attack20ReceiptV3[] {
  const latest = new Map<string, Attack20ReceiptV3>();
  for (const receipt of receipts) {
    const key = `${receipt.test.fixtureId}\u0000${receipt.target.ingressSurface}`;
    const current = latest.get(key);
    if (!current) {
      latest.set(key, receipt);
      continue;
    }
    const currentTime = Date.parse(current.test.executedAt);
    const candidateTime = Date.parse(receipt.test.executedAt);
    if (Number.isFinite(candidateTime) && (!Number.isFinite(currentTime) || candidateTime >= currentTime)) {
      latest.set(key, receipt);
    }
  }
  return [...latest.values()];
}

export function aggregateWorkerAttack20Status(input: {
  applicabilityInput: WorkerApplicabilityInput;
  plan: readonly AttackApplicabilityDecision[];
  receipts: readonly Attack20ReceiptV3[];
  currentFingerprints: Partial<Record<FingerprintClass, string>>;
  cookieIndex: ReadonlyMap<string, ProofCookieContract>;
  now?: Date;
}): AggregateSecurityState {
  const now = input.now ?? new Date();
  const planIds = input.plan.map((item) => item.attackId);
  if (
    input.applicabilityInput.environment === 'development'
    || planIds.length !== ATTACK20_IDS.length
    || new Set(planIds).size !== ATTACK20_IDS.length
    || ATTACK20_IDS.some((id) => !planIds.includes(id))
  ) {
    return 'UNVERIFIED';
  }

  const canonicalPlan = generateAttack20ApplicabilityPlan(
    input.applicabilityInput,
    input.plan[0].proofBinding,
  );
  let sawUnverified = false;

  for (const decision of input.plan) {
    const expectedDecision = canonicalPlan.find((item) => item.attackId === decision.attackId);
    if (
      !expectedDecision
      || decision.decision !== expectedDecision.decision
      || !sameStringSet(decision.capabilityAbsenceEvidence, expectedDecision.capabilityAbsenceEvidence)
    ) {
      sawUnverified = true;
      continue;
    }

    if (decision.decision === 'BLOCKED_BY_DISCOVERY') {
      sawUnverified = true;
      continue;
    }

    if (decision.decision === 'NOT_APPLICABLE') {
      if (decision.capabilityAbsenceEvidence.length === 0 || validateProofBinding(decision.proofBinding, [], now).length > 0) {
        sawUnverified = true;
      }
      continue;
    }

    const candidates = input.receipts.filter((receipt) => receipt.attackId === decision.attackId);
    const targetCandidates = candidates.filter((receipt) => sameTarget(receipt, input.applicabilityInput));
    if (targetCandidates.length !== candidates.length) sawUnverified = true;
    if (targetCandidates.length === 0) {
      sawUnverified = true;
      continue;
    }

    const currentReceipts = latestReceiptsByFixture(targetCandidates);
    for (const receipt of currentReceipts) {
      if (validateAttack20Receipt(receipt, input.applicabilityInput, now).length > 0) {
        sawUnverified = true;
        continue;
      }

      const requiredDependencies = ATTACK20_DEPENDENCIES[decision.attackId];
      if (validateProofBinding(receipt.proofBinding, requiredDependencies, now).length > 0) {
        sawUnverified = true;
        continue;
      }

      const freshness = evaluateReceiptFreshness(receipt, input.currentFingerprints, input.cookieIndex, now);
      if (freshness.verdict !== 'FRESH') {
        sawUnverified = true;
        continue;
      }

      if (receipt.verdict === 'FAILED') return 'FAILED';
      if (receipt.verdict !== 'PASS') sawUnverified = true;
    }
  }

  return sawUnverified ? 'UNVERIFIED' : 'PASS';
}

export function aggregateSecurityStates(states: readonly WorkerPortfolioSecurityState[]): AggregateSecurityState {
  const byWorker = new Map<string, AggregateSecurityState>();
  for (const entry of states) {
    if (
      entry.environment !== 'production'
      || !REQUIRED_FCR_PRODUCTION_WORKERS.includes(entry.worker as (typeof REQUIRED_FCR_PRODUCTION_WORKERS)[number])
      || byWorker.has(entry.worker)
    ) {
      return 'UNVERIFIED';
    }
    byWorker.set(entry.worker, entry.state);
  }

  if (REQUIRED_FCR_PRODUCTION_WORKERS.some((worker) => !byWorker.has(worker))) return 'UNVERIFIED';
  const requiredStates = REQUIRED_FCR_PRODUCTION_WORKERS.map((worker) => byWorker.get(worker)!);
  if (requiredStates.some((state) => state === 'FAILED')) return 'FAILED';
  if (requiredStates.some((state) => state === 'UNVERIFIED')) return 'UNVERIFIED';
  return 'PASS';
}
