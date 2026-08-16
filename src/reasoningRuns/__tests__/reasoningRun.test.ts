import { describe, expect, it } from 'vitest';
import {
  INTENT_FINGERPRINT_SCHEME,
  REASONING_STAGE_ORDER,
  cookieBoundaryFingerprint,
  createReasoningArtifactEnvelope,
  createReasoningRunReceipt,
  fingerprintValue,
  operationalIntentFingerprint,
  validateReasoningRun,
  type ReasoningRunInput,
} from '../reasoningRun.js';

const MAIN_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);

function stages() {
  return REASONING_STAGE_ORDER.map((id) => ({
    id,
    status: 'completed' as const,
    truth: 'verified' as const,
    resultCode: `${id}.complete`,
    evidenceRefs: [`evidence:${id}`],
  }));
}

function valid(overrides: Partial<ReasoningRunInput> = {}): ReasoningRunInput {
  return {
    chainId: 'reasoning-test-chain',
    occurredAt: '2026-08-16T05:40:00Z',
    projectSlug: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    source: 'chatgpt',
    intent: {
      goalCode: 'implement-founder-reasoning-workflow',
      targetClass: 'project',
      requestedModes: [
        'ultrathink',
        'redteam',
        'ooda',
        'l99',
        'lindy',
        'billgates',
        'elonmusk',
        'hormozi',
        'product-design',
        'data-analytics',
        'v10',
        'futureyou-me',
        'juss',
      ],
    },
    iteration: 1,
    stopReason: 'stable',
    currentHeadSha: HEAD_SHA,
    nextGateCode: 'exact-head-verification',
    stages: stages(),
    tools: [
      {
        tool: 'github',
        operation: 'fetch-file',
        status: 'success',
        targetRef: 'github:jussray/founder-control-room:AGENTS.md',
        evidenceRefs: ['github:file:AGENTS.md'],
      },
    ],
    artifacts: [
      {
        artifactId: 'reasoning-test-artifact',
        kind: 'evidence',
        mediaType: 'application/json',
        sha256: fingerprintValue({ bytes: 'artifact-proof-fixture' }),
        privacy: 'operational-only',
        ref: 'artifact://reasoning-test-artifact',
      },
    ],
    implementation: {
      repository: 'jussray/founder-control-room',
      baseSha: MAIN_SHA,
      headSha: HEAD_SHA,
      branch: 'feat/founder-reasoning-receipt-v1-20260816',
      pullRequest: 386,
      changedFilesFingerprint: fingerprintValue([
        'src/reasoningRuns/reasoningRun.ts',
        'src/services/reasoningRunStore.ts',
      ]),
    },
    auth: {
      transport: 'founder-session-cookie',
      cookieBoundaryContract: 'fcr/cookie-boundary@v1',
      cookieBoundaryFingerprint: cookieBoundaryFingerprint('founder-session-cookie'),
      rawCookieValuesStored: false,
    },
    ...overrides,
  };
}

describe('Founder reasoning receipt', () => {
  it('derives deterministic privacy-safe fingerprints from the operational data FCR stores', () => {
    const first = createReasoningRunReceipt(valid());
    const second = createReasoningRunReceipt(valid());
    const artifact = createReasoningArtifactEnvelope(first);

    expect(first.intentFingerprintScheme).toBe(INTENT_FINGERPRINT_SCHEME);
    expect(first.intentFingerprint).toBe(operationalIntentFingerprint(valid().intent));
    expect(first.intentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.stages.every((stage) => /^[0-9a-f]{64}$/.test(stage.resultFingerprint))).toBe(true);
    expect(first.tools[0]?.targetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.receiptFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.receiptFingerprint).toBe(second.receiptFingerprint);
    expect(first.repository).toBe('jussray/founder-control-room');
    expect(first.privacy).toEqual({
      rawPromptStored: false,
      rawPromptFingerprintStored: false,
      rawChainOfThoughtStored: false,
      rawToolPayloadsStored: false,
      rawCookieValuesStored: false,
    });
    expect(first.quality.completedStages).toBe(REASONING_STAGE_ORDER.length);
    expect(first.quality.verifiedStages).toBe(REASONING_STAGE_ORDER.length);
    expect(first.quality.toolReceipts).toBe(1);
    expect(first.quality.artifacts).toBe(1);
    expect(artifact.path).toBe('artifacts/reasoning-runs/reasoning-test-chain-v1.json');
    expect(artifact.materialized).toBe(false);
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.receiptFingerprint).toBe(first.receiptFingerprint);
    expect(JSON.parse(artifact.content).receiptFingerprint).toBe(first.receiptFingerprint);
  });

  it('rejects free-text intent and accepts only bounded operational codes', () => {
    expect(validateReasoningRun(valid({
      intent: {
        goalCode: 'Please store my whole private prompt here',
        targetClass: 'project',
        requestedModes: ['ultrathink'],
      },
    }))).toContain('intent.goalCode must be an operational code');

    expect(validateReasoningRun(valid({
      intent: {
        goalCode: 'implement-reasoning-receipts',
        targetClass: 'project',
        requestedModes: ['ultrathink', 'not-a-mode' as never],
      },
    }))).toContain('intent requested mode is invalid: not-a-mode');
  });

  it('derives stage and tool fingerprints instead of accepting caller-provided mystery hashes', () => {
    const receipt = createReasoningRunReceipt(valid());
    const goal = receipt.stages[0]!;
    const tool = receipt.tools[0]!;

    expect(goal.resultFingerprint).toBe(fingerprintValue({
      scheme: 'sanitized-stage-result-sha256',
      stage: {
        id: 'goal',
        status: 'completed',
        truth: 'verified',
        resultCode: 'goal.complete',
        evidenceRefs: ['evidence:goal'],
        artifactRefs: [],
      },
    }));
    expect(tool.targetFingerprint).toBe(fingerprintValue({
      scheme: 'sanitized-tool-target-sha256',
      tool: 'github',
      operation: 'fetch-file',
      targetRef: 'github:jussray/founder-control-room:AGENTS.md',
    }));
  });

  it('fingerprints the cookie boundary without storing a cookie or token value', () => {
    const cookie = createReasoningRunReceipt(valid());
    const bearer = createReasoningRunReceipt(valid({
      auth: {
        transport: 'bearer',
        cookieBoundaryContract: 'fcr/cookie-boundary@v1',
        cookieBoundaryFingerprint: cookieBoundaryFingerprint('bearer'),
        rawCookieValuesStored: false,
      },
    }));

    expect(cookie.auth.rawCookieValuesStored).toBe(false);
    expect(cookie.auth.cookieBoundaryFingerprint).not.toBe(bearer.auth.cookieBoundaryFingerprint);
    expect(JSON.stringify(cookie)).not.toContain('access_token');
    expect(JSON.stringify(cookie)).not.toContain('refresh_token');
  });

  it('enforces the exact deep-audit stage order through FutureYou/Me and Juss', () => {
    const reordered = stages();
    [reordered[2], reordered[3]] = [reordered[3]!, reordered[2]!];

    const errors = validateReasoningRun(valid({ stages: reordered }));
    expect(errors).toContain('stage 3 must be ultrathink');
    expect(errors).toContain('stage 4 must be redteam-premise');

    const receipt = createReasoningRunReceipt(valid());
    expect(receipt.stages.map((stage) => stage.id)).toEqual(REASONING_STAGE_ORDER);
    expect(receipt.stages.some((stage) => stage.id === 'v10')).toBe(true);
    expect(receipt.stages.some((stage) => stage.id === 'futureyou-me')).toBe(true);
    expect(receipt.stages.some((stage) => stage.id === 'juss')).toBe(true);
  });

  it('supports a full V1 through V10 receipt chain and makes V10 terminal', () => {
    const receipts = [];
    let priorReceiptFingerprint: string | undefined;

    for (let iteration = 1; iteration <= 10; iteration += 1) {
      const receipt = createReasoningRunReceipt(valid({
        iteration,
        ...(priorReceiptFingerprint ? { priorReceiptFingerprint } : {}),
        stopReason: iteration === 10 ? 'v10-complete' : 'continue',
      }));
      receipts.push(receipt);
      priorReceiptFingerprint = receipt.receiptFingerprint;
    }

    expect(receipts).toHaveLength(10);
    expect(receipts[0]?.priorReceiptFingerprint).toBeUndefined();
    expect(receipts[9]?.priorReceiptFingerprint).toBe(receipts[8]?.receiptFingerprint);
    expect(receipts[9]?.stopReason).toBe('v10-complete');

    expect(validateReasoningRun(valid({
      iteration: 10,
      stopReason: 'continue',
      priorReceiptFingerprint: receipts[8]?.receiptFingerprint,
    }))).toContain('iteration 10 cannot continue');
    expect(validateReasoningRun(valid({ iteration: 2, stopReason: 'stable' })))
      .toContain('iterations after 1 require priorReceiptFingerprint');
  });

  it('requires repository identity for exact-head claims and rejects path-like chain ids', () => {
    expect(validateReasoningRun(valid({ repository: undefined })))
      .toContain('currentHeadSha requires repository identity');
    expect(validateReasoningRun(valid({ chainId: '../../escape' })))
      .toContain('chainId is invalid');
  });

  it('rejects free-form next gates, evidence refs, tool targets, and unsafe artifact refs', () => {
    expect(validateReasoningRun(valid({ nextGateCode: 'tell the founder everything' })))
      .toContain('nextGateCode must be an operational code');
    expect(validateReasoningRun(valid({
      stages: stages().map((stage, index) => index === 0
        ? { ...stage, evidenceRefs: ['private text with spaces'] }
        : stage),
    }))).toContain('goal: evidenceRefs must be unique operational references');
    expect(validateReasoningRun(valid({
      tools: [{ tool: 'github', operation: 'fetch-file', status: 'success', targetRef: 'private target with spaces' }],
    }))).toContain('tool targetRef must be an operational reference');

    for (const ref of [
      'https://example.com/proof?secret=bad',
      'https://example.com/proof#private',
      'https://user:password@example.com/proof',
    ]) {
      expect(validateReasoningRun(valid({
        artifacts: [{
          artifactId: 'bad-ref',
          kind: 'evidence',
          mediaType: 'application/json',
          sha256: fingerprintValue('fixture'),
          privacy: 'operational-only',
          ref,
        }],
      }))).toContain('artifact ref must be a safe artifact URI or HTTPS URL without credentials or query data');
    }
  });

  it('runtime-validates unions instead of trusting TypeScript-only shapes', () => {
    const unsafe = valid() as unknown as Record<string, unknown>;
    unsafe.source = 'untrusted-agent';
    unsafe.stopReason = 'keep-going-forever';
    const unsafeStages = stages() as unknown as Array<Record<string, unknown>>;
    unsafeStages[0]!.truth = 'probably';
    unsafeStages[0]!.status = 'magical';
    unsafe.stages = unsafeStages;

    const errors = validateReasoningRun(unsafe as unknown as ReasoningRunInput);
    expect(errors).toContain('source is invalid');
    expect(errors).toContain('stopReason is invalid');
    expect(errors).toContain('goal: truth is invalid');
    expect(errors).toContain('goal: status is invalid');
  });

  it('rejects a forged cookie-boundary fingerprint or any claim that raw cookie values are stored', () => {
    expect(validateReasoningRun(valid({
      auth: {
        transport: 'founder-session-cookie',
        cookieBoundaryContract: 'fcr/cookie-boundary@v1',
        cookieBoundaryFingerprint: 'c'.repeat(64),
        rawCookieValuesStored: false,
      },
    }))).toContain('cookieBoundaryFingerprint does not match the declared privacy boundary');

    const unsafe = valid() as unknown as { auth: { rawCookieValuesStored: boolean } };
    unsafe.auth.rawCookieValuesStored = true;
    expect(validateReasoningRun(unsafe as unknown as ReasoningRunInput))
      .toContain('raw cookie values must never be stored');
  });
});
