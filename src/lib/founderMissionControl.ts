import { createHash } from 'node:crypto';

export const FOUNDER_MISSION_ENVELOPE_CONTRACT = 'juss/founder-mission-envelope@v1' as const;

export const FOUNDER_MISSION_CORE_ARTIFACT_IDS = Object.freeze([
  'mission-brief',
  'system-map',
  'red-team-register',
  'artifact-ledger',
  'bottleneck-map',
  'verification-report',
  'founder-decision-pack',
] as const);

export const FOUNDER_MISSION_PROOF_LEVELS = Object.freeze([
  'plan-only',
  'local-evidence',
  'exact-head',
  'deployed-observation',
  'outcome-verified',
] as const);

export const FOUNDER_MISSION_TASK_STATES = Object.freeze([
  'open',
  'active',
  'blocked',
  'proof_pending',
  'proven',
  'cleared',
] as const);

export type FounderMissionProofLevel = (typeof FOUNDER_MISSION_PROOF_LEVELS)[number];
export type FounderMissionTaskState = (typeof FOUNDER_MISSION_TASK_STATES)[number];
export type FounderMissionProofState = 'unproven' | 'proven';

export interface FounderMissionArtifact {
  artifactId: string;
  ownerLane: string;
  supportLanes: string[];
  status: FounderMissionTaskState;
  requiredProofLevel: FounderMissionProofLevel;
  evidenceRefs: string[];
  approvalGate: 'none' | 'founder';
  rollback?: string;
}

export interface FounderMissionEnvelope {
  contract: typeof FOUNDER_MISSION_ENVELOPE_CONTRACT;
  missionId: string;
  goal: string;
  preservedConstraints: string[];
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
  systemMap: string[];
  redTeamRegister: string[];
  bottleneckMap: string[];
  artifacts: FounderMissionArtifact[];
  requiredProofLevel: FounderMissionProofLevel;
  currentProofLevel: FounderMissionProofLevel;
  proofState: FounderMissionProofState;
  taskState: FounderMissionTaskState;
  proofRefs: string[];
  rollback: string;
  version: number;
  predecessorFingerprint?: string;
  createdAt: string;
}

export interface FounderMissionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FounderMissionClearance {
  proofSatisfied: boolean;
  clearanceAllowed: boolean;
  requiredProofLevel: FounderMissionProofLevel;
  currentProofLevel: FounderMissionProofLevel;
  nextGate: string | null;
}

const PROOF_RANK: Record<FounderMissionProofLevel, number> = {
  'plan-only': 0,
  'local-evidence': 1,
  'exact-head': 2,
  'deployed-observation': 3,
  'outcome-verified': 4,
};

const SHA256 = /^[0-9a-f]{64}$/i;
const REGISTERED_ACTION_ID = /^[a-z0-9][a-z0-9:_-]{0,127}$/;

function canonicalize(value: unknown, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non_finite_number:${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => {
          if (record[key] === undefined) throw new Error(`undefined_value:${path}.${key}`);
          return [key, canonicalize(record[key], `${path}.${key}`)];
        }),
    );
  }
  throw new Error(`unsupported_value:${path}`);
}

export function canonicalMissionJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function founderMissionFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalMissionJson(value)).digest('hex');
}

export function proofLevelSatisfies(
  current: FounderMissionProofLevel,
  required: FounderMissionProofLevel,
): boolean {
  return PROOF_RANK[current] >= PROOF_RANK[required];
}

export function isRegisteredActionId(value: string): boolean {
  return REGISTERED_ACTION_ID.test(value);
}

function isIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function evaluateFounderMissionClearance(
  envelope: FounderMissionEnvelope,
): FounderMissionClearance {
  const levelSatisfied = proofLevelSatisfies(envelope.currentProofLevel, envelope.requiredProofLevel);
  const hasEvidence = envelope.proofRefs.length > 0;
  const proofSatisfied = envelope.proofState === 'proven' && levelSatisfied && hasEvidence;

  let nextGate: string | null = null;
  if (!levelSatisfied) {
    nextGate = `obtain ${envelope.requiredProofLevel} proof`;
  } else if (!hasEvidence) {
    nextGate = 'attach evidence references';
  } else if (envelope.proofState !== 'proven') {
    nextGate = 'validate evidence and mark proof proven';
  }

  return {
    proofSatisfied,
    clearanceAllowed: proofSatisfied,
    requiredProofLevel: envelope.requiredProofLevel,
    currentProofLevel: envelope.currentProofLevel,
    nextGate,
  };
}

export function validateFounderMissionEnvelope(
  envelope: FounderMissionEnvelope,
): FounderMissionValidationResult {
  const errors: string[] = [];

  if (envelope.contract !== FOUNDER_MISSION_ENVELOPE_CONTRACT) {
    errors.push('mission contract drifted');
  }
  if (!envelope.missionId.trim()) errors.push('missionId is required');
  if (!envelope.goal.trim()) errors.push('goal is required');
  if (!envelope.rollback.trim()) errors.push('rollback is required');

  for (const [field, value] of Object.entries({
    who: envelope.who,
    what: envelope.what,
    where: envelope.where,
    when: envelope.when,
    why: envelope.why,
    how: envelope.how,
  })) {
    if (!value.trim()) errors.push(`${field} is required`);
  }

  if (!Number.isInteger(envelope.version) || envelope.version < 1) {
    errors.push('version must be a positive integer');
  }
  if (envelope.version > 1 && !SHA256.test(envelope.predecessorFingerprint ?? '')) {
    errors.push('successor versions require a predecessor fingerprint');
  }
  if (envelope.version === 1 && envelope.predecessorFingerprint) {
    errors.push('version 1 must not claim a predecessor fingerprint');
  }
  if (!isIsoTimestamp(envelope.createdAt)) errors.push('createdAt must be a canonical ISO timestamp');

  const artifactIds = envelope.artifacts.map((artifact) => artifact.artifactId);
  const uniqueArtifactIds = new Set(artifactIds);
  if (uniqueArtifactIds.size !== artifactIds.length) errors.push('artifact IDs must be unique');

  for (const requiredId of FOUNDER_MISSION_CORE_ARTIFACT_IDS) {
    if (!uniqueArtifactIds.has(requiredId)) errors.push(`missing core artifact ${requiredId}`);
  }

  for (const artifact of envelope.artifacts) {
    if (!artifact.artifactId.trim()) errors.push('artifactId is required');
    if (!artifact.ownerLane.trim()) errors.push(`artifact ${artifact.artifactId} requires exactly one owner lane`);
    if (new Set(artifact.supportLanes).size !== artifact.supportLanes.length) {
      errors.push(`artifact ${artifact.artifactId} support lanes must be unique`);
    }
    if (artifact.supportLanes.includes(artifact.ownerLane)) {
      errors.push(`artifact ${artifact.artifactId} owner lane cannot also be a support lane`);
    }
    if (artifact.status === 'cleared') {
      const artifactProofSatisfied = proofLevelSatisfies(
        envelope.currentProofLevel,
        artifact.requiredProofLevel,
      ) && artifact.evidenceRefs.length > 0;
      if (!artifactProofSatisfied) {
        errors.push(`artifact ${artifact.artifactId} cannot clear before its required proof is satisfied`);
      }
    }
  }

  const clearance = evaluateFounderMissionClearance(envelope);
  if (envelope.proofState === 'proven' && !clearance.proofSatisfied) {
    errors.push('proofState cannot be proven before required proof and evidence are satisfied');
  }
  if (envelope.taskState === 'proven' && !clearance.proofSatisfied) {
    errors.push('task cannot be proven before required proof is satisfied');
  }
  if (envelope.taskState === 'cleared' && !clearance.proofSatisfied) {
    errors.push('task cannot clear before proof is proven at the required level');
  }

  return { valid: errors.length === 0, errors };
}

export function createFounderMissionSuccessor(
  prior: FounderMissionEnvelope,
  next: Omit<FounderMissionEnvelope, 'version' | 'predecessorFingerprint'>,
): FounderMissionEnvelope {
  if (next.missionId !== prior.missionId) {
    throw new Error('mission identity cannot change across append-only successors');
  }
  return {
    ...next,
    version: prior.version + 1,
    predecessorFingerprint: founderMissionFingerprint(prior),
  };
}
