import { describe, expect, it } from 'vitest';
import type {
  EvaluateParallelFixAuditInput,
  EvaluateStaleTruthDeletionInput,
  ParallelFixAuditSnapshot,
  SupersessionProofCookie,
} from '../types.js';
import { evaluateParallelFixAudit, evaluateStaleTruthDeletion } from '../parallelFixAudit.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OTHER_BASE_SHA = 'c'.repeat(40);
const OTHER_HEAD_SHA = 'd'.repeat(40);
const DIFF_FINGERPRINT = 'e'.repeat(64);
const OTHER_DIFF_FINGERPRINT = 'f'.repeat(64);
const STALE_ARTIFACT_FINGERPRINT = '1'.repeat(64);
const OTHER_STALE_ARTIFACT_FINGERPRINT = '3'.repeat(64);
const COOKIE_ID = '2'.repeat(64);
const NOW = '2026-08-27T18:10:00.000Z';
const BUILDER_OBSERVED_AT = '2026-08-27T18:08:00.000Z';
const AUDITOR_OBSERVED_AT = '2026-08-27T18:09:00.000Z';
const COOKIE_OBSERVED_AT = '2026-08-27T18:09:30.000Z';

function snapshot(overrides: Partial<ParallelFixAuditSnapshot> = {}): ParallelFixAuditSnapshot {
  return {
    repository: 'jussray/founder-control-room',
    targetBranch: 'main',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    prNumber: 704,
    diffFingerprint: DIFF_FINGERPRINT,
    evidenceState: 'evidence_complete',
    observedAt: BUILDER_OBSERVED_AT,
    actorId: 'builder',
    actorIdentityState: 'verified',
    ...overrides,
  };
}

function input(overrides: Partial<EvaluateParallelFixAuditInput> = {}): EvaluateParallelFixAuditInput {
  return {
    builder: snapshot(),
    auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    auditedAt: NOW,
    freshnessWindowMs: 5 * 60 * 1000,
    ...overrides,
  };
}

function proofCookie(overrides: Partial<SupersessionProofCookie> = {}): SupersessionProofCookie {
  return {
    cookieId: COOKIE_ID,
    state: 'proven',
    repository: 'jussray/founder-control-room',
    targetBranch: 'main',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    prNumber: 704,
    replacementDiffFingerprint: DIFF_FINGERPRINT,
    supersededArtifactFingerprint: STALE_ARTIFACT_FINGERPRINT,
    observedAt: COOKIE_OBSERVED_AT,
    actorId: 'auditor',
    actorIdentityState: 'verified',
    ...overrides,
  };
}

function deletionInput(
  overrides: Partial<EvaluateStaleTruthDeletionInput> = {},
): EvaluateStaleTruthDeletionInput {
  return {
    parallelAudit: evaluateParallelFixAudit(input()),
    current: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    staleArtifact: {
      artifactId: 'derived-status-snapshot.json',
      artifactClass: 'derived_truth_artifact',
      fingerprint: STALE_ARTIFACT_FINGERPRINT,
    },
    proofCookie: proofCookie(),
    auditedAt: NOW,
    freshnessWindowMs: 5 * 60 * 1000,
    ...overrides,
  };
}

describe('evaluateParallelFixAudit', () => {
  it('keeps dependent proof current only when a fresh independently identified audit matches the full fingerprint', () => {
    expect(evaluateParallelFixAudit(input())).toEqual({
      state: 'evidence_complete',
      currentBaseSha: BASE_SHA,
      currentHeadSha: HEAD_SHA,
      dependentProof: 'current',
      findings: [],
    });
  });

  it('supports a branch-only main audit when no PR exists', () => {
    const result = evaluateParallelFixAudit(input({
      builder: snapshot({ prNumber: null }),
      auditor: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    }));

    expect(result.state).toBe('evidence_complete');
    expect(result.dependentProof).toBe('current');
    expect(result.findings).toEqual([]);
  });

  it('revokes dependent proof immediately when current main/base moves', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        baseSha: OTHER_BASE_SHA,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.dependentProof).toBe('stale');
    expect(result.currentBaseSha).toBe(OTHER_BASE_SHA);
    expect(result.findings).toContain('parallel_audit_base_moved');
  });

  it('revokes dependent proof immediately when the candidate head moves', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        headSha: OTHER_HEAD_SHA,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.dependentProof).toBe('stale');
    expect(result.currentHeadSha).toBe(OTHER_HEAD_SHA);
    expect(result.findings).toContain('parallel_audit_head_moved');
  });

  it('treats diff movement as a load-bearing conflict even when the head value is unchanged', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        diffFingerprint: OTHER_DIFF_FINGERPRINT,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_diff_moved');
  });

  it('requires a real SHA-256-shaped diff fingerprint', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, diffFingerprint: 'constant-ready' }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_fingerprint_malformed');
    expect(result.findings).toContain('parallel_audit_diff_moved');
  });

  it('does not allow caller-labeled identities to satisfy the independent audit lane', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        actorIdentityState: 'unverified',
        observedAt: AUDITOR_OBSERVED_AT,
      }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_actor_identity_unverified');
  });

  it('does not allow the same verified actor to satisfy the audit lane with case variation', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({ actorId: 'BUILDER', observedAt: AUDITOR_OBSERVED_AT }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_not_independent');
  });

  it('does not inherit green when auditor evidence is incomplete', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        evidenceState: 'evidence_incomplete',
      }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_evidence_incomplete');
  });

  it('preserves a conflicting auditor verdict as evidence_conflicted', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        evidenceState: 'evidence_conflicted',
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_evidence_conflicted');
  });

  it('rejects an auditor observation older than the builder snapshot', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({ actorId: 'auditor', observedAt: '2026-08-27T18:07:59.000Z' }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_older_than_builder');
  });

  it('rejects stale auditor observations', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({ actorId: 'auditor', observedAt: '2026-08-27T18:04:59.999Z' }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_observation_stale');
  });

  it('rejects future builder observations rather than letting them distort ordering', () => {
    const result = evaluateParallelFixAudit(input({
      builder: snapshot({ observedAt: '2026-08-27T18:10:00.001Z' }),
    }));

    expect(result.state).toBe('evidence_incomplete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_observation_time_unknown');
  });

  it('fails closed on malformed fingerprints instead of normalizing them into readiness', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        headSha: 'short',
        diffFingerprint: null,
      }),
    }));

    expect(result.state).not.toBe('evidence_complete');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('parallel_audit_fingerprint_malformed');
  });

  it('fails closed when the auditor targets a different repository, branch, or PR', () => {
    const result = evaluateParallelFixAudit(input({
      auditor: snapshot({
        repository: 'jussray/other',
        targetBranch: 'release',
        prNumber: 999,
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toEqual(expect.arrayContaining([
      'parallel_audit_repository_mismatch',
      'parallel_audit_target_mismatch',
      'parallel_audit_pr_mismatch',
    ]));
  });
});

describe('evaluateStaleTruthDeletion', () => {
  it('authorizes deletion only for a derived stale artifact with a proven matching proof cookie', () => {
    expect(evaluateStaleTruthDeletion(deletionInput())).toEqual({
      state: 'evidence_complete',
      deletionAuthority: 'authorized',
      staleArtifactFingerprint: STALE_ARTIFACT_FINGERPRINT,
      replacementHeadSha: HEAD_SHA,
      replacementDiffFingerprint: DIFF_FINGERPRINT,
      proofCookieId: COOKIE_ID,
      findings: [],
    });
  });

  it('preserves source history, audit logs, and security evidence even when superseded', () => {
    for (const artifactClass of ['source_history', 'audit_log', 'security_evidence'] as const) {
      const result = evaluateStaleTruthDeletion(deletionInput({
        staleArtifact: {
          artifactId: `${artifactClass}.json`,
          artifactClass,
          fingerprint: STALE_ARTIFACT_FINGERPRINT,
        },
      }));

      expect(result.deletionAuthority).toBe('denied');
      expect(result.findings).toContain('stale_deletion_artifact_not_deletable');
    }
  });

  it('never authorizes deletion of the current replacement truth itself', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({
      staleArtifact: {
        artifactId: 'current-truth.json',
        artifactClass: 'derived_truth_artifact',
        fingerprint: DIFF_FINGERPRINT,
      },
      proofCookie: proofCookie({ supersededArtifactFingerprint: DIFF_FINGERPRINT }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_current_truth_targeted');
  });

  it('denies deletion when the parallel main/candidate truth is stale or conflicted', () => {
    const staleParallelAudit = evaluateParallelFixAudit(input({
      auditor: snapshot({
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
        baseSha: OTHER_BASE_SHA,
      }),
    }));
    const result = evaluateStaleTruthDeletion(deletionInput({ parallelAudit: staleParallelAudit }));

    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_parallel_truth_not_current');
  });

  it('denies deletion when the cookie is only proposed or its actor is unverified', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({
      proofCookie: proofCookie({ state: 'proposed', actorIdentityState: 'unverified' }),
    }));

    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining([
      'stale_deletion_cookie_not_proven',
      'stale_deletion_cookie_actor_unverified',
    ]));
  });

  it('denies deletion when the proof cookie points at a different replacement head or diff', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({
      proofCookie: proofCookie({
        headSha: OTHER_HEAD_SHA,
        replacementDiffFingerprint: OTHER_DIFF_FINGERPRINT,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining([
      'stale_deletion_cookie_head_mismatch',
      'stale_deletion_cookie_diff_mismatch',
    ]));
  });

  it('denies deletion when the cookie does not bind the exact stale artifact fingerprint', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({
      proofCookie: proofCookie({
        supersededArtifactFingerprint: OTHER_STALE_ARTIFACT_FINGERPRINT,
      }),
    }));

    expect(result.state).toBe('evidence_conflicted');
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_cookie_supersession_mismatch');
  });

  it('fails closed on malformed proof-cookie identity in a branch-only audit', () => {
    const branchParallelAudit = evaluateParallelFixAudit(input({
      builder: snapshot({ prNumber: null }),
      auditor: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    }));
    const result = evaluateStaleTruthDeletion(deletionInput({
      parallelAudit: branchParallelAudit,
      current: snapshot({
        prNumber: null,
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
      }),
      proofCookie: proofCookie({ prNumber: 0 }),
    }));

    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_cookie_identity_malformed');
  });

  it('supports a valid branch-only supersession cookie with no PR identity', () => {
    const branchParallelAudit = evaluateParallelFixAudit(input({
      builder: snapshot({ prNumber: null }),
      auditor: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    }));
    const result = evaluateStaleTruthDeletion(deletionInput({
      parallelAudit: branchParallelAudit,
      current: snapshot({
        prNumber: null,
        actorId: 'auditor',
        observedAt: AUDITOR_OBSERVED_AT,
      }),
      proofCookie: proofCookie({ prNumber: null }),
    }));

    expect(result.deletionAuthority).toBe('authorized');
    expect(result.findings).toEqual([]);
  });

  it('denies stale or older-than-current proof cookies', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({
      proofCookie: proofCookie({ observedAt: '2026-08-27T18:04:00.000Z' }),
    }));

    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining([
      'stale_deletion_cookie_older_than_current',
      'stale_deletion_cookie_observation_stale',
    ]));
  });
});
