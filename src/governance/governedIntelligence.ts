export type IntentSource =
  | 'current_user'
  | 'delegated'
  | 'historical_user'
  | 'future_you'
  | 'inferred';

export type MemorySource = IntentSource | 'system_observation' | 'provider_evidence';
export type MemoryKind = 'preference' | 'goal' | 'fact' | 'runtime_state';
export type ActionRisk = 'observe' | 'reversible' | 'consequential' | 'irreversible';
export type MemoryStatus = 'candidate' | 'trusted' | 'verified' | 'stale' | 'disputed' | 'superseded' | 'forgotten';
export type RecoveryLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type GovernedDecision = 'allow' | 'reconfirm' | 'deny';

export interface TemporalIntent {
  id: string;
  source: IntentSource;
  scope: string[];
  intentHash: string;
  issuedAt: string;
  authenticated: boolean;
  expiresAt?: string | null;
  revokedAt?: string | null;
  supersedes?: string[];
}

export interface GovernedMemory {
  id: string;
  kind: MemoryKind;
  factHash: string;
  ownerId: string;
  source: MemorySource;
  status: MemoryStatus;
  observedAt: string;
  authenticated: boolean;
  lastVerifiedAt?: string | null;
  expiresAt?: string | null;
  supersedes?: string[];
  contradictedBy?: string[];
}

export interface ProofContract {
  id: string;
  subject: string;
  proves: string[];
  doesNotProve: string[];
  artifactHash: string;
  verificationMethod: string;
  observedAt: string;
  environment?: string | null;
  exactVersion?: string | null;
  expiresAt?: string | null;
  freshForMs?: number | null;
}

export interface RecoveryPlan {
  id: string;
  level: RecoveryLevel;
  checkpointRef?: string | null;
  rollbackAction?: string | null;
  validationAction?: string | null;
  rehearsedAt?: string | null;
}

export interface ExecutionAuthorization {
  id: string;
  actorId: string;
  source: 'current_user' | 'delegated';
  intentId: string;
  proposalId: string;
  proposalHash: string;
  actionHash: string;
  scope: string[];
  exactVersion?: string | null;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  authenticated: boolean;
}

export interface GovernedActionRequest {
  requiredScope: string;
  risk: ActionRisk;
  intents: TemporalIntent[];
  memories?: GovernedMemory[];
  requiredMemoryIds?: string[];
  proofs?: ProofContract[];
  requiredClaims?: Array<{
    claim: string;
    exactVersion?: string | null;
    maxAgeMs?: number | null;
  }>;
  recoveryPlan?: RecoveryPlan | null;
  proposalId?: string | null;
  proposalHash?: string | null;
  actionHash?: string | null;
  exactVersion?: string | null;
  authorization?: ExecutionAuthorization | null;
  consumedAuthorizationIds?: string[];
  hardConstraintViolations?: string[];
  now?: Date;
}

export interface DecisionLineage {
  evaluatedAt: string;
  intentId: string | null;
  memoryIds: string[];
  proofIds: string[];
  recoveryPlanId: string | null;
  authorizationId: string | null;
  proposalId: string | null;
  proposalHash: string | null;
  actionHash: string | null;
  exactVersion: string | null;
}

export interface GovernedActionVerdict {
  decision: GovernedDecision;
  reasons: string[];
  selectedIntent: TemporalIntent | null;
  lineage: DecisionLineage;
}

export interface MemoryAdjudication {
  decision: 'accept' | 'supersede' | 'preserve_existing' | 'dispute';
  winnerId: string | null;
  loserId: string | null;
  reason: string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const SHA256 = /^[a-f0-9]{64}$/i;

const INTENT_RANK: Record<IntentSource, number> = {
  current_user: 5,
  delegated: 4,
  historical_user: 3,
  future_you: 2,
  inferred: 1,
};

const RECOVERY_RANK: Record<RecoveryLevel, number> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalTimeIsMalformed(value?: string | null): boolean {
  return value !== undefined && value !== null && parseTime(value) === null;
}

function isFutureBeyondSkew(value: string, now: Date): boolean {
  const parsed = parseTime(value);
  return parsed !== null && parsed > now.getTime() + FIVE_MINUTES_MS;
}

function scopeMatches(scope: string[], requiredScope: string): boolean {
  return scope.includes('*') || scope.includes(requiredScope);
}

function sourceRequiresAuthentication(source: MemorySource): boolean {
  return source === 'current_user'
    || source === 'delegated'
    || source === 'system_observation'
    || source === 'provider_evidence';
}

function isAuthorityBearingIntent(intent: TemporalIntent): boolean {
  return (intent.source === 'current_user' || intent.source === 'delegated') && intent.authenticated;
}

function memorySourceRank(memory: GovernedMemory): number {
  if (sourceRequiresAuthentication(memory.source) && !memory.authenticated) return 0;

  if (memory.kind === 'preference' || memory.kind === 'goal') {
    switch (memory.source) {
      case 'current_user': return 60;
      case 'delegated': return 50;
      case 'historical_user': return 35;
      case 'future_you': return 20;
      case 'inferred': return 10;
      case 'system_observation': return 5;
      case 'provider_evidence': return 5;
    }
  }

  switch (memory.source) {
    case 'provider_evidence': return 60;
    case 'system_observation': return 55;
    case 'current_user': return 40;
    case 'delegated': return 35;
    case 'historical_user': return 25;
    case 'future_you': return 15;
    case 'inferred': return 10;
  }
}

function activeIntent(intent: TemporalIntent, now: Date, requiredScope: string): boolean {
  const issuedAt = parseTime(intent.issuedAt);
  if (issuedAt === null || isFutureBeyondSkew(intent.issuedAt, now)) return false;
  if (!scopeMatches(intent.scope, requiredScope)) return false;
  if (optionalTimeIsMalformed(intent.revokedAt) || optionalTimeIsMalformed(intent.expiresAt)) return false;

  const revokedAt = parseTime(intent.revokedAt);
  if (revokedAt !== null && revokedAt <= now.getTime()) return false;
  const expiresAt = parseTime(intent.expiresAt);
  if (expiresAt !== null && expiresAt <= now.getTime()) return false;
  if ((intent.source === 'current_user' || intent.source === 'delegated') && !intent.authenticated) return false;
  return true;
}

function canSupersedeIntent(superseder: TemporalIntent, target: TemporalIntent): boolean {
  if (!isAuthorityBearingIntent(superseder)) return false;
  return INTENT_RANK[superseder.source] >= INTENT_RANK[target.source];
}

export function resolveTemporalIntent(
  intents: TemporalIntent[],
  requiredScope: string,
  now: Date = new Date(),
): { selected: TemporalIntent | null; mode: 'authoritative' | 'advisory' | 'missing' | 'conflict'; reasons: string[] } {
  const active = intents.filter((intent) => activeIntent(intent, now, requiredScope));
  const byId = new Map(active.map((intent) => [intent.id, intent]));
  const superseded = new Set<string>();

  for (const superseder of active) {
    for (const targetId of superseder.supersedes ?? []) {
      const target = byId.get(targetId);
      if (target && canSupersedeIntent(superseder, target)) superseded.add(targetId);
    }
  }

  const effective = active.filter((intent) => !superseded.has(intent.id));
  if (effective.length === 0) {
    return { selected: null, mode: 'missing', reasons: ['No active intent covers the requested scope.'] };
  }

  const sorted = [...effective].sort((a, b) => {
    const rank = INTENT_RANK[b.source] - INTENT_RANK[a.source];
    if (rank !== 0) return rank;
    return (parseTime(b.issuedAt) ?? 0) - (parseTime(a.issuedAt) ?? 0);
  });

  const selected = sorted[0];
  const newestTime = parseTime(selected.issuedAt) ?? 0;
  const equallyCurrent = sorted.filter((intent) =>
    INTENT_RANK[intent.source] === INTENT_RANK[selected.source]
    && (parseTime(intent.issuedAt) ?? 0) === newestTime);

  if (new Set(equallyCurrent.map((intent) => intent.intentHash)).size > 1) {
    return {
      selected: null,
      mode: 'conflict',
      reasons: ['Conflicting equally current intents require explicit re-confirmation.'],
    };
  }

  if (isAuthorityBearingIntent(selected)) {
    return {
      selected,
      mode: 'authoritative',
      reasons: [`${selected.source} intent is active, authenticated, scoped, and not legitimately superseded.`],
    };
  }

  return {
    selected,
    mode: 'advisory',
    reasons: [`${selected.source} context may inform the action but cannot silently authorize it.`],
  };
}

function memoryObservationIsValid(memory: GovernedMemory, now: Date): boolean {
  const observedAt = parseTime(memory.observedAt);
  if (observedAt === null || isFutureBeyondSkew(memory.observedAt, now)) return false;
  if (optionalTimeIsMalformed(memory.lastVerifiedAt) || optionalTimeIsMalformed(memory.expiresAt)) return false;
  if (sourceRequiresAuthentication(memory.source) && !memory.authenticated) return false;
  return true;
}

export function adjudicateMemoryWrite(
  existing: GovernedMemory | null,
  incoming: GovernedMemory,
  now: Date = new Date(),
): MemoryAdjudication {
  if (!memoryObservationIsValid(incoming, now)) {
    return {
      decision: existing ? 'preserve_existing' : 'dispute',
      winnerId: existing?.id ?? null,
      loserId: existing ? incoming.id : null,
      reason: 'Malformed, future-dated, or unauthenticated authority-bearing memory cannot become current truth.',
    };
  }
  if (!existing) {
    return { decision: 'accept', winnerId: incoming.id, loserId: null, reason: 'No existing memory competes with this write.' };
  }
  if (existing.kind !== incoming.kind) {
    return {
      decision: 'dispute',
      winnerId: null,
      loserId: null,
      reason: 'Conflicting memory kinds cannot overwrite one another automatically.',
    };
  }
  if (!memoryObservationIsValid(existing, now)) {
    return {
      decision: 'supersede',
      winnerId: incoming.id,
      loserId: existing.id,
      reason: 'A valid incoming memory supersedes an invalid existing observation while preserving lineage.',
    };
  }

  const incomingTime = parseTime(incoming.observedAt) ?? 0;
  const existingTime = parseTime(existing.observedAt) ?? 0;
  const incomingRank = memorySourceRank(incoming);
  const existingRank = memorySourceRank(existing);

  if (existing.factHash === incoming.factHash) {
    const incomingWins = incomingRank > existingRank
      || (incomingRank === existingRank && incomingTime >= existingTime);
    return {
      decision: incomingWins ? 'supersede' : 'preserve_existing',
      winnerId: incomingWins ? incoming.id : existing.id,
      loserId: incomingWins ? existing.id : incoming.id,
      reason: 'Equivalent memories preserve lineage while the stronger or newer observation becomes current.',
    };
  }

  if (incomingRank > existingRank && incomingTime >= existingTime) {
    return {
      decision: 'supersede',
      winnerId: incoming.id,
      loserId: existing.id,
      reason: incoming.kind === 'preference' || incoming.kind === 'goal'
        ? 'Higher-authority current intent supersedes lower-authority historical or projected memory.'
        : 'Higher-authority objective evidence supersedes lower-authority belief while preserving prior lineage.',
    };
  }

  if (existingRank > incomingRank) {
    if ((existing.kind === 'preference' || existing.kind === 'goal') && existing.source === 'current_user') {
      return {
        decision: 'preserve_existing',
        winnerId: existing.id,
        loserId: incoming.id,
        reason: 'Future, historical, inferred, or lower delegation context cannot overwrite authenticated Current You preference or goal.',
      };
    }
    if ((existing.kind === 'fact' || existing.kind === 'runtime_state')
      && (existing.source === 'provider_evidence' || existing.source === 'system_observation')) {
      return {
        decision: 'dispute',
        winnerId: existing.id,
        loserId: null,
        reason: 'A lower-authority conflicting assertion cannot overwrite objective evidence; the conflict requires fresh re-verification.',
      };
    }
    return {
      decision: 'preserve_existing',
      winnerId: existing.id,
      loserId: incoming.id,
      reason: 'Lower-authority conflicting memory cannot silently replace stronger current state.',
    };
  }

  return {
    decision: 'dispute',
    winnerId: null,
    loserId: null,
    reason: 'Conflicting memory lacks enough authority to resolve automatically and must remain disputed until re-verified.',
  };
}

export function memoryCanAuthorize(
  memory: GovernedMemory,
  risk: ActionRisk,
  now: Date = new Date(),
): { allowed: boolean; reason: string } {
  if (!memoryObservationIsValid(memory, now)) {
    return { allowed: false, reason: 'Memory observation or verification metadata is invalid.' };
  }
  const expiresAt = parseTime(memory.expiresAt);
  if (expiresAt !== null && expiresAt <= now.getTime()) return { allowed: false, reason: 'Memory has expired.' };
  if (['candidate', 'stale', 'disputed', 'superseded', 'forgotten'].includes(memory.status)) {
    return { allowed: false, reason: `Memory status ${memory.status} cannot authorize action.` };
  }

  if (risk !== 'observe') {
    if ((memory.kind === 'preference' || memory.kind === 'goal')
      && !['current_user', 'delegated'].includes(memory.source)) {
      return { allowed: false, reason: 'Effectful action requires current or delegated authority for preferences and goals.' };
    }
    if ((memory.kind === 'fact' || memory.kind === 'runtime_state')
      && !['provider_evidence', 'system_observation'].includes(memory.source)) {
      return { allowed: false, reason: 'Effectful action requires objective provider or system evidence for facts and runtime state.' };
    }
  }

  const verifiedAt = parseTime(memory.lastVerifiedAt ?? memory.observedAt);
  if (verifiedAt === null || verifiedAt > now.getTime() + FIVE_MINUTES_MS) {
    return { allowed: false, reason: 'Memory verification time is invalid.' };
  }

  const age = Math.max(0, now.getTime() - verifiedAt);
  if (risk === 'consequential' || risk === 'irreversible') {
    if (memory.status !== 'verified') return { allowed: false, reason: 'Consequential action requires verified memory.' };
    if (age > ONE_DAY_MS) return { allowed: false, reason: 'Consequential action requires memory re-verification within 24 hours.' };
  } else if (risk === 'reversible' && age > SEVEN_DAYS_MS) {
    return { allowed: false, reason: 'Reversible action requires memory re-verification within 7 days.' };
  }

  return { allowed: true, reason: 'Memory is sufficiently authoritative, verified, and fresh for this risk level.' };
}

export function proofSupportsClaim(
  proof: ProofContract,
  claim: string,
  now: Date = new Date(),
  exactVersion?: string | null,
  maxAgeMs?: number | null,
): { supported: boolean; reason: string } {
  if (proof.doesNotProve.includes(claim)) return { supported: false, reason: 'Proof contract explicitly excludes this claim.' };
  if (!proof.proves.includes(claim)) return { supported: false, reason: 'Proof contract does not declare support for this claim.' };
  if (!SHA256.test(proof.artifactHash)) return { supported: false, reason: 'Proof artifact hash is missing or malformed.' };

  const observedAt = parseTime(proof.observedAt);
  if (observedAt === null || observedAt > now.getTime() + FIVE_MINUTES_MS) {
    return { supported: false, reason: 'Proof observation time is invalid or future-dated.' };
  }
  if (optionalTimeIsMalformed(proof.expiresAt)) return { supported: false, reason: 'Proof expiry metadata is malformed.' };
  const expiresAt = parseTime(proof.expiresAt);
  if (expiresAt !== null && expiresAt <= now.getTime()) return { supported: false, reason: 'Proof contract has expired.' };

  const freshnessWindow = maxAgeMs ?? proof.freshForMs;
  if (freshnessWindow !== undefined && freshnessWindow !== null) {
    if (!Number.isFinite(freshnessWindow) || freshnessWindow <= 0) {
      return { supported: false, reason: 'Proof freshness window is invalid.' };
    }
    if (now.getTime() - observedAt > freshnessWindow) {
      return { supported: false, reason: 'Proof contract is outside its declared freshness window.' };
    }
  }
  if (exactVersion && proof.exactVersion !== exactVersion) {
    return { supported: false, reason: 'Proof exact version does not match the requested version.' };
  }

  return { supported: true, reason: 'Proof contract is claim-scoped, time-valid, and version-compatible.' };
}

export function recoverySatisfiesRisk(
  plan: RecoveryPlan | null | undefined,
  risk: ActionRisk,
): { allowed: boolean; reason: string } {
  if (risk === 'observe') return { allowed: true, reason: 'Read-only observation requires no rollback plan.' };
  if (!plan) return { allowed: false, reason: 'A recovery plan is required before effectful action.' };

  const requiredLevel = risk === 'reversible' ? 1 : risk === 'consequential' ? 2 : 4;
  if (RECOVERY_RANK[plan.level] < requiredLevel) {
    return { allowed: false, reason: `Recovery ${plan.level} is below the required level for ${risk} action.` };
  }
  if (!plan.rollbackAction) return { allowed: false, reason: 'Recovery plan must declare a rollback action.' };
  if ((risk === 'consequential' || risk === 'irreversible') && !plan.checkpointRef) {
    return { allowed: false, reason: 'Consequential action requires a checkpoint reference.' };
  }
  if ((risk === 'consequential' || risk === 'irreversible') && !plan.validationAction) {
    return { allowed: false, reason: 'Consequential action requires post-rollback validation.' };
  }
  return { allowed: true, reason: 'Recovery plan is sufficient for this risk level.' };
}

export function authorizationSupportsAction(
  authorization: ExecutionAuthorization,
  request: {
    requiredScope: string;
    intentId: string;
    proposalId: string;
    proposalHash: string;
    actionHash: string;
    exactVersion?: string | null;
    consumedAuthorizationIds?: string[];
    now?: Date;
  },
): { allowed: boolean; reason: string } {
  const now = request.now ?? new Date();
  if (!authorization.authenticated) return { allowed: false, reason: 'Execution authorization is not authenticated.' };
  if (!scopeMatches(authorization.scope, request.requiredScope)) return { allowed: false, reason: 'Execution authorization scope does not cover this action.' };
  if (authorization.intentId !== request.intentId) return { allowed: false, reason: 'Execution authorization is bound to a different intent.' };
  if (authorization.proposalId !== request.proposalId || authorization.proposalHash !== request.proposalHash) {
    return { allowed: false, reason: 'Execution authorization is bound to a different proposal.' };
  }
  if (authorization.actionHash !== request.actionHash) return { allowed: false, reason: 'Execution authorization is bound to a different action.' };
  if (!SHA256.test(authorization.proposalHash) || !SHA256.test(authorization.actionHash)) {
    return { allowed: false, reason: 'Execution authorization requires SHA-256 proposal and action bindings.' };
  }
  if (request.exactVersion && authorization.exactVersion !== request.exactVersion) {
    return { allowed: false, reason: 'Execution authorization is bound to a different exact version.' };
  }
  if (authorization.exactVersion && request.exactVersion !== authorization.exactVersion) {
    return { allowed: false, reason: 'Execution request omitted or changed the version bound by the authorization.' };
  }
  if (request.consumedAuthorizationIds?.includes(authorization.id)) {
    return { allowed: false, reason: 'Execution authorization has already been consumed.' };
  }
  if (optionalTimeIsMalformed(authorization.revokedAt)) return { allowed: false, reason: 'Execution authorization revocation metadata is malformed.' };

  const issuedAt = parseTime(authorization.issuedAt);
  const expiresAt = parseTime(authorization.expiresAt);
  if (issuedAt === null || expiresAt === null) return { allowed: false, reason: 'Execution authorization requires valid issue and expiry timestamps.' };
  if (issuedAt > now.getTime() + FIVE_MINUTES_MS) return { allowed: false, reason: 'Execution authorization is future-dated.' };
  if (expiresAt <= issuedAt || expiresAt - issuedAt > ONE_HOUR_MS) {
    return { allowed: false, reason: 'Execution authorization validity window must be positive and no longer than one hour.' };
  }
  if (expiresAt <= now.getTime() || now.getTime() - issuedAt > ONE_HOUR_MS) {
    return { allowed: false, reason: 'Execution authorization is stale or expired.' };
  }
  const revokedAt = parseTime(authorization.revokedAt);
  if (revokedAt !== null && revokedAt <= now.getTime()) return { allowed: false, reason: 'Execution authorization has been revoked.' };

  return { allowed: true, reason: 'Execution authorization is fresh and bound to the exact intent, proposal, action, scope, and version.' };
}

export function evaluateGovernedAction(request: GovernedActionRequest): GovernedActionVerdict {
  const now = request.now ?? new Date();
  const reasons: string[] = [];
  const requiredMemoryIds = request.requiredMemoryIds ?? [];
  const requiredClaims = request.requiredClaims ?? [];
  const proofs = request.proofs ?? [];
  const memories = request.memories ?? [];
  const hardConstraintViolations = request.hardConstraintViolations ?? [];

  const lineage: DecisionLineage = {
    evaluatedAt: now.toISOString(),
    intentId: null,
    memoryIds: [],
    proofIds: [],
    recoveryPlanId: request.recoveryPlan?.id ?? null,
    authorizationId: request.authorization?.id ?? null,
    proposalId: request.proposalId ?? null,
    proposalHash: request.proposalHash ?? null,
    actionHash: request.actionHash ?? null,
    exactVersion: request.exactVersion ?? null,
  };

  if (hardConstraintViolations.length > 0) {
    return {
      decision: 'deny',
      reasons: hardConstraintViolations.map((violation) => `Hard constraint: ${violation}`),
      selectedIntent: null,
      lineage,
    };
  }

  const intent = resolveTemporalIntent(request.intents, request.requiredScope, now);
  reasons.push(...intent.reasons);
  lineage.intentId = intent.selected?.id ?? null;

  if (intent.mode === 'missing' || intent.mode === 'conflict') {
    return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
  }
  if (request.risk !== 'observe' && intent.mode !== 'authoritative') {
    reasons.push('Effectful action requires fresh authenticated Current You or active delegated authority.');
    return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
  }
  if (request.risk === 'irreversible') {
    reasons.push('Irreversible action cannot be autonomously authorized by this contract.');
    return { decision: 'deny', reasons, selectedIntent: intent.selected, lineage };
  }

  for (const memoryId of requiredMemoryIds) {
    const memory = memories.find((candidate) => candidate.id === memoryId);
    if (!memory) {
      reasons.push(`Required memory ${memoryId} is missing.`);
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    const assessment = memoryCanAuthorize(memory, request.risk, now);
    if (!assessment.allowed) {
      reasons.push(`${memoryId}: ${assessment.reason}`);
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    lineage.memoryIds.push(memory.id);
  }

  for (const requirement of requiredClaims) {
    const supporting = proofs.find((candidate) =>
      proofSupportsClaim(candidate, requirement.claim, now, requirement.exactVersion, requirement.maxAgeMs).supported);
    if (!supporting) {
      reasons.push(`No valid proof contract supports required claim: ${requirement.claim}.`);
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    if (request.risk === 'consequential'
      && requirement.maxAgeMs == null
      && supporting.freshForMs == null
      && supporting.expiresAt == null) {
      reasons.push(`Consequential claim ${requirement.claim} has no explicit freshness boundary.`);
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    lineage.proofIds.push(supporting.id);
  }

  const recovery = recoverySatisfiesRisk(request.recoveryPlan, request.risk);
  if (!recovery.allowed) {
    reasons.push(recovery.reason);
    return { decision: 'deny', reasons, selectedIntent: intent.selected, lineage };
  }
  reasons.push(recovery.reason);

  if (request.risk === 'consequential') {
    if (!request.authorization || !request.proposalId || !request.proposalHash || !request.actionHash || !intent.selected) {
      reasons.push('Consequential action requires a bound execution authorization plus proposal and action hashes.');
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    const authorization = authorizationSupportsAction(request.authorization, {
      requiredScope: request.requiredScope,
      intentId: intent.selected.id,
      proposalId: request.proposalId,
      proposalHash: request.proposalHash,
      actionHash: request.actionHash,
      exactVersion: request.exactVersion,
      consumedAuthorizationIds: request.consumedAuthorizationIds,
      now,
    });
    if (!authorization.allowed) {
      reasons.push(authorization.reason);
      return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
    }
    reasons.push(authorization.reason);
  }

  reasons.push('Governed action contract satisfied.');
  return { decision: 'allow', reasons, selectedIntent: intent.selected, lineage };
}
