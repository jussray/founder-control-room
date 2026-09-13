import { describe, expect, it } from 'vitest';
import {
  createMediaProofCookie,
  mediaContinuityDigest,
  type MediaContinuityInput,
} from '../mediaContinuity.js';
import { evaluateMediaMissionContinuity } from '../mediaMissionContinuity.js';

const PROJECT_ID = '959a5532-da31-4bc8-af28-508ef1a2b640';
const MISSION_ID = '167d89a2-f4e5-4670-833d-5650c53142cc';
const HEAD = 'a'.repeat(40);
const NOW = '2026-09-12T00:20:00.000Z';
const digest = (value: unknown) => mediaContinuityDigest(value);

function scriptState(overrides: Partial<MediaContinuityInput> = {}): MediaContinuityInput {
  return {
    source: 'chatgpt',
    projectSlug: 'founder-control-room',
    repositoryFullName: 'jussray/founder-control-room',
    targetBranch: 'main',
    targetSha: HEAD,
    missionId: MISSION_ID,
    intentFingerprint: digest('truthmode-live-action-founder-video'),
    subjectFingerprint: digest('fcr-founder-video'),
    scriptFingerprint: digest('script-v1'),
    promptFingerprint: digest('live-action-direction-v1'),
    sourceAssetFingerprints: [],
    intelligenceFingerprint: digest({ layer: 'chatgpt', role: 'reasoning-director' }),
    renderStackFingerprint: digest({ state: 'not-selected' }),
    runtimeFingerprint: digest({ runtime: 'planning' }),
    outputFingerprint: null,
    reviewFingerprint: digest({ review: 'truthmode', status: 'script-reviewed' }),
    authorityFingerprint: digest({ publish: false, sendExternal: false }),
    evidenceState: 'script_verified',
    evidenceRefs: ['github:truthmode-contract', 'fcr:founder-intent'],
    observedAt: '2026-09-12T00:10:00.000Z',
    expiresAt: '2026-09-12T00:40:00.000Z',
    predecessorFingerprint: null,
    ...overrides,
  };
}

describe('media mission continuity gate', () => {
  it('turns a current script cookie into mission-scoped continuity evidence without outcome or publish authority', () => {
    const current = scriptState();
    const cookie = createMediaProofCookie(current);
    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie,
      current,
      now: NOW,
    });

    expect(result).toMatchObject({
      status: 'pass',
      continuityState: 'current',
      missionId: MISSION_ID,
      evidenceState: 'script_verified',
      continuityVerified: true,
      outcomeVerified: false,
      publishAuthorized: false,
      nextStage: 'shot_generated',
    });
    expect(result.evidence).toMatchObject({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      kind: 'media_continuity',
      status: 'pass',
      provider: 'control-room',
      commitSha: HEAD,
    });
  });

  it('allows same-stage reacquisition when a revised script points to the predecessor cookie', () => {
    const first = scriptState();
    const firstCookie = createMediaProofCookie(first);
    const revised = scriptState({
      scriptFingerprint: digest('script-v2'),
      observedAt: '2026-09-12T00:15:00.000Z',
      expiresAt: '2026-09-12T00:45:00.000Z',
      predecessorFingerprint: firstCookie.cookieId,
    });
    const revisedCookie = createMediaProofCookie(revised);

    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie: revisedCookie,
      current: revised,
      predecessorCookie: firstCookie,
      now: NOW,
    });

    expect(result.status).toBe('pass');
    expect(result.continuityVerified).toBe(true);
    expect(result.publishAuthorized).toBe(false);
  });

  it('allows the next stage only when the prior stage cookie is chained and source assets are fingerprinted', () => {
    const script = scriptState();
    const scriptCookie = createMediaProofCookie(script);
    const shots = scriptState({
      evidenceState: 'shot_generated',
      sourceAssetFingerprints: [digest('shot-001'), digest('shot-002')],
      renderStackFingerprint: digest({ capture: 'live-action-iphone' }),
      runtimeFingerprint: digest({ runtime: 'capture-session-1' }),
      observedAt: '2026-09-12T00:16:00.000Z',
      expiresAt: '2026-09-12T00:46:00.000Z',
      predecessorFingerprint: scriptCookie.cookieId,
    });
    const shotsCookie = createMediaProofCookie(shots);

    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie: shotsCookie,
      current: shots,
      predecessorCookie: scriptCookie,
      now: NOW,
    });

    expect(result.status).toBe('pass');
    expect(result.evidenceState).toBe('shot_generated');
    expect(result.nextStage).toBe('edit_verified');
  });

  it('blocks a skipped stage instead of accepting a fresh export cookie with missing lineage', () => {
    const script = scriptState();
    const scriptCookie = createMediaProofCookie(script);
    const exportState = scriptState({
      evidenceState: 'export_verified',
      sourceAssetFingerprints: [digest('shot-001')],
      outputFingerprint: digest('final-export'),
      renderStackFingerprint: digest({ editor: 'imovie' }),
      runtimeFingerprint: digest({ runtime: 'export-session' }),
      reviewFingerprint: digest({ review: 'truthmode', status: 'export-reviewed' }),
      predecessorFingerprint: scriptCookie.cookieId,
    });
    const exportCookie = createMediaProofCookie(exportState);

    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie: exportCookie,
      current: exportState,
      predecessorCookie: scriptCookie,
      now: NOW,
    });

    expect(result.status).toBe('blocked');
    expect(result.evidence).toBeNull();
    expect(result.reasons).toContain('media evidence stage cannot skip a proof-cookie gate');
    expect(result.outcomeVerified).toBe(false);
    expect(result.publishAuthorized).toBe(false);
  });

  it('blocks stale reality and emits no mission evidence', () => {
    const original = scriptState();
    const cookie = createMediaProofCookie(original);
    const changed = scriptState({ scriptFingerprint: digest('script-changed-after-cookie') });

    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie,
      current: changed,
      now: NOW,
    });

    expect(result.status).toBe('blocked');
    expect(result.continuityState).toBe('stale');
    expect(result.evidence).toBeNull();
    expect(result.reasons).toContain('scope_moved');
  });

  it('blocks a cookie and current state that are not bound to the mission exact head', () => {
    const current = scriptState({ targetSha: 'b'.repeat(40) });
    const cookie = createMediaProofCookie(current);
    const result = evaluateMediaMissionContinuity({
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie,
      current,
      now: NOW,
    });

    expect(result.status).toBe('blocked');
    expect(result.continuityState).toBe('not-evaluated');
    expect(result.evidence).toBeNull();
    expect(result.reasons).toEqual(expect.arrayContaining([
      'current media state is not bound to the mission exact head',
      'cookie is not bound to the mission exact head',
    ]));
  });
});
