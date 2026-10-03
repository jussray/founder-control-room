import { describe, expect, it } from 'vitest';
import {
  evaluateCodexSecurityScanReceipt,
  type CodexSecurityScanReceiptV1,
} from '../codexSecurityProofAdapter.js';

const HEAD = '1234567890abcdef1234567890abcdef12345678';
const SCOPE = 'scope:fcr-security-contract:v1';
const DIGEST = `sha256:${'a'.repeat(64)}`;

function receipt(
  overrides: Partial<CodexSecurityScanReceiptV1> = {},
): CodexSecurityScanReceiptV1 {
  return {
    schema: 'juss/codex-security-scan@v1',
    program: 'codex-security',
    scanId: 'scan-001',
    subject: {
      repository: 'jussray/founder-control-room',
      headSha: HEAD,
      scopeFingerprint: SCOPE,
    },
    evidenceSource: 'github-actions-artifact',
    artifactDigest: DIGEST,
    startedAt: '2026-10-03T01:00:00.000Z',
    completedAt: '2026-10-03T01:05:00.000Z',
    observedAt: '2026-10-03T01:05:10.000Z',
    terminalState: 'passed',
    externalWrite: {
      requested: false,
      performed: false,
    },
    findings: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    },
    ...overrides,
  };
}

const expected = {
  repository: 'jussray/founder-control-room',
  headSha: HEAD,
  scopeFingerprint: SCOPE,
};

describe('Codex Security proof adapter', () => {
  it('accepts exact-head scan evidence without granting execution authority', () => {
    const evidence = evaluateCodexSecurityScanReceipt(receipt(), expected);

    expect(evidence).toMatchObject({
      classification: 'VERIFIED',
      disposition: 'CONTINUE',
      proofLevel: 'exact-head',
      terminalState: 'passed',
      authority: {
        executionAuthorized: false,
        mergeAuthorized: false,
        deployAuthorized: false,
        providerMutationAuthorized: false,
        externalWriteAuthorizedByReceipt: false,
      },
    });
  });

  it('fails closed when the scan is bound to a different head SHA', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({
        subject: {
          repository: 'jussray/founder-control-room',
          headSha: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
          scopeFingerprint: SCOPE,
        },
      }),
      expected,
    );

    expect(evidence.classification).toBe('BLOCKED');
    expect(evidence.disposition).toBe('HOLD');
    expect(evidence.reasons.join(' ')).toMatch(/exact head/i);
  });

  it('requires explicit authorization and scope references for Daybreak Red evidence', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({ program: 'daybreak-red' }),
      expected,
    );

    expect(evidence.classification).toBe('BLOCKED');
    expect(evidence.reasons.join(' ')).toMatch(/authorized-test approval/i);
  });

  it('can record authorized Daybreak Red evidence without converting that receipt into authority', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({
        program: 'daybreak-red',
        authorizedTest: {
          approved: true,
          approvalRef: 'founder-approval:security-lab-001',
          scopeRef: 'scope:isolated-lab-only',
        },
      }),
      expected,
    );

    expect(evidence.classification).toBe('VERIFIED');
    expect(evidence.authority).toEqual({
      executionAuthorized: false,
      mergeAuthorized: false,
      deployAuthorized: false,
      providerMutationAuthorized: false,
      externalWriteAuthorizedByReceipt: false,
    });
  });

  it('blocks evidence that reports an undeclared or unapproved external write', () => {
    const undeclared = evaluateCodexSecurityScanReceipt(
      receipt({
        externalWrite: {
          requested: false,
          performed: true,
        },
      }),
      expected,
    );
    expect(undeclared.classification).toBe('BLOCKED');
    expect(undeclared.reasons.join(' ')).toMatch(/without being declared/i);

    const unapproved = evaluateCodexSecurityScanReceipt(
      receipt({
        externalWrite: {
          requested: true,
          performed: true,
        },
      }),
      expected,
    );
    expect(unapproved.classification).toBe('BLOCKED');
    expect(unapproved.reasons.join(' ')).toMatch(/approval reference/i);
  });

  it('keeps cancelled scans unknown and failed scans blocked instead of creating false green', () => {
    const cancelled = evaluateCodexSecurityScanReceipt(
      receipt({ terminalState: 'cancelled' }),
      expected,
    );
    expect(cancelled).toMatchObject({ classification: 'UNKNOWN', disposition: 'HOLD' });

    const failed = evaluateCodexSecurityScanReceipt(
      receipt({ terminalState: 'failed' }),
      expected,
    );
    expect(failed).toMatchObject({ classification: 'BLOCKED', disposition: 'REPAIR' });
  });

  it('records findings as verified evidence while keeping the candidate on hold', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({
        terminalState: 'findings',
        findings: {
          critical: 0,
          high: 1,
          medium: 2,
          low: 0,
          informational: 3,
        },
      }),
      expected,
    );

    expect(evidence).toMatchObject({
      classification: 'VERIFIED',
      disposition: 'HOLD',
      findings: { high: 1, medium: 2 },
    });
  });

  it('treats provider readback as a distinct proof level from GitHub artifact evidence', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({ evidenceSource: 'provider-readback' }),
      expected,
    );

    expect(evidence.proofLevel).toBe('provider-observation');
    expect(evidence.classification).toBe('VERIFIED');
  });

  it('rejects malformed evidence digests and impossible time ordering', () => {
    const evidence = evaluateCodexSecurityScanReceipt(
      receipt({
        artifactDigest: 'sha256:not-a-real-digest',
        completedAt: '2026-10-03T00:59:00.000Z',
      }),
      expected,
    );

    expect(evidence.classification).toBe('BLOCKED');
    expect(evidence.reasons.join(' ')).toMatch(/sha256/);
    expect(evidence.reasons.join(' ')).toMatch(/precedes startedAt/);
  });
});
