export type FounderJob = 'decide' | 'authorize' | 'verify';

export type FounderRole = 'founder' | 'delegate' | 'operator' | 'auditor';

export interface RoleCapabilities {
  role: FounderRole;
  mayRead: boolean;
  mayPropose: boolean;
  mayStage: boolean;
  mayExecute: boolean;
  mayVerify: boolean;
  mayApproveCritical: boolean;
}

export const ROLE_CAPABILITIES: Readonly<Record<FounderRole, RoleCapabilities>> = {
  founder: {
    role: 'founder',
    mayRead: true,
    mayPropose: true,
    mayStage: true,
    mayExecute: true,
    mayVerify: true,
    mayApproveCritical: true,
  },
  delegate: {
    role: 'delegate',
    mayRead: true,
    mayPropose: true,
    mayStage: true,
    mayExecute: false,
    mayVerify: true,
    mayApproveCritical: false,
  },
  operator: {
    role: 'operator',
    mayRead: true,
    mayPropose: true,
    mayStage: true,
    mayExecute: true,
    mayVerify: true,
    mayApproveCritical: false,
  },
  auditor: {
    role: 'auditor',
    mayRead: true,
    mayPropose: false,
    mayStage: false,
    mayExecute: false,
    mayVerify: true,
    mayApproveCritical: false,
  },
};

export type MemoryRetentionClass = 'raw' | 'redacted' | 'summary' | 'embeddings';

export interface MemoryRetentionPolicy {
  defaultMode: 'ephemeral';
  processWithoutRememberingAvailable: true;
  retention: Record<MemoryRetentionClass, 'none' | 'session' | 'explicit_opt_in'>;
  embeddingsForbiddenFor: readonly ['credentials', 'sensitive_personal_data'];
  reviewBeforeSensitiveSave: true;
}

export const DEFAULT_MEMORY_RETENTION_POLICY: MemoryRetentionPolicy = {
  defaultMode: 'ephemeral',
  processWithoutRememberingAvailable: true,
  retention: {
    raw: 'none',
    redacted: 'explicit_opt_in',
    summary: 'explicit_opt_in',
    embeddings: 'explicit_opt_in',
  },
  embeddingsForbiddenFor: ['credentials', 'sensitive_personal_data'],
  reviewBeforeSensitiveSave: true,
};

export interface ToneGuardDiffLog {
  id: string;
  inputDigest: string;
  outputDigest: string;
  changed: boolean;
  changeSummary: string[];
  safetyNotes: string[];
  provenanceId: string;
  createdAt: string;
}

export interface BreakGlassState {
  enabled: boolean;
  mode: 'read_only';
  reason: string;
  activatedBy: string;
  activatedAt: string;
  expiresAt: string;
}

export interface ValueBudget {
  runId: string;
  estimatedCostUsd: number;
  hardCostCeilingUsd: number;
  expectedFounderOutcome: string;
  expectedEvidence: string[];
  founderOverrideRequired: boolean;
}

export interface FounderOutcomeMetric {
  runId: string;
  helped: 'yes' | 'not_really' | 'wrong_time';
  moveCompleted: boolean;
  minutesToUsefulOutcome: number | null;
  founderEffortMinutes: number | null;
  recordedAt: string;
}

export type MutableModule =
  | 'chief_ai'
  | 'tone_guard'
  | 'sensitive_detection'
  | 'memory_persistence'
  | 'provider_execution'
  | 'public_export';

export type MutableModuleFlags = Readonly<Record<MutableModule, boolean>>;

export function mutationAllowed(
  module: MutableModule,
  flags: MutableModuleFlags,
  breakGlass: BreakGlassState | null,
): boolean {
  if (breakGlass?.enabled) return false;
  return flags[module] === true;
}
