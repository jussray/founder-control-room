import { describe, expect, it } from 'vitest';
import {
  createMediaProofCookie,
  mediaContinuityDigest,
  type MediaContinuityInput,
} from '../mediaContinuity.js';
import {
  bindGeminiMediaCommandFromRelay,
  evaluateGeminiMediaProductionCommand,
  geminiMediaPlanFingerprint,
  type BoundGeminiMediaCommand,
  type GeminiMediaCommandAuthorityBinding,
  type GeminiMediaProductionCommandDraft,
  type LeevizeMediaClaimSnapshot,
  type LeevizeMediaPolicyInput,
} from '../mediaProductionAuthority.js';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

const PROJECT_ID = '959a5532-da31-4bc8-af28-508ef1a2b640';
const MISSION_ID = '167d89a2-f4e5-4670-833d-5650c53142cc';
const HEAD = 'a'.repeat(40);
const NOW = '2026-09-18T22:00:00.000Z';
const digest = (value: unknown) => mediaContinuityDigest(value);

function mediaState(
  evidenceState: MediaContinuityInput['evidenceState'] = 'script_verified',
  overrides: Partial<MediaContinuityInput> = {},
): MediaContinuityInput {
  return {
    source: 'chatgpt',
    projectSlug: 'founder-control-room',
    repositoryFullName: 'jussray/founder-control-room',
    targetBranch: 'main',
    targetSha: HEAD,
    missionId: MISSION_ID,
    intentFingerprint: digest('gemini-front-door'),
    subjectFingerprint: digest('fcr-founder-video'),
    scriptFingerprint: digest('script-v2'),
    promptFingerprint: digest('unbound-plan'),
    sourceAssetFingerprints: evidenceState === 'script_verified' ? [] : [digest('shot-source')],
    intelligenceFingerprint: digest({ layer: 'gemini-command' }),
    renderStackFingerprint: digest({ renderers: ['gemini-veo', 'invideo', 'runtime-capture'] }),
    runtimeFingerprint: digest({ runtime: 'planning' }),
    outputFingerprint: ['edit_verified', 'export_verified'].includes(evidenceState) ? digest('master-output') : null,
    reviewFingerprint: digest({ review: 'leevize-policy' }),
    authorityFingerprint: digest({ publish: false, externalWrite: false }),
    evidenceState,
    evidenceRefs: ['github:media-contract', 'runtime:fcr-proof'],
    observedAt: '2026-09-18T21:50:00.000Z',
    expiresAt: '2026-09-18T22:30:00.000Z',
    predecessorFingerprint: null,
    ...overrides,
  };
}

function commandDraft(
  overrides: Partial<GeminiMediaProductionCommandDraft> = {},
): GeminiMediaProductionCommandDraft {
  return {
    commandId: 'gpc-fcr-launch-001',
    projectId: PROJECT_ID,
    missionId: MISSION_ID,
    decision: 'AUTHORIZE_PRODUCTION',
    viewerTakeaway: 'FCR turns fragmented operating evidence into a founder decision surface.',
    maxCredits: 12,
    shots: [{
      shotId: 'FCR-01',
      directive: 'GENERATE',
      renderer: 'gemini-veo',
      purpose: 'Establish founder overload without inventing product UI.',
      maxAttempts: 2,
      creditCeiling: 4,
      claimBindings: [{ claimId: 'claim-current', channel: 'implied', presentation: 'FACT' }],
      requiredEvidenceRefs: ['runtime:fcr-proof'],
      strictCanonFingerprints: [digest('fcr-brand-v2')],
    }],
    ...overrides,
  };
}

function relayRequest(relayId = 'relay-gemini-media-command-001'): OperatorRelayRequestV1 {
  const summary = 'Create a bounded Gemini media production command under the current FCR evidence and canon envelope.';
  const sourceRef = 'test:media-production-authority';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId,
    fromOperator: 'codex',
    toOperator: 'gemini',
    capability: 'implement',
    goal: 'Return the production command as strict JSON.',
    context: {
      summary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(summary, sourceRef),
    },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: 'internal',
    createdAt: '2026-09-18T21:50:00.000Z',
    expiresAt: '2026-09-18T22:10:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

let bindingCounter = 0;
function boundCommand(
  overrides: Partial<GeminiMediaProductionCommandDraft> = {},
): BoundGeminiMediaCommand {
  bindingCounter += 1;
  const request = relayRequest(`relay-gemini-media-command-${bindingCounter}`);
  const response = buildOperatorRelayResponse(request, {
    answer: JSON.stringify(commandDraft(overrides)),
    evidenceRefs: [`provider:gemini:gemini-media-test-${bindingCounter}`],
    completedAt: '2026-09-18T21:55:00.000Z',
  });
  return bindGeminiMediaCommandFromRelay(request, response);
}

function claim(overrides: Partial<LeevizeMediaClaimSnapshot> = {}): LeevizeMediaClaimSnapshot {
  return {
    claimId: 'claim-current',
    state: 'VERIFIED',
    evidenceRefs: ['runtime:fcr-proof'],
    targetSha: HEAD,
    claimFingerprint: digest('claim-current'),
    observedAt: '2026-09-18T21:50:00.000Z',
    expiresAt: '2026-09-18T22:30:00.000Z',
    ...overrides,
  };
}

function boundMediaState(
  bound: BoundGeminiMediaCommand,
  evidenceState: MediaContinuityInput['evidenceState'] = 'script_verified',
  overrides: Partial<MediaContinuityInput> = {},
): MediaContinuityInput {
  return mediaState(evidenceState, {
    promptFingerprint: geminiMediaPlanFingerprint(bound.command),
    ...overrides,
  });
}

function input(
  overrides: Partial<LeevizeMediaPolicyInput> = {},
  bound: BoundGeminiMediaCommand = boundCommand(),
): LeevizeMediaPolicyInput {
  const current = boundMediaState(bound);
  const cookie = createMediaProofCookie(current);
  return {
    command: bound.command,
    commandAuthority: bound.authority,
    continuity: {
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie,
      current,
      now: NOW,
    },
    claims: [claim()],
    currentEvidenceRefs: ['runtime:fcr-proof'],
    currentCanonFingerprints: [digest('fcr-brand-v2')],
    projectCreditCeiling: 20,
    verificationFailures: [],
    ...overrides,
  };
}

describe('Gemini command + /LEEVIZE policy boundary', () => {
  it('lets a provider-bound Gemini command authorize its exact production plan without granting truth or publish authority', () => {
    const result = evaluateGeminiMediaProductionCommand(input());

    expect(result).toMatchObject({
      disposition: 'EXECUTE',
      decision: 'AUTHORIZE_PRODUCTION',
      commandAuthority: 'gemini-command-bound',
      policyAuthority: 'leevize',
      truthReclassificationAllowed: false,
      continuityVerified: true,
      releaseDispositionAccepted: false,
      publishAuthorized: false,
    });
    expect(result.reasons).toEqual([]);
  });

  it('rejects a self-declared command when no provider-bound authority exists', () => {
    const bound = boundCommand();
    const unbound = {
      ...input({}, bound),
      commandAuthority: undefined,
    } as unknown as LeevizeMediaPolicyInput;

    const result = evaluateGeminiMediaProductionCommand(unbound);
    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toContain('command_authority_unbound');
  });

  it('rejects a copied serialized receipt disguised as command authority', () => {
    const bound = boundCommand();
    const forged = {
      ...input({}, bound),
      commandAuthority: { receipt: bound.receipt } as unknown as GeminiMediaCommandAuthorityBinding,
    };

    const result = evaluateGeminiMediaProductionCommand(forged);
    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toContain('command_authority_unbound');
  });

  it('applies the same truth gate to Gemini/Veo and InVideo renders', () => {
    const staleClaim = claim({ state: 'UNKNOWN', evidenceRefs: [] });
    const base = commandDraft();
    const bound = boundCommand({
      shots: [
        { ...base.shots[0]!, shotId: 'VEO', renderer: 'gemini-veo' },
        { ...base.shots[0]!, shotId: 'INVIDEO', renderer: 'invideo' },
      ],
    });

    const result = evaluateGeminiMediaProductionCommand(input({ claims: [staleClaim] }, bound));

    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'claim_not_presentable:VEO:claim-current:UNKNOWN:FACT',
      'claim_not_presentable:INVIDEO:claim-current:UNKNOWN:FACT',
    ]));
  });

  it('allows an inferred claim only when Gemini presents it as qualified', () => {
    const inferred = claim({ state: 'INFERRED', evidenceRefs: [] });
    const base = commandDraft();
    const bound = boundCommand({
      shots: base.shots.map((shot) => ({
        ...shot,
        claimBindings: [{ claimId: 'claim-current', channel: 'spoken', presentation: 'QUALIFIED' }],
      })),
    });

    expect(evaluateGeminiMediaProductionCommand(input({ claims: [inferred] }, bound)).disposition).toBe('EXECUTE');
  });

  it('blocks stale continuity, stale claim heads, canon drift, and budget overrun as separate receipts', () => {
    const bound = boundCommand();
    const original = boundMediaState(bound);
    const cookie = createMediaProofCookie(original);
    const changed = boundMediaState(bound, 'script_verified', { scriptFingerprint: digest('changed-script') });
    const result = evaluateGeminiMediaProductionCommand(input({
      continuity: {
        projectId: PROJECT_ID,
        missionId: MISSION_ID,
        expectedHeadSha: HEAD,
        cookie,
        current: changed,
        now: NOW,
      },
      claims: [claim({ targetSha: 'b'.repeat(40) })],
      currentCanonFingerprints: [digest('different-canon')],
      projectCreditCeiling: 2,
    }, bound));

    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'media_continuity_not_current',
      'continuity:scope_moved',
      'claim_head_stale:FCR-01:claim-current',
      `canon_not_current:FCR-01:${digest('fcr-brand-v2')}`,
      'command_budget_exceeds_project_ceiling',
    ]));
  });

  it('rejects command tampering instead of treating a fingerprint or prior binding as authority', () => {
    const bound = boundCommand();
    const tampered = { ...bound.command, maxCredits: 999 };
    const result = evaluateGeminiMediaProductionCommand(input({ command: tampered }, bound));
    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'command_hash_invalid',
      'command_authority_hash_mismatch',
      'command_continuity_mismatch',
    ]));
  });

  it('accepts Gemini RELEASE only for the exact export-verified production plan with clean verification', () => {
    const bound = boundCommand({ decision: 'RELEASE' });
    const script = boundMediaState(bound);
    const scriptCookie = createMediaProofCookie(script);
    const shots = boundMediaState(bound, 'shot_generated', {
      predecessorFingerprint: scriptCookie.cookieId,
    });
    const shotsCookie = createMediaProofCookie(shots);
    const edit = boundMediaState(bound, 'edit_verified', {
      predecessorFingerprint: shotsCookie.cookieId,
    });
    const editCookie = createMediaProofCookie(edit);
    const exported = boundMediaState(bound, 'export_verified', {
      predecessorFingerprint: editCookie.cookieId,
    });
    const exportCookie = createMediaProofCookie(exported);

    const clean = evaluateGeminiMediaProductionCommand(input({
      continuity: {
        projectId: PROJECT_ID,
        missionId: MISSION_ID,
        expectedHeadSha: HEAD,
        cookie: exportCookie,
        current: exported,
        predecessorCookie: editCookie,
        now: NOW,
      },
    }, bound));
    expect(clean).toMatchObject({
      disposition: 'EXECUTE',
      releaseDispositionAccepted: true,
      publishAuthorized: false,
    });

    const failed = evaluateGeminiMediaProductionCommand(input({
      continuity: {
        projectId: PROJECT_ID,
        missionId: MISSION_ID,
        expectedHeadSha: HEAD,
        cookie: exportCookie,
        current: exported,
        predecessorCookie: editCookie,
        now: NOW,
      },
      verificationFailures: ['ui_legibility'],
    }, bound));
    expect(failed.disposition).toBe('BLOCK');
    expect(failed.reasons).toContain('verification_failed:ui_legibility');
  });

  it('blocks a valid RELEASE command from borrowing continuity and export proof from another production plan', () => {
    const release = boundCommand({ decision: 'RELEASE' });
    const otherPlan = boundCommand({
      viewerTakeaway: 'A different story with a different viewer belief.',
    });
    const edit = boundMediaState(otherPlan, 'edit_verified');
    const editCookie = createMediaProofCookie(edit);
    const exported = boundMediaState(otherPlan, 'export_verified', {
      predecessorFingerprint: editCookie.cookieId,
    });
    const exportCookie = createMediaProofCookie(exported);

    const result = evaluateGeminiMediaProductionCommand(input({
      continuity: {
        projectId: PROJECT_ID,
        missionId: MISSION_ID,
        expectedHeadSha: HEAD,
        cookie: exportCookie,
        current: exported,
        predecessorCookie: editCookie,
        now: NOW,
      },
    }, release));

    expect(result.disposition).toBe('BLOCK');
    expect(result.reasons).toContain('command_continuity_mismatch');
    expect(result.releaseDispositionAccepted).toBe(false);
  });

  it('blocks action dispositions with no executable shots while HOLD remains safe', () => {
    const empty = boundCommand({ maxCredits: 0, shots: [] });
    const blocked = evaluateGeminiMediaProductionCommand(input({}, empty));
    expect(blocked.disposition).toBe('BLOCK');
    expect(blocked.reasons).toContain('command_has_no_executable_shots');

    const hold = boundCommand({ decision: 'HOLD', maxCredits: 0, shots: [] });
    const original = mediaState();
    const cookie = createMediaProofCookie(original);
    const changed = mediaState('script_verified', { scriptFingerprint: digest('stale-after-hold') });
    const result = evaluateGeminiMediaProductionCommand(input({
      continuity: {
        projectId: PROJECT_ID,
        missionId: MISSION_ID,
        expectedHeadSha: HEAD,
        cookie,
        current: changed,
        now: NOW,
      },
    }, hold));

    expect(result.disposition).toBe('EXECUTE');
    expect(result.decision).toBe('HOLD');
    expect(result.publishAuthorized).toBe(false);
  });
});
