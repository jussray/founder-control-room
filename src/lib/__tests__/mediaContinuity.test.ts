import { describe, expect, it } from 'vitest';
import {
  createMediaProofCookie,
  evaluateMediaProofCookie,
  mediaContinuityDigest,
  mediaContinuityOperatorInput,
  mediaProofCookieLabel,
  validateMediaProofCookie,
  type MediaContinuityInput,
} from '../mediaContinuity.js';

const digest = (value: unknown) => mediaContinuityDigest(value);
const MISSION_ID = '167d89a2-f4e5-4670-833d-5650c53142cc';

const baseInput: MediaContinuityInput = {
  source: 'chatgpt',
  projectSlug: 'founder-control-room',
  repositoryFullName: 'jussray/founder-control-room',
  targetBranch: 'main',
  targetSha: 'a'.repeat(40),
  missionId: MISSION_ID,
  intentFingerprint: digest('show what FCR can prove without pretending full launch'),
  subjectFingerprint: digest('founder-control-room-live-action-manifesto'),
  scriptFingerprint: digest('script-v1'),
  promptFingerprint: digest('live-action-direction-v1'),
  sourceAssetFingerprints: [digest('shot-a'), digest('shot-b')],
  intelligenceFingerprint: digest({ layer: 'chatgpt', role: 'reasoning-director' }),
  renderStackFingerprint: digest({ engine: 'local-live-action-stack', mode: 'owned-no-vendor-meter' }),
  runtimeFingerprint: digest({ runtime: 'local', hardware: 'founder-owned' }),
  outputFingerprint: digest('rough-cut-v1'),
  reviewFingerprint: digest({ review: 'truthmode', status: 'reviewed' }),
  authorityFingerprint: digest({ publish: 'not-authorized' }),
  evidenceState: 'edit_verified',
  evidenceRefs: ['local:rough-cut-v1', 'github:truthmode-contract'],
  observedAt: '2026-09-11T23:58:00.000Z',
  expiresAt: '2026-09-12T00:28:00.000Z',
  predecessorFingerprint: null,
};

const NOW = '2026-09-12T00:10:00.000Z';

describe('media continuity proof cookie', () => {
  it('reuses the FCR operator continuity kernel without becoming authority', () => {
    const cookie = createMediaProofCookie(baseInput);
    expect(validateMediaProofCookie(cookie)).toEqual([]);
    expect(cookie).toMatchObject({
      contract: 'founder-control-room/media-continuity@v1',
      kind: 'proof-cookie',
      missionId: MISSION_ID,
      evidenceState: 'edit_verified',
      browserCookie: false,
      actionAuthority: false,
      publishAuthority: false,
      credentialsEmbedded: false,
    });
    expect(cookie.cookieId).toBe(cookie.continuity.fingerprint);
    expect(cookie.cookieId).toMatch(/^[0-9a-f]{64}$/);
    expect(mediaProofCookieLabel(cookie)).toMatch(/^media-proof:edit_verified:[0-9a-f]{12}$/);
  });

  it('requires a real Mission Engine UUID instead of a free-form media slug', () => {
    expect(() => createMediaProofCookie({
      ...baseInput,
      missionId: 'truthmode-live-action-video',
    })).toThrow(/Mission Engine UUID/);
  });

  it('stores fingerprints instead of raw script, prompt, or source media in continuity state', () => {
    const input = mediaContinuityOperatorInput(baseInput);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('script-v1');
    expect(serialized).not.toContain('live-action-direction-v1');
    expect(serialized).not.toContain('shot-a');
    expect(serialized).not.toContain('shot-b');
    expect(input.scopeFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(input.proofFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(input.providerFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the cookie current across observer/provenance refresh when bound reality is unchanged', () => {
    const cookie = createMediaProofCookie(baseInput);
    const result = evaluateMediaProofCookie(cookie, {
      ...baseInput,
      source: 'work',
      evidenceRefs: ['local:rough-cut-v1', 'github:truthmode-contract', 'review:second-look'],
      observedAt: '2026-09-12T00:05:00.000Z',
      expiresAt: '2026-09-12T00:35:00.000Z',
      predecessorFingerprint: cookie.cookieId,
    }, NOW);
    expect(result).toEqual({
      state: 'current',
      reasons: [],
      reacquireRequired: false,
      continuityMayAuthorizeAction: false,
      cookieMayAuthorizeAction: false,
      cookieMayAuthorizePublish: false,
    });
  });

  it('rejects a cookie from another mission even when every other dimension matches', () => {
    const cookie = createMediaProofCookie(baseInput);
    const result = evaluateMediaProofCookie(cookie, {
      ...baseInput,
      missionId: '11111111-1111-4111-8111-111111111111',
    }, NOW);
    expect(result.state).toBe('invalid');
    expect(result.reacquireRequired).toBe(true);
    expect(result.cookieMayAuthorizeAction).toBe(false);
    expect(result.cookieMayAuthorizePublish).toBe(false);
  });

  it.each([
    ['intent', { intentFingerprint: digest('new-intent') }, 'scope_moved'],
    ['subject', { subjectFingerprint: digest('new-subject') }, 'scope_moved'],
    ['script', { scriptFingerprint: digest('script-v2') }, 'scope_moved'],
    ['prompt', { promptFingerprint: digest('direction-v2') }, 'scope_moved'],
    ['source asset', { sourceAssetFingerprints: [digest('shot-a'), digest('shot-c')] }, 'scope_moved'],
    ['intelligence layer', { intelligenceFingerprint: digest({ layer: 'gpt-oss', role: 'fallback' }) }, 'provider_moved'],
    ['render stack', { renderStackFingerprint: digest({ engine: 'ltx-local', model: 'new-model' }) }, 'provider_moved'],
    ['runtime', { runtimeFingerprint: digest({ runtime: 'different-machine' }) }, 'runtime_moved'],
    ['output', { outputFingerprint: digest('final-export-v2') }, 'proof_moved'],
    ['evidence state', { evidenceState: 'export_verified' as const }, 'proof_moved'],
    ['review', { reviewFingerprint: digest({ review: 'truthmode', status: 'changed' }) }, 'review_moved'],
    ['authority context', { authorityFingerprint: digest({ publish: 'explicitly-approved' }) }, 'authority_moved'],
  ])('marks the prior cookie stale when %s changes', (_label, change, reason) => {
    const cookie = createMediaProofCookie(baseInput);
    const result = evaluateMediaProofCookie(cookie, { ...baseInput, ...change }, NOW);
    expect(result.state).toBe('stale');
    expect(result.reasons).toContain(reason);
    expect(result.reacquireRequired).toBe(true);
    expect(result.cookieMayAuthorizeAction).toBe(false);
    expect(result.cookieMayAuthorizePublish).toBe(false);
  });

  it('expires stale instead of renewing itself or carrying authority forward', () => {
    const cookie = createMediaProofCookie(baseInput);
    const result = evaluateMediaProofCookie(cookie, baseInput, '2026-09-12T00:28:00.001Z');
    expect(result.state).toBe('stale');
    expect(result.reasons).toContain('receipt_expired');
    expect(result.reacquireRequired).toBe(true);
    expect(result.cookieMayAuthorizeAction).toBe(false);
    expect(result.cookieMayAuthorizePublish).toBe(false);
  });

  it('rejects forged browser/publish authority flags', () => {
    const cookie = createMediaProofCookie(baseInput);
    const forged = { ...cookie, browserCookie: true, publishAuthority: true } as unknown as typeof cookie;
    expect(validateMediaProofCookie(forged)).toEqual(expect.arrayContaining([
      'media proof cookie must never become a browser cookie',
      'media proof cookie cannot authorize publishing',
    ]));
    expect(evaluateMediaProofCookie(forged, baseInput, NOW).state).toBe('invalid');
  });
});
