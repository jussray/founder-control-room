import type { EvidenceRecord } from '../reconciliation/types.js';
import {
  MEDIA_EVIDENCE_STATES,
  evaluateMediaProofCookie,
  mediaProofCookieLabel,
  validateMediaProofCookie,
  type MediaContinuityInput,
  type MediaEvidenceState,
  type MediaProofCookie,
} from './mediaContinuity.js';

export const MEDIA_MISSION_CONTINUITY_CONTRACT = 'founder-control-room/media-mission-continuity@v1' as const;
export const MEDIA_MISSION_EVIDENCE_KIND = 'media_continuity' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface MediaMissionContinuityGateInput {
  projectId: string;
  missionId: string;
  expectedHeadSha: string;
  cookie: MediaProofCookie;
  current: MediaContinuityInput;
  predecessorCookie?: MediaProofCookie | null;
  now: string;
}

export interface MediaMissionContinuityGateResult {
  contract: typeof MEDIA_MISSION_CONTINUITY_CONTRACT;
  status: 'pass' | 'blocked';
  continuityState: 'current' | 'stale' | 'invalid' | 'not-evaluated';
  missionId: string;
  evidenceState: MediaEvidenceState;
  cookieLabel: string;
  evidence: EvidenceRecord | null;
  reasons: string[];
  nextStage: MediaEvidenceState | null;
  continuityVerified: boolean;
  outcomeVerified: false;
  publishAuthorized: false;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function stageIndex(stage: MediaEvidenceState): number {
  return MEDIA_EVIDENCE_STATES.indexOf(stage);
}

function nextStage(stage: MediaEvidenceState): MediaEvidenceState | null {
  const index = stageIndex(stage);
  return MEDIA_EVIDENCE_STATES[index + 1] ?? null;
}

function materialBlockers(input: MediaContinuityInput): string[] {
  const blockers: string[] = [];

  if (input.evidenceState === 'script_verified' && !input.reviewFingerprint) {
    blockers.push('script_verified requires a review fingerprint');
  }

  if (['shot_generated', 'edit_verified', 'export_verified'].includes(input.evidenceState)
    && input.sourceAssetFingerprints.length === 0) {
    blockers.push(`${input.evidenceState} requires at least one source asset fingerprint`);
  }

  if (['edit_verified', 'export_verified'].includes(input.evidenceState) && !input.outputFingerprint) {
    blockers.push(`${input.evidenceState} requires an output fingerprint`);
  }

  if (['edit_verified', 'export_verified'].includes(input.evidenceState) && !input.reviewFingerprint) {
    blockers.push(`${input.evidenceState} requires a review fingerprint`);
  }

  return blockers;
}

function predecessorBlockers(
  current: MediaContinuityInput,
  predecessor: MediaProofCookie | null | undefined,
): string[] {
  if (!predecessor) {
    return current.evidenceState === 'script_verified'
      ? []
      : [`${current.evidenceState} requires a predecessor media proof cookie`];
  }

  const blockers = validateMediaProofCookie(predecessor).map((reason) => `predecessor cookie: ${reason}`);
  if (predecessor.missionId !== current.missionId) blockers.push('predecessor cookie belongs to a different mission');
  if (current.predecessorFingerprint !== predecessor.cookieId) {
    blockers.push('current predecessor fingerprint does not match predecessor cookie');
  }

  const priorIndex = stageIndex(predecessor.evidenceState);
  const currentIndex = stageIndex(current.evidenceState);
  if (priorIndex > currentIndex) blockers.push('media evidence stage cannot move backward');
  if (currentIndex - priorIndex > 1) blockers.push('media evidence stage cannot skip a proof-cookie gate');

  return blockers;
}

/**
 * Evaluate one mission-bound media cookie and, only when current, translate it
 * into FCR mission evidence. This proves continuity of the bound media state,
 * not that a render was published or that an external audience outcome occurred.
 */
export function evaluateMediaMissionContinuity(
  input: MediaMissionContinuityGateInput,
): MediaMissionContinuityGateResult {
  const reasons: string[] = [];
  const missionId = text(input.missionId);
  const expectedHeadSha = text(input.expectedHeadSha).toLowerCase();
  const cookieLabel = mediaProofCookieLabel(input.cookie);

  if (!UUID.test(text(input.projectId))) reasons.push('projectId must be a UUID');
  if (!UUID.test(missionId)) reasons.push('missionId must be a UUID');
  if (!FULL_SHA.test(expectedHeadSha)) reasons.push('expectedHeadSha must be a full 40-character Git SHA');
  if (input.cookie.missionId !== missionId) reasons.push('cookie missionId does not match mission');
  if (input.current.missionId !== missionId) reasons.push('current media state missionId does not match mission');
  if (text(input.current.targetSha).toLowerCase() !== expectedHeadSha) {
    reasons.push('current media state is not bound to the mission exact head');
  }
  if (text(input.cookie.continuity.targetSha).toLowerCase() !== expectedHeadSha) {
    reasons.push('cookie is not bound to the mission exact head');
  }

  reasons.push(...materialBlockers(input.current));
  reasons.push(...predecessorBlockers(input.current, input.predecessorCookie));

  if (reasons.length > 0) {
    return {
      contract: MEDIA_MISSION_CONTINUITY_CONTRACT,
      status: 'blocked',
      continuityState: 'not-evaluated',
      missionId,
      evidenceState: input.current.evidenceState,
      cookieLabel,
      evidence: null,
      reasons: unique(reasons),
      nextStage: nextStage(input.current.evidenceState),
      continuityVerified: false,
      outcomeVerified: false,
      publishAuthorized: false,
    };
  }

  const continuity = evaluateMediaProofCookie(input.cookie, input.current, input.now);
  if (continuity.state !== 'current') {
    return {
      contract: MEDIA_MISSION_CONTINUITY_CONTRACT,
      status: 'blocked',
      continuityState: continuity.state,
      missionId,
      evidenceState: input.current.evidenceState,
      cookieLabel,
      evidence: null,
      reasons: unique(continuity.reasons.length > 0 ? continuity.reasons : ['media continuity is not current']),
      nextStage: nextStage(input.current.evidenceState),
      continuityVerified: false,
      outcomeVerified: false,
      publishAuthorized: false,
    };
  }

  return {
    contract: MEDIA_MISSION_CONTINUITY_CONTRACT,
    status: 'pass',
    continuityState: 'current',
    missionId,
    evidenceState: input.current.evidenceState,
    cookieLabel,
    evidence: {
      projectId: text(input.projectId),
      missionId,
      subject: `media-continuity:${input.current.evidenceState}`,
      kind: MEDIA_MISSION_EVIDENCE_KIND,
      status: 'pass',
      provider: 'control-room',
      commitSha: expectedHeadSha,
      detailsRef: cookieLabel,
    },
    reasons: [],
    nextStage: nextStage(input.current.evidenceState),
    continuityVerified: true,
    outcomeVerified: false,
    publishAuthorized: false,
  };
}
