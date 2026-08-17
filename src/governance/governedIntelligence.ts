export type IntentSource =
  | 'current_user'
  | 'delegated'
  | 'historical_user'
  | 'future_you'
  | 'inferred';

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
  factHash: string;
  ownerId: string;
  source: IntentSource;
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
}

export interface RecoveryPlan {
  id: string;
  level: RecoveryLevel;
  checkpointRef?: string | null;
  rollbackAction?: string | null;
  validationAction?: string | null;
  rehearsedAt?: string | null;
}

export interface GovernedActionRequest {
  requiredScope: string;
  risk: ActionRisk;
  intents: TemporalIntent[];
  memories?: GovernedMemory[];
  requiredMemoryIds?: string[];
  proofs?: ProofContract[];
  requiredClaims?: Array<{ claim: string; exactVersion?: string | null }>;
  recoveryPlan?: RecoveryPlan | null;
  explicitApproval?: boolean;
  hardConstraintViolations?: string[];
  now?: Date;
}

export interface DecisionLineage {
  evaluatedAt: string;
  intentId: string | null;
  memoryIds: string[];
  proofIds: string[];
  recoveryPlanId: string | null;
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

const MEMORY_SOURCE_RANK: Record<IntentSource, number> = {
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

function isFutureBeyondSkew(value: string, now: Date): boolean {
  const parsed = parseTime(value);
  return parsed !== null && parsed > now.getTime() + FIVE_MINUTES_MS;
}

function scopeMatches(scope: string[], requiredScope: string): boolean {
  return scope.includes('*') || scope.includes(requiredScope);
}

function activeIntent(intent: TemporalIntent, now: Date, requiredScope: string): boolean {
  const issuedAt = parseTime(intent.issuedAt);
  if (issuedAt === null || isFutureBeyondSkew(intent.issuedAt, now)) return false;
  if (!scopeMatches(intent.scope, requiredScope)) return false;
  if (intent.revokedAt && parseTime(intent.revokedAt) !== null && parseTime(intent.revokedAt)! <= now.getTime()) return false;
  if (intent.expiresAt && parseTime(intent.expiresAt) !== null && parseTime(intent.expiresAt)! <= now.getTime()) return false;
  if ((intent.source === 'current_user' || intent.source === 'delegated') && !intent.authenticated) return false;
  return true;
}

export function resolveTemporalIntent(
  intents: TemporalIntent[],
  requiredScope: string,
  now: Date = new Date(),
): { selected: TemporalIntent | null; mode: 'authoritative' | 'advisory' | 'missing' | 'conflict'; reasons: string[] } {
  const active = intents.filter((intent) => activeIntent(intent, now, requiredScope));
  const superseded = new Set(active.flatMap((intent) => intent.supersedes ?? []));
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
  const sameRank = sorted.filter((intent) => INTENT_RANK[intent.source] === INTENT_RANK[selected.source]);
  const newestTime = parseTime(selected.issuedAt) ?? 0;
  const equallyCurrent = sameRank.filter((intent) => (parseTime(intent.issuedAt) ?? 0) === newestTime);
  if (new Set(equallyCurrent.map((intent) => intent.intentHash)).size > 1) {
    return {
      selected: null,
      mode: 'conflict',
      reasons: ['Conflicting equally current intents require explicit re-confirmation.'],
    };
  }

  if (selected.source === 'current_user' || selected.source === 'delegated') {
    return {
      selected,
      mode: 'authoritative',
      reasons: [`${selected.source} intent is active, authenticated, scoped, and not superseded.`],
    };
  }

  return {
    selected,
    mode: 'advisory',
    reasons: [`${selected.source} context may inform the action but cannot silently authorize it.`],
  };
}

export function adjudicateMemoryWrite(
  existing: GovernedMemory | null,
  incoming: GovernedMemory,
  now: Date = new Date(),
): MemoryAdjudication {
  if (!existing) {
    return { decision: 'accept', winnerId: incoming.id, loserId: null, reason: 'No existing memory competes with this write.' };
  }

  if (existing.factHash === incoming.factHash) {
    const newer = (parseTime(incoming.observedAt) ?? 0) >= (parseTime(existing.observedAt) ?? 0);
    return {
      decision: newer ? 'supersede' : 'preserve_existing',
      winnerId: newer ? incoming.id : existing.id,
      loserId: newer ? existing.id : incoming.id,
      reason: 'Equivalent facts preserve lineage while the newer observation becomes current.',
    };
  }

  const incomingTime = parseTime(incoming.observedAt);
  const existingTime = parseTime(existing.observedAt);
  const incomingValid = incomingTime !== null && !isFutureBeyondSkew(incoming.observedAt, now);
  if (!incomingValid) {
    return {
      decision: 'preserve_existing',
      winnerId: existing.id,
      loserId: incoming.id,
      reason: 'Malformed or future-dated memory cannot displace existing state.',
    };
  }

  const incomingAuthoritative = incoming.authenticated && incoming.source === 'current_user';
  const existingAuthoritative = existing.authenticated && existing.source === 'current_user';

  if (incomingAuthoritative && (!existingAuthoritative || (incomingTime ?? 0) > (existingTime ?? 0))) {
    return {
      decision: 'supersede',
      winnerId: incoming.id,
      loserId: existing.id,
      reason: 'A newer authenticated Current You correction supersedes lower-authority or older memory while preserving the prior record for audit.',
    };
  }

  if (existingAuthoritative && ['future_you', 'historical_user', 'inferred'].includes(incoming.source)) {
    return {
      decision: 'preserve_existing',
      winnerId: existing.id,
      loserId: incoming.id,
      reason: 'FutureYou, historical, or inferred context cannot overwrite an authenticated Current You fact.',
    };
  }

  const incomingRank = MEMORY_SOURCE_RANK[incoming.source];
  const existingRank = MEMORY_SOURCE_RANK[existing.source];
  if (incomingRank > existingRank && (incomingTime ?? 0) >= (existingTime ?? 0)) {
    return {
      decision: 'supersede',
      winnerId: incoming.id,
      loserId: existing.id,
      reason: 'Higher-authority newer evidence supersedes the prior memory and preserves it as lineage.',
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
  const observedAt = parseTime(memory.observedAt);
  if (observedAt === null || isFutureBeyondSkew(memory.observedAt, now)) {
    return { allowed: false, reason: 'Memory observation time is invalid or future-dated.' };
  }
  if (memory.expiresAt && parseTime(memory.expiresAt) !== null && parseTime(memory.expiresAt)! <= now.getTime()) {
    return { allowed: false, reason: 'Memory has expired.' };
  }
  if (['candidate', 'stale', 'disputed', 'superseded', 'forgotten'].includes(memory.status)) {
    return { allowed: false, reason: `Memory status ${memory.status} cannot authorize action.` };
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

  return { allowed: true, reason: 'Memory is sufficiently verified and fresh for this risk level.' };
}

export function proofSupportsClaim(
  proof: ProofContract,
  claim: string,
  now: Date = new Date(),
  exactVersion?: string | null,
): { supported: boolean; reason: string } {
  if (proof.doesNotProve.includes(claim)) {
    return { supported: false, reason: 'Proof contract explicitly excludes this claim.' };
  }
  if (!proof.proves.includes(claim)) {
    return { supported: false, reason: 'Proof contract does not declare support for this claim.' };
  }
  if (!SHA256.test(proof.artifactHash)) {
    return { supported: false, reason: 'Proof artifact hash is missing or malformed.' };
  }

  const observedAt = parseTime(proof.observedAt);
  if (observedAt === null || observedAt > now.getTime() + FIVE_MINUTES_MS) {
    return { supported: false, reason: 'Proof observation time is invalid or future-dated.' };
  }
  if (proof.expiresAt && parseTime(proof.expiresAt) !== null && parseTime(proof.expiresAt)! <= now.getTime()) {
    return { supported: false, reason: 'Proof contract has expired.' };
  }
  if (exactVersion && proof.exactVersion !== exactVersion) {
    return { supported: false, reason: 'Proof exact version does not match the requested version.' };
  }

  return { supported: true, reason: 'Proof contract is scoped, fresh, and version-compatible.' };
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
    const supporting = proofs.find((proof) => proofSupportsClaim(proof, requirement.claim, now, requirement.exactVersion).supported);
    if (!supporting) {
      reasons.push(`No valid proof contract supports required claim: ${requirement.claim}.`);
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

  if (request.risk === 'consequential' && request.explicitApproval !== true) {
    reasons.push('Consequential action requires explicit current approval at execution time.');
    return { decision: 'reconfirm', reasons, selectedIntent: intent.selected, lineage };
  }

  reasons.push('Governed action contract satisfied.');
  return { decision: 'allow', reasons, selectedIntent: intent.selected, lineage };
}
