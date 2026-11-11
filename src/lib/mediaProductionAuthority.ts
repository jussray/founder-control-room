import { createHash } from 'node:crypto';
import type { ClaimState } from './evidenceDecisionLoop.js';
import {
  evaluateMediaMissionContinuity,
  type MediaMissionContinuityGateInput,
} from './mediaMissionContinuity.js';
import {
  validateOperatorRelayRequest,
  validateOperatorRelayResponse,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from './operatorRelay.js';

export const GEMINI_MEDIA_COMMAND_CONTRACT = 'founder-control-room/gemini-media-production-command@v1' as const;
export const GEMINI_MEDIA_COMMAND_AUTHORITY_RECEIPT_CONTRACT = 'founder-control-room/gemini-media-command-authority-receipt@v1' as const;
export const GEMINI_MEDIA_PLAN_CONTRACT = 'founder-control-room/gemini-media-plan@v1' as const;
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

export type GeminiMediaProductionCommandDraft = Pick<
  GeminiMediaProductionCommand,
  'commandId' | 'projectId' | 'missionId' | 'decision' | 'viewerTakeaway' | 'maxCredits' | 'shots'
>;

export interface GeminiMediaCommandAuthorityReceipt {
  contract: typeof GEMINI_MEDIA_COMMAND_AUTHORITY_RECEIPT_CONTRACT;
  commandHash: string;
  relayId: string;
  requestHash: string;
  responseHash: string;
  providerEvidenceRef: string;
  boundAt: string;
  authorityScope: 'media-command-only';
  truthAuthority: false;
  externalActionAuthority: false;
  publishAuthority: false;
}

const GEMINI_MEDIA_AUTHORITY_BINDING = Symbol('gemini-media-command-authority-binding');

export interface GeminiMediaCommandAuthorityBinding {
  readonly receipt: GeminiMediaCommandAuthorityReceipt;
  readonly [GEMINI_MEDIA_AUTHORITY_BINDING]: true;
}

export interface BoundGeminiMediaCommand {
  command: GeminiMediaProductionCommand;
  authority: GeminiMediaCommandAuthorityBinding;
  receipt: GeminiMediaCommandAuthorityReceipt;
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
  commandAuthority: GeminiMediaCommandAuthorityBinding;
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
  commandAuthority: 'gemini-command-bound';
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
const DECISIONS = new Set<GeminiMediaDecision>(['AUTHORIZE_PRODUCTION', 'HOLD', 'REPAIR', 'RELEASE', 'CANCEL']);
const DIRECTIVES = new Set<MediaRenderDirective>(['GENERATE', 'CAPTURE_REAL_RUNTIME', 'COMPOSITE', 'EDIT', 'STOP']);
const RENDERERS = new Set<MediaRendererId>(['gemini-veo', 'invideo', 'runway', 'runtime-capture', 'editor-compositor']);
const CLAIM_CHANNELS = new Set<MediaClaimChannel>(['spoken', 'text', 'visual', 'implied']);
const CLAIM_PRESENTATIONS = new Set<MediaClaimPresentation>(['FACT', 'QUALIFIED']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${label} contains unsupported fields: ${extras.sort().join(',')}`);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value.map((item) => item.trim());
}

function parseGeminiCommandDraft(raw: unknown): GeminiMediaProductionCommandDraft {
  const root = object(raw);
  if (!root) throw new Error('Gemini media command output must be a JSON object');
  exactKeys(root, ['commandId', 'projectId', 'missionId', 'decision', 'viewerTakeaway', 'maxCredits', 'shots'], 'Gemini media command');

  const decision = root.decision;
  if (typeof decision !== 'string' || !DECISIONS.has(decision as GeminiMediaDecision)) {
    throw new Error('Gemini media command decision is unsupported');
  }
  if (!Array.isArray(root.shots)) throw new Error('Gemini media command shots must be an array');

  const shots: GeminiMediaShotCommand[] = root.shots.map((value, index) => {
    const shot = object(value);
    if (!shot) throw new Error(`Gemini media command shot ${index + 1} must be an object`);
    exactKeys(
      shot,
      ['shotId', 'directive', 'renderer', 'purpose', 'maxAttempts', 'creditCeiling', 'claimBindings', 'requiredEvidenceRefs', 'strictCanonFingerprints'],
      `Gemini media command shot ${index + 1}`,
    );
    if (typeof shot.directive !== 'string' || !DIRECTIVES.has(shot.directive as MediaRenderDirective)) {
      throw new Error(`Gemini media command shot ${index + 1} directive is unsupported`);
    }
    if (shot.renderer !== null && (typeof shot.renderer !== 'string' || !RENDERERS.has(shot.renderer as MediaRendererId))) {
      throw new Error(`Gemini media command shot ${index + 1} renderer is unsupported`);
    }
    if (!Array.isArray(shot.claimBindings)) {
      throw new Error(`Gemini media command shot ${index + 1} claimBindings must be an array`);
    }
    const claimBindings: GeminiMediaClaimBinding[] = shot.claimBindings.map((value, bindingIndex) => {
      const binding = object(value);
      if (!binding) throw new Error(`Gemini media command shot ${index + 1} claim binding ${bindingIndex + 1} must be an object`);
      exactKeys(binding, ['claimId', 'channel', 'presentation'], `Gemini media command shot ${index + 1} claim binding ${bindingIndex + 1}`);
      if (typeof binding.channel !== 'string' || !CLAIM_CHANNELS.has(binding.channel as MediaClaimChannel)) {
        throw new Error(`Gemini media command shot ${index + 1} claim binding ${bindingIndex + 1} channel is unsupported`);
      }
      if (typeof binding.presentation !== 'string' || !CLAIM_PRESENTATIONS.has(binding.presentation as MediaClaimPresentation)) {
        throw new Error(`Gemini media command shot ${index + 1} claim binding ${bindingIndex + 1} presentation is unsupported`);
      }
      return {
        claimId: text(binding.claimId),
        channel: binding.channel as MediaClaimChannel,
        presentation: binding.presentation as MediaClaimPresentation,
      };
    });

    return {
      shotId: text(shot.shotId),
      directive: shot.directive as MediaRenderDirective,
      renderer: shot.renderer as MediaRendererId | null,
      purpose: text(shot.purpose),
      maxAttempts: typeof shot.maxAttempts === 'number' ? shot.maxAttempts : Number.NaN,
      creditCeiling: typeof shot.creditCeiling === 'number' ? shot.creditCeiling : Number.NaN,
      claimBindings,
      requiredEvidenceRefs: stringArray(shot.requiredEvidenceRefs, `Gemini media command shot ${index + 1} requiredEvidenceRefs`),
      strictCanonFingerprints: stringArray(shot.strictCanonFingerprints, `Gemini media command shot ${index + 1} strictCanonFingerprints`),
    };
  });

  return {
    commandId: text(root.commandId),
    projectId: text(root.projectId),
    missionId: text(root.missionId),
    decision: decision as GeminiMediaDecision,
    viewerTakeaway: text(root.viewerTakeaway),
    maxCredits: typeof root.maxCredits === 'number' ? root.maxCredits : Number.NaN,
    shots,
  };
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

export function geminiMediaPlanFingerprint(
  command: Pick<GeminiMediaProductionCommand, 'projectId' | 'missionId' | 'viewerTakeaway' | 'maxCredits' | 'shots'>,
): string {
  const canonical = {
    contract: GEMINI_MEDIA_PLAN_CONTRACT,
    projectId: text(command.projectId),
    missionId: text(command.missionId),
    viewerTakeaway: text(command.viewerTakeaway),
    maxCredits: command.maxCredits,
    shots: command.shots.map(stableShot),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function bindGeminiMediaCommandFromRelay(
  request: OperatorRelayRequestV1,
  response: OperatorRelayResponseV1,
): BoundGeminiMediaCommand {
  const completedAtMs = Date.parse(response.completedAt);
  if (!Number.isFinite(completedAtMs)) throw new Error('Gemini media relay completion time is invalid');
  const requestErrors = validateOperatorRelayRequest(request, completedAtMs);
  if (requestErrors.length > 0) throw new Error(`Gemini media relay request invalid: ${requestErrors.join('; ')}`);
  const responseErrors = validateOperatorRelayResponse(response, request);
  if (responseErrors.length > 0) throw new Error(`Gemini media relay response invalid: ${responseErrors.join('; ')}`);
  if (request.toOperator !== 'gemini') throw new Error('Gemini media command must originate from the Gemini relay target');
  if (request.capability !== 'implement') throw new Error('Gemini media command requires the bounded implement capability');
  if (response.status !== 'completed') throw new Error('Gemini media command requires a completed relay response');

  const providerRefs = unique(response.evidenceRefs).filter((ref) => /^provider:gemini:[A-Za-z0-9._:-]{1,200}$/.test(ref));
  if (providerRefs.length !== 1 || unique(response.evidenceRefs).length !== 1) {
    throw new Error('Gemini media command requires exactly one server-bound Gemini provider evidence reference');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(response.answer);
  } catch {
    throw new Error('Gemini media command response must be strict JSON');
  }
  const draft = parseGeminiCommandDraft(raw);
  const identity: Omit<GeminiMediaProductionCommand, 'commandHash'> = {
    contract: GEMINI_MEDIA_COMMAND_CONTRACT,
    issuer: 'gemini-command',
    commandId: draft.commandId,
    projectId: draft.projectId,
    missionId: draft.missionId,
    decision: draft.decision,
    viewerTakeaway: draft.viewerTakeaway,
    maxCredits: draft.maxCredits,
    shots: draft.shots,
    issuedAt: response.completedAt,
  };
  const command: GeminiMediaProductionCommand = {
    ...identity,
    commandHash: geminiMediaCommandHash(identity),
  };
  const receipt: GeminiMediaCommandAuthorityReceipt = {
    contract: GEMINI_MEDIA_COMMAND_AUTHORITY_RECEIPT_CONTRACT,
    commandHash: command.commandHash,
    relayId: request.relayId,
    requestHash: request.requestHash,
    responseHash: response.responseHash,
    providerEvidenceRef: providerRefs[0]!,
    boundAt: response.completedAt,
    authorityScope: 'media-command-only',
    truthAuthority: false,
    externalActionAuthority: false,
    publishAuthority: false,
  };
  const authority: GeminiMediaCommandAuthorityBinding = {
    receipt,
    [GEMINI_MEDIA_AUTHORITY_BINDING]: true,
  };
  return { command, authority, receipt };
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
    if (shot.directive === 'GENERATE' && !['gemini-veo', 'invideo', 'runway'].includes(shot.renderer ?? '')) {
      reasons.push(`generate_renderer_invalid:${shotId}`);
    }
    if ((shot.directive === 'COMPOSITE' || shot.directive === 'EDIT') && shot.renderer !== 'editor-compositor') {
      reasons.push(`editor_renderer_invalid:${shotId}`);
    }
  }
  if (allocatedCredits > command.maxCredits) reasons.push('shot_budget_exceeds_command_budget');
  return unique(reasons);
}

function authorityErrors(input: LeevizeMediaPolicyInput): string[] {
  const reasons: string[] = [];
  const authority = input.commandAuthority;
  if (!authority || authority[GEMINI_MEDIA_AUTHORITY_BINDING] !== true) {
    return ['command_authority_unbound'];
  }
  const receipt = authority.receipt;
  const actualCommandHash = geminiMediaCommandHash(input.command);
  if (receipt.contract !== GEMINI_MEDIA_COMMAND_AUTHORITY_RECEIPT_CONTRACT) reasons.push('command_authority_contract_invalid');
  if (receipt.commandHash !== input.command.commandHash || receipt.commandHash !== actualCommandHash) reasons.push('command_authority_hash_mismatch');
  if (!SHA256.test(receipt.requestHash) || !SHA256.test(receipt.responseHash)) reasons.push('command_authority_relay_hash_invalid');
  if (!/^provider:gemini:[A-Za-z0-9._:-]{1,200}$/.test(receipt.providerEvidenceRef)) reasons.push('command_authority_provider_invalid');
  if (receipt.boundAt !== input.command.issuedAt) reasons.push('command_authority_time_mismatch');
  if (receipt.authorityScope !== 'media-command-only') reasons.push('command_authority_scope_invalid');
  if (receipt.truthAuthority !== false || receipt.externalActionAuthority !== false || receipt.publishAuthority !== false) {
    reasons.push('command_authority_overclaimed');
  }
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

  reasons.push(...authorityErrors(input));
  reasons.push(...commandErrors(command, input.continuity.now));
  if (command.projectId !== input.continuity.projectId) reasons.push('command_project_mismatch');
  if (command.missionId !== input.continuity.missionId) reasons.push('command_mission_mismatch');
  if (!Number.isFinite(input.projectCreditCeiling) || input.projectCreditCeiling < 0) reasons.push('project_budget_invalid');
  else if (command.maxCredits > input.projectCreditCeiling) reasons.push('command_budget_exceeds_project_ceiling');

  if (command.decision === 'HOLD' || command.decision === 'CANCEL') return unique(reasons);

  const executableShots = command.shots.filter((shot) => shot.directive !== 'STOP');
  if (executableShots.length === 0) reasons.push('command_has_no_executable_shots');

  const expectedPlanFingerprint = geminiMediaPlanFingerprint(command);
  const observedPlanFingerprint = text(input.continuity.current.promptFingerprint).toLowerCase();
  if (observedPlanFingerprint !== expectedPlanFingerprint) {
    reasons.push('command_continuity_mismatch');
  }

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
    commandAuthority: 'gemini-command-bound',
    policyAuthority: 'leevize',
    truthReclassificationAllowed: false,
    continuityVerified: continuity.status === 'pass' && continuity.continuityState === 'current',
    releaseDispositionAccepted: disposition === 'EXECUTE' && input.command.decision === 'RELEASE',
    publishAuthorized: false,
  };
}
