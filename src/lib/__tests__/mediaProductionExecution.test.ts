import { describe, expect, it, vi } from 'vitest';
import {
  createMediaProofCookie,
  mediaContinuityDigest,
  type MediaContinuityInput,
} from '../mediaContinuity.js';
import {
  bindGeminiMediaCommandFromRelay,
  type BoundGeminiMediaCommand,
  type GeminiMediaProductionCommandDraft,
  type LeevizeMediaClaimSnapshot,
  type LeevizeMediaPolicyInput,
} from '../mediaProductionAuthority.js';
import {
  executeGeminiMediaProductionPlan,
  type MediaRendererAdapter,
} from '../mediaProductionExecution.js';
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
const NOW = new Date('2026-09-18T22:00:00.000Z');
const digest = (value: unknown) => mediaContinuityDigest(value);

function mediaState(overrides: Partial<MediaContinuityInput> = {}): MediaContinuityInput {
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
    promptFingerprint: digest('gemini-command-v1'),
    sourceAssetFingerprints: [],
    intelligenceFingerprint: digest({ layer: 'gemini-command' }),
    renderStackFingerprint: digest({ renderers: ['gemini-veo', 'invideo', 'runtime-capture'] }),
    runtimeFingerprint: digest({ runtime: 'planning' }),
    outputFingerprint: null,
    reviewFingerprint: digest({ review: 'leevize-policy' }),
    authorityFingerprint: digest({ publish: false, externalWrite: false }),
    evidenceState: 'script_verified',
    evidenceRefs: ['runtime:fcr-proof'],
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
    shots: [
      {
        shotId: 'FCR-01',
        directive: 'GENERATE',
        renderer: 'gemini-veo',
        purpose: 'Establish founder overload without inventing product UI.',
        maxAttempts: 2,
        creditCeiling: 4,
        claimBindings: [{ claimId: 'claim-current', channel: 'implied', presentation: 'FACT' }],
        requiredEvidenceRefs: ['runtime:fcr-proof'],
        strictCanonFingerprints: [digest('fcr-brand-v2')],
      },
      {
        shotId: 'FCR-02',
        directive: 'GENERATE',
        renderer: 'invideo',
        purpose: 'Create non-product contextual motion around the founder workflow.',
        maxAttempts: 2,
        creditCeiling: 4,
        claimBindings: [{ claimId: 'claim-current', channel: 'visual', presentation: 'FACT' }],
        requiredEvidenceRefs: ['runtime:fcr-proof'],
        strictCanonFingerprints: [digest('fcr-brand-v2')],
      },
    ],
    ...overrides,
  };
}

function relayRequest(): OperatorRelayRequestV1 {
  const summary = 'Return a strict JSON Gemini media command for the already-evidenced FCR video mission.';
  const sourceRef = 'test:media-production-execution';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-gemini-media-exec-001',
    fromOperator: 'codex',
    toOperator: 'gemini',
    capability: 'implement',
    goal: 'Produce the bounded media production command.',
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

function boundCommand(
  overrides: Partial<GeminiMediaProductionCommandDraft> = {},
): BoundGeminiMediaCommand {
  const request = relayRequest();
  const response = buildOperatorRelayResponse(request, {
    answer: JSON.stringify(commandDraft(overrides)),
    evidenceRefs: ['provider:gemini:gemini-media-exec-001'],
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

function policyInput(
  bound: BoundGeminiMediaCommand = boundCommand(),
  overrides: Partial<LeevizeMediaPolicyInput> = {},
): LeevizeMediaPolicyInput {
  const current = mediaState();
  return {
    command: bound.command,
    commandAuthority: bound.authority,
    continuity: {
      projectId: PROJECT_ID,
      missionId: MISSION_ID,
      expectedHeadSha: HEAD,
      cookie: createMediaProofCookie(current),
      current,
      now: NOW.toISOString(),
    },
    claims: [claim()],
    currentEvidenceRefs: ['runtime:fcr-proof'],
    currentCanonFingerprints: [digest('fcr-brand-v2')],
    projectCreditCeiling: 20,
    verificationFailures: [],
    ...overrides,
  };
}

function success(output: string, evidenceRef: string, credits = 1) {
  return {
    status: 'SUCCEEDED' as const,
    attempts: 1,
    creditsConsumed: credits,
    outputFingerprint: digest(output),
    providerEvidenceRefs: [evidenceRef],
  };
}

describe('executeGeminiMediaProductionPlan', () => {
  it('executes each approved shot through only its selected renderer and returns non-authoritative receipts', async () => {
    const veo = vi.fn(async () => success('veo-output', 'provider:veo:clip-001', 2));
    const invideo = vi.fn(async () => success('invideo-output', 'provider:invideo:clip-002', 3));

    const result = await executeGeminiMediaProductionPlan(
      policyInput(),
      { 'gemini-veo': veo, invideo },
      { now: () => NOW },
    );

    expect(result).toMatchObject({
      status: 'EXECUTED',
      truthAuthority: false,
      publishAuthorized: false,
      creditsConsumed: 5,
    });
    expect(result.executionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts.every((receipt) => receipt.outcome === 'SUCCEEDED')).toBe(true);
    expect(result.receipts.every((receipt) => receipt.truthAuthority === false && receipt.publishAuthority === false)).toBe(true);

    expect(veo).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'FCR-01',
      renderer: 'gemini-veo',
      creditCeiling: 4,
      expectedHeadSha: HEAD,
      claimIds: ['claim-current'],
    }));
    expect(invideo).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'FCR-02',
      renderer: 'invideo',
      creditCeiling: 4,
      expectedHeadSha: HEAD,
    }));
  });

  it('preflights all required renderer adapters and creates a separate receipt for each unavailable shot before any side effect', async () => {
    const veo = vi.fn<MediaRendererAdapter>();
    const invideo = vi.fn<MediaRendererAdapter>();

    const result = await executeGeminiMediaProductionPlan(
      policyInput(),
      {},
      { now: () => NOW },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.receipts).toEqual([
      expect.objectContaining({ shotId: 'FCR-01', outcome: 'BLOCKED', failureCode: 'renderer_unavailable' }),
      expect.objectContaining({ shotId: 'FCR-02', outcome: 'BLOCKED', failureCode: 'renderer_unavailable' }),
    ]);
    expect(veo).not.toHaveBeenCalled();
    expect(invideo).not.toHaveBeenCalled();
  });

  it('redacts adapter exception details and refuses to claim success without provider evidence', async () => {
    const secret = 'provider-key-that-must-not-escape';
    const veo = vi.fn(async () => {
      throw new Error(`transport failed with ${secret}`);
    });
    const invideo = vi.fn(async () => success('unused', 'provider:invideo:unused'));

    const result = await executeGeminiMediaProductionPlan(
      policyInput(),
      { 'gemini-veo': veo, invideo },
      { now: () => NOW },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.receipts[0]).toMatchObject({
      shotId: 'FCR-01',
      outcome: 'UNKNOWN',
      failureCode: 'renderer_execution_failed',
      providerEvidenceRefs: [],
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(invideo).not.toHaveBeenCalled();
  });

  it('treats missing output, evidence, or credit receipts as unknown instead of faking green', async () => {
    const missingEvidence = vi.fn(async () => ({
      status: 'SUCCEEDED' as const,
      attempts: 1,
      creditsConsumed: 1,
      outputFingerprint: digest('output'),
      providerEvidenceRefs: [],
    }));
    const invideo = vi.fn(async () => success('unused', 'provider:invideo:unused'));

    const result = await executeGeminiMediaProductionPlan(
      policyInput(),
      { 'gemini-veo': missingEvidence, invideo },
      { now: () => NOW },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.receipts[0]).toMatchObject({
      outcome: 'UNKNOWN',
      failureCode: 'renderer_evidence_receipt_missing',
    });
    expect(invideo).not.toHaveBeenCalled();
  });

  it('stops when a renderer reports spending above its authorized shot ceiling', async () => {
    const veo = vi.fn(async () => success('veo-overrun', 'provider:veo:clip-overrun', 5));
    const invideo = vi.fn(async () => success('unused', 'provider:invideo:unused'));

    const result = await executeGeminiMediaProductionPlan(
      policyInput(),
      { 'gemini-veo': veo, invideo },
      { now: () => NOW },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.receipts[0]).toMatchObject({
      outcome: 'FAILED',
      failureCode: 'renderer_credit_ceiling_exceeded',
      creditsConsumed: 5,
      outputFingerprint: null,
    });
    expect(invideo).not.toHaveBeenCalled();
  });

  it('rechecks evidence freshness before dispatch and stops if the truth envelope expires', async () => {
    const bound = boundCommand({
      shots: [commandDraft().shots[0]!],
    });
    const input = policyInput(bound, {
      claims: [claim({ expiresAt: '2026-09-18T22:00:30.000Z' })],
    });
    const times = [
      new Date('2026-09-18T21:59:59.000Z'),
      new Date('2026-09-18T22:00:31.000Z'),
      new Date('2026-09-18T22:00:31.000Z'),
    ];
    const now = vi.fn(() => times.shift() ?? new Date('2026-09-18T22:00:31.000Z'));
    const veo = vi.fn(async () => success('must-not-run', 'provider:veo:must-not-run'));

    const result = await executeGeminiMediaProductionPlan(
      input,
      { 'gemini-veo': veo },
      { now },
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.receipts[0]).toMatchObject({
      outcome: 'BLOCKED',
      failureCode: 'policy_invalidated_before_shot',
    });
    expect(result.policy.reasons).toContain('claim_not_current:FCR-01:claim-current');
    expect(veo).not.toHaveBeenCalled();
  });

  it('never invokes a renderer for HOLD, CANCEL, or RELEASE dispositions', async () => {
    const renderer = vi.fn(async () => success('unused', 'provider:veo:unused'));

    for (const decision of ['HOLD', 'CANCEL'] as const) {
      const bound = boundCommand({ decision, maxCredits: 0, shots: [] });
      const result = await executeGeminiMediaProductionPlan(
        policyInput(bound),
        { 'gemini-veo': renderer },
        { now: () => NOW },
      );
      expect(result.status).toBe('NO_RENDER_ACTION');
    }

    expect(renderer).not.toHaveBeenCalled();
  });
});
