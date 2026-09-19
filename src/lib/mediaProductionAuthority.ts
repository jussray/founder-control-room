import { createHash } from 'node:crypto';
import type { ClaimState } from './evidenceDecisionLoop.js';
import {
  evaluateMediaMissionContinuity,
  type MediaMissionContinuityGateInput,
} from './mediaMissionContinuity.js';

export const GEMINI_MEDIA_COMMAND_CONTRACT = 'founder-control-room/gemini-media-production-command@v1' as const;
export const LEEVIZE_MEDIA_POLICY_CONTRACT = 'founder-control-room/leevize-media-policy@v1' as const;

export type GeminiMediaDecision = 'AUTHORIZE_PRODUCTION' | 'HOLD' | 'REPAIR' | 'RELEASE' | 'CANCEL';
export type MediaRenderDirective = 'GENERATE' | 'CAPTURE_REAL_RUNTIME' | 'COMPOSITE' | 'EDIT' | 'STOP';
export type MediaRendererId = 'gemini-veo' | 'invideo' | 'runway' | 'runtime-capture' | 'editor-compositor';
export type MediaClaimChannel = 'spoken' | 'text' | 'visual' | 'implied';
export type MediaClaimPresentation = 'FACT' | 'QUALIFIED';

export interface GeminiMediaClaimBinding {
  claimId: string;
  channel: MediaClaimChannel;
  presentation: MediaClaimPresentation;
}

export interface GeminiMediaShotCommand {
  shotId: string;
  directive: MediaRenderDirective;
  renderer: MediaRendererId | null;
  purpose: string;
  maxAttempts: number;
  creditCeiling: number;
  claimBindings: readonly GeminiMediaClaimBinding[];
  requiredEvidenceRefs: readonly string[];
  strictCanonFingerprints: readonly string[];
}

export interface GeminiMediaProductionCommand {
  contract: typeof GEMINI_MEDIA_COMMAND_CONTRACT;
  commandId: string;
  issuer: 'gemini-command';
  projectId: string;
  missionId: string;
  decision: GeminiMediaDecision;
  viewerTakeaway: string;
  maxCredits: number;
  shots: readonly GeminiMediaShotCommand[];
  issuedAt: string;
  commandHash: string;
}

export interface LeevizeMediaClaimSnapshot {
  claimId: string;
  state: ClaimState;
  evidenceRefs: readonly string[];
  targetSha: string;
  claimFingerprint: string;
  observedAt: string;
  expiresAt: string;
}

export interface LeevizeMediaPolicyInput {
  command: GeminiMediaProductionCommand;
  continuity: MediaMissionContinuityGateInput;
  claims: readonly LeevizeMediaClaimSnapshot[];
  currentEvidenceRefs: readonly string[];
  currentCanonFingerprints: readonly string[];
  projectCreditCeiling: number;
  verificationFailures?: readonly string[];
}

export interface LeevizeMediaPolicyResult {
  contract: typeof LEEVIZE_MEDIA_POLICY_CONTRACT;
  disposition: 'EXECUTE' | 'BLOCK';
  decision: GeminiMediaDecision;
  reasons: readonly string[];
  commandAuthority: 'gemini-command';
  policyAuthority: 'leevize';
  truthReclassificationAllowed: false;
  continuityVerified: boolean;
  releaseDispositionAccepted: boolean;
  publishAuthorized: false;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAX_ATTEMPTS = 10;
const FUTURE_SKEW_MS = 2 * 60 * 1000;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function stableShot(shot: GeminiMediaShotCommand): unknown {
  return {
    shotId: text(shot.shotId),
    directive: shot.directive,
    renderer: shot.renderer,
    purpose: text(shot.purpose),
    maxAttempts: shot.maxAttempts,
    creditCeiling: shot.creditCeiling,
    claimBindings: [...shot.claimBindings]
      .map((binding) => ({
        claimId: text(binding.claimId),
        channel: binding.channel,
        presentation: binding.presentation,
      }))
      .sort((left, right) => `${left.claimId}:${left.channel}:${left.presentation}`.localeCompare(`${right.claimId}:${right.channel}:${right.presentation}`)),
    requiredEvidenceRefs: unique(shot.requiredEvidenceRefs),
    strictCanonFingerprints: unique(shot.strictCanonFingerprints).map((value) => value.toLowerCase()),
  };
}

export function geminiMediaCommandHash(
  command: Omit<GeminiMediaProductionCommand, 'commandHash'>,
): string {
  const canonical = {
    contract: command.contract,
    commandId: text(command.commandId),
    issuer: command.issuer,
    projectId: text(command.projectId),
    missionId: text(command.missionId),
    decision: command.decision,
    viewerTakeaway: text(command.viewerTakeaway),
    maxCredits: command.maxCredits,
    shots: command.shots.map(stableShot),
    issuedAt: command.issuedAt,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function commandErrors(command: GeminiMediaProductionCommand, now: string): string[] {
  const reasons: string[] = [];
  if (command.contract !== GEMINI_MEDIA_COMMAND_CONTRACT) reasons.push('command_contract_invalid');
  if (command.issuer !== 'gemini-command') reasons.push('command_issuer_invalid');
  if (!SAFE_ID.test(text(command.commandId))) reasons.push('command_id_invalid');
  if (!text(command.projectId)) reasons.push('project_id_missing');
  if (!text(command.missionId)) reasons.push('mission_id_missing');
  if (!text(command.viewerTakeaway)) reasons.push('viewer_takeaway_missing');
  if (!Number.isFinite(command.maxCredits) || command.maxCredits < 0) reasons.push('command_budget_invalid');
  if (!SHA256.test(command.commandHash) || command.commandHash !== geminiMediaCommandHash(command)) {
    reasons.push('command_hash_invalid');
  }

  const issuedAt = Date.parse(command.issuedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(nowMs)) reasons.push('command_time_invalid');
  else if (issuedAt > nowMs + FUTURE_SKEW_MS) reasons.push('command_from_future');

  const shotIds = new Set<string>();
  let allocatedCredits = 0;
  for (const shot of command.shots) {
    const shotId = text(shot.shotId);
    if (!SAFE_ID.test(shotId)) reasons.push('shot_id_invalid');
    else if (shotIds.has(shotId)) reasons.push(`shot_duplicate:${shotId}`);
    else shotIds.add(shotId);
    if (!text(shot.purpose)) reasons.push(`shot_purpose_missing:${shotId || 'unknown'}`);
    if (!Number.isInteger(shot.maxAttempts) || shot.maxAttempts < 0 || shot.maxAttempts > MAX_ATTEMPTS) {
      reasons.push(`shot_attempts_invalid:${shotId || 'unknown'}`);
    }
    if (!Number.isFinite(shot.creditCeiling) || shot.creditCeiling < 0) {
      reasons.push(`shot_budget_invalid:${shotId || 'unknown'}`);
    } else {
      allocatedCredits += shot.creditCeiling;
    }
    if (shot.directive === 'STOP' && shot.renderer !== null) reasons.push(`stop_renderer_must_be_null:${shotId}`);
    if (shot.directive !== 'STOP' && shot.renderer === null) reasons.push(`renderer_missing:${shotId}`);
    if (shot.directive === 'CAPTURE_REAL_RUNTIME' && shot.renderer !== 'runtime-capture') {
      reasons.push(`runtime_capture_renderer_invalid:${shotId}`);
    }
    if (shot.directive === 'GENERATE' && shot.renderer === 'runtime-capture') {
      reasons.push(`generated_runtime_capture_invalid:${shotId}`);
    }
  }
  if (allocatedCredits > command.maxCredits) reasons.push('shot_budget_exceeds_command_budget');
  return unique(reasons);
}

function policyErrors(input: LeevizeMediaPolicyInput): string[] {
  const reasons: string[] = [];
  const { command } = input;
  const continuity = evaluateMediaMissionContinuity(input.continuity);
  const exactHead = text(input.continuity.expectedHeadSha).toLowerCase();
  const nowMs = Date.parse(input.continuity.now);
  const claims = new Map(input.claims.map((claim) => [text(claim.claimId), claim]));
  const currentEvidence = new Set(unique(input.currentEvidenceRefs));
  const currentCanon = new Set(unique(input.currentCanonFingerprints).map((value) => value.toLowerCase()));

  reasons.push(...commandErrors(command, input.continuity.now));
  if (command.projectId !== input.continuity.projectId) reasons.push('command_project_mismatch');
  if (command.missionId !== input.continuity.missionId) reasons.push('command_mission_mismatch');
  if (!Number.isFinite(input.projectCreditCeiling) || input.projectCreditCeiling < 0) reasons.push('project_budget_invalid');
  else if (command.maxCredits > input.projectCreditCeiling) reasons.push('command_budget_exceeds_project_ceiling');

  if (command.decision === 'HOLD' || command.decision === 'CANCEL') return unique(reasons);

  if (continuity.status !== 'pass' || continuity.continuityState !== 'current') {
    reasons.push('media_continuity_not_current');
    for (const reason of continuity.reasons) reasons.push(`continuity:${reason}`);
  }

  for (const shot of command.shots) {
    const shotId = text(shot.shotId);
    if (shot.directive === 'STOP') continue;

    for (const ref of unique(shot.requiredEvidenceRefs)) {
      if (!currentEvidence.has(ref)) reasons.push(`evidence_missing:${shotId}:${ref}`);
    }
    if (shot.directive === 'CAPTURE_REAL_RUNTIME' && unique(shot.requiredEvidenceRefs).length === 0) {
      reasons.push(`runtime_capture_evidence_missing:${shotId}`);
    }
    for (const fingerprint of unique(shot.strictCanonFingerprints)) {
      const normalized = fingerprint.toLowerCase();
      if (!SHA256.test(normalized) || !currentCanon.has(normalized)) {
        reasons.push(`canon_not_current:${shotId}:${normalized || 'missing'}`);
      }
    }

    for (const binding of shot.claimBindings) {
      const claimId = text(binding.claimId);
      const claim = claims.get(claimId);
      if (!claim) {
        reasons.push(`claim_missing:${shotId}:${claimId || 'unknown'}`);
        continue;
      }
      if (!FULL_SHA.test(claim.targetSha) || claim.targetSha.toLowerCase() !== exactHead) {
        reasons.push(`claim_head_stale:${shotId}:${claimId}`);
      }
      if (!SHA256.test(claim.claimFingerprint)) reasons.push(`claim_fingerprint_invalid:${shotId}:${claimId}`);
      const observedAt = Date.parse(claim.observedAt);
      const expiresAt = Date.parse(claim.expiresAt);
      if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(nowMs)) {
        reasons.push(`claim_time_invalid:${shotId}:${claimId}`);
      } else if (observedAt > nowMs + FUTURE_SKEW_MS || expiresAt <= nowMs || expiresAt <= observedAt) {
        reasons.push(`claim_not_current:${shotId}:${claimId}`);
      }
      if (claim.state === 'VERIFIED') {
        if (unique(claim.evidenceRefs).length === 0) reasons.push(`claim_evidence_empty:${shotId}:${claimId}`);
        for (const ref of unique(claim.evidenceRefs)) {
          if (!currentEvidence.has(ref)) reasons.push(`claim_evidence_missing:${shotId}:${claimId}:${ref}`);
        }
      } else if (claim.state === 'INFERRED' && binding.presentation === 'QUALIFIED') {
        // Qualified inference is allowed; the command still cannot promote its state.
      } else {
        reasons.push(`claim_not_presentable:${shotId}:${claimId}:${claim.state}:${binding.presentation}`);
      }
    }
  }

  if (command.decision === 'RELEASE') {
    if (continuity.evidenceState !== 'export_verified') reasons.push('release_requires_export_verified');
    for (const failure of unique(input.verificationFailures ?? [])) reasons.push(`verification_failed:${failure}`);
  }

  return unique(reasons);
}

/**
 * Gemini decides the production action. /LEEVIZE only enforces the non-bypassable
 * evidence, canon, budget, freshness, and continuity envelope. The command may
 * reference a claim, but it cannot carry or overwrite the claim's truth state.
 * A passing RELEASE accepts Gemini's release disposition; it never turns a media
 * proof cookie into external publish authority.
 */
export function evaluateGeminiMediaProductionCommand(
  input: LeevizeMediaPolicyInput,
): LeevizeMediaPolicyResult {
  const reasons = policyErrors(input);
  const continuity = evaluateMediaMissionContinuity(input.continuity);
  const disposition = reasons.length === 0 ? 'EXECUTE' : 'BLOCK';
  return {
    contract: LEEVIZE_MEDIA_POLICY_CONTRACT,
    disposition,
    decision: input.command.decision,
    reasons,
    commandAuthority: 'gemini-command',
    policyAuthority: 'leevize',
    truthReclassificationAllowed: false,
    continuityVerified: continuity.status === 'pass' && continuity.continuityState === 'current',
    releaseDispositionAccepted: disposition === 'EXECUTE' && input.command.decision === 'RELEASE',
    publishAuthorized: false,
  };
}
