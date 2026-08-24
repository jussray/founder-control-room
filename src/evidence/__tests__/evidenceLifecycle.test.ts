import { describe, expect, it } from 'vitest';

import {
  authorityForIntakeEvent,
  authorityForVerifiedReceipt,
  createEvidenceIntakeEvent,
  expireEvidenceReceipt,
  supersedeEvidenceReceipt,
  type VerifiedEvidenceReceipt,
} from '../evidenceLifecycle.js';

function receipt(overrides: Partial<VerifiedEvidenceReceipt> = {}): VerifiedEvidenceReceipt {
  return {
    id: 'receipt-1',
    intakeEventId: 'intake-1',
    verifier: {
      source: 'github_api',
      observedAt: '2026-08-23T22:00:00.000Z',
      evidenceRef: 'github://run/123',
    },
    authority: {
      level: 'authoritative_readback',
      readbackCompleted: true,
    },
    verdict: 'verified',
    ledgerState: 'ledgered',
    validity: 'current',
    subject: {
      repository: 'jussray/founder-control-room',
      workflow: 'Quality Gate',
      runId: '123',
      sha: 'a'.repeat(40),
      workflowConclusion: 'success',
    },
    expiresAt: '2026-08-23T23:00:00.000Z',
    ...overrides,
  };
}

describe('evidence lifecycle authority boundary', () => {
  it('keeps sensor intake structurally observation-only', () => {
    const event = createEvidenceIntakeEvent({
      id: 'intake-1',
      source: 'gmail',
      receivedAt: '2026-08-23T22:00:00.000Z',
      rawEvidenceRef: 'gmail://message/abc',
      parsed: {
        repository: 'jussray/founder-control-room',
        status: 'success',
      },
      parser: {
        version: 'github-actions-email-v1',
        confidence: 'medium',
      },
    });

    expect(event.authority).toEqual({ level: 'observation', verified: false });
    expect(event.verificationState).toBe('intake_pending');
    expect(authorityForIntakeEvent().forbiddenActions).toContain('deploy');
    expect(authorityForIntakeEvent().forbiddenActions).toContain('merge');
    expect(authorityForIntakeEvent().forbiddenActions).toContain('change_policy');
  });

  it('does not let a verified receipt authorize high-consequence actions by itself', () => {
    const decision = authorityForVerifiedReceipt(receipt(), '2026-08-23T22:01:00.000Z');

    expect(decision.allowedActions).toContain('prepare_merge_review');
    expect(decision.forbiddenActions).toContain('merge');
    expect(decision.forbiddenActions).toContain('deploy');
    expect(decision.forbiddenActions).toContain('promote_production');
  });

  it('keeps rejected evidence structurally read back but never verified or authoritative', () => {
    const rejected = receipt({
      verdict: 'rejected',
      rejectionReason: 'GitHub API did not corroborate the notification.',
    });
    const decision = authorityForVerifiedReceipt(rejected, '2026-08-23T22:01:00.000Z');

    expect(rejected.authority).toEqual({
      level: 'authoritative_readback',
      readbackCompleted: true,
    });
    expect('verified' in rejected.authority).toBe(false);
    expect(decision.allowedActions).toEqual(['inspect', 'create_evidence_task']);
    expect(decision.forbiddenActions).toContain('close_issue');
  });

  it('revokes governed-action readiness when evidence is unledgered', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({ ledgerState: 'unledgered' }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/persisted/i);
  });

  it.each(['stale', 'superseded', 'expired'] as const)(
    'blocks operational authority when validity is %s',
    (validity) => {
      const decision = authorityForVerifiedReceipt(
        receipt({ validity }),
        '2026-08-23T22:01:00.000Z',
      );

      expect(decision.allowedActions).not.toContain('prepare_merge_review');
      expect(decision.forbiddenActions).toContain('deploy');
    },
  );

  it('re-evaluates expiration at the use boundary before preparing merge review', () => {
    const expiring = receipt({
      validity: 'current',
      expiresAt: '2026-08-23T22:05:00.000Z',
    });
    const decision = authorityForVerifiedReceipt(expiring, '2026-08-23T22:05:00.000Z');

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/expired/i);
    expect(expiring.validity).toBe('current');
  });

  it('requires an explicit freshness lease before preparing merge review', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({ expiresAt: undefined }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.allowedActions).toContain('request_readonly_verification');
    expect(decision.reasons.join(' ')).toMatch(/freshness lease/i);
  });

  it('rejects a freshness lease whose provider observation is still in the future', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({
        verifier: {
          source: 'github_api',
          observedAt: '2026-08-23T22:10:00.000Z',
          evidenceRef: 'github://run/123',
        },
        expiresAt: '2026-08-23T23:00:00.000Z',
      }),
      '2026-08-23T22:05:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/active freshness lease/i);
  });

  it('rejects an incoherent freshness lease that expires before the provider observation', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({
        verifier: {
          source: 'github_api',
          observedAt: '2026-08-23T22:10:00.000Z',
          evidenceRef: 'github://run/123',
        },
        expiresAt: '2026-08-23T22:09:00.000Z',
      }),
      '2026-08-23T22:05:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/active freshness lease/i);
  });

  it('blocks merge-review preparation when repository and exact SHA scope are absent', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({ subject: {} }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.allowedActions).toContain('request_readonly_verification');
    expect(decision.reasons.join(' ')).toMatch(/successful GitHub API workflow readback/i);
  });

  it('blocks merge-review preparation when the verifier source is not GitHub API readback', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({
        verifier: {
          source: 'playwright',
          observedAt: '2026-08-23T22:00:00.000Z',
          evidenceRef: 'playwright://report/123',
        },
      }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/successful GitHub API workflow readback/i);
  });

  it('blocks merge-review preparation when the claimed SHA is not an exact full SHA', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({
        subject: {
          repository: 'jussray/founder-control-room',
          workflow: 'Quality Gate',
          runId: '123',
          sha: 'abc123',
          workflowConclusion: 'success',
        },
      }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
  });

  it.each(['failure', 'cancelled', 'timed_out', 'unknown'] as const)(
    'keeps a verified %s workflow outcome non-authorizing for merge-review preparation',
    (workflowConclusion) => {
      const decision = authorityForVerifiedReceipt(
        receipt({
          subject: {
            repository: 'jussray/founder-control-room',
            workflow: 'Quality Gate',
            runId: '123',
            sha: 'a'.repeat(40),
            workflowConclusion,
          },
        }),
        '2026-08-23T22:01:00.000Z',
      );

      expect(decision.allowedActions).not.toContain('prepare_merge_review');
      expect(decision.allowedActions).toContain('request_readonly_verification');
      expect(decision.reasons.join(' ')).toMatch(/successful GitHub API workflow readback/i);
    },
  );

  it('blocks merge-review preparation when a verified workflow outcome is missing', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({
        subject: {
          repository: 'jussray/founder-control-room',
          workflow: 'Quality Gate',
          runId: '123',
          sha: 'a'.repeat(40),
        },
      }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
  });

  it('blocks contradictory current receipts that already carry a supersession marker', () => {
    const decision = authorityForVerifiedReceipt(
      receipt({ validity: 'current', supersededBy: 'receipt-2' }),
      '2026-08-23T22:01:00.000Z',
    );

    expect(decision.allowedActions).not.toContain('prepare_merge_review');
    expect(decision.reasons.join(' ')).toMatch(/supersession marker/i);
  });

  it('supersedes directionally without rewriting the original subject', () => {
    const original = receipt();
    const superseded = supersedeEvidenceReceipt(original, ' receipt-2 ');

    expect(superseded.validity).toBe('superseded');
    expect(superseded.supersededBy).toBe('receipt-2');
    expect(superseded.subject).toEqual(original.subject);
    expect(original.validity).toBe('current');
  });

  it('rejects direct or whitespace-disguised self-supersession', () => {
    expect(() => supersedeEvidenceReceipt(receipt(), 'receipt-1')).toThrow(/cannot supersede itself/i);
    expect(() => supersedeEvidenceReceipt(receipt(), ' receipt-1 ')).toThrow(/cannot supersede itself/i);
  });

  it('preserves the first supersession edge once lineage is assigned', () => {
    const alreadySuperseded = receipt({
      validity: 'superseded',
      supersededBy: 'receipt-2',
    });

    expect(() => supersedeEvidenceReceipt(alreadySuperseded, 'receipt-3')).toThrow(/immutable once assigned/i);
  });

  it('rejects reassignment when a supersession marker exists even if validity is contradictory', () => {
    const contradictory = receipt({
      validity: 'current',
      supersededBy: 'receipt-2',
    });

    expect(() => supersedeEvidenceReceipt(contradictory, 'receipt-3')).toThrow(/immutable once assigned/i);
  });

  it('expires only when the receipt expiration has actually passed', () => {
    const expiring = receipt({ expiresAt: '2026-08-23T22:05:00.000Z' });

    expect(expireEvidenceReceipt(expiring, '2026-08-23T22:04:00.000Z').validity).toBe('current');
    expect(expireEvidenceReceipt(expiring, '2026-08-23T22:05:00.000Z').validity).toBe('expired');
  });
});
