import { describe, expect, it } from 'vitest';
import type {
  EvaluateParallelFixAuditInput,
  EvaluateStaleTruthDeletionInput,
  ParallelFixAuditSnapshot,
  StaleTruthArtifact,
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
const REPO = 'jussray/founder-control-room';

function snapshot(overrides: Partial<ParallelFixAuditSnapshot> = {}): ParallelFixAuditSnapshot {
  return { repository: REPO, targetBranch: 'main', baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 704,
    diffFingerprint: DIFF_FINGERPRINT, evidenceState: 'evidence_complete', observedAt: BUILDER_OBSERVED_AT,
    actorId: 'builder', actorIdentityState: 'verified', ...overrides };
}
function input(overrides: Partial<EvaluateParallelFixAuditInput> = {}): EvaluateParallelFixAuditInput {
  return { builder: snapshot(), auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    auditedAt: NOW, freshnessWindowMs: 5 * 60 * 1000, ...overrides };
}
function artifact(overrides: Partial<StaleTruthArtifact> = {}): StaleTruthArtifact {
  return { artifactId: 'derived-status-snapshot.json', artifactClass: 'derived_truth_artifact', fingerprint: STALE_ARTIFACT_FINGERPRINT, ...overrides };
}
function proofCookie(overrides: Partial<SupersessionProofCookie> = {}): SupersessionProofCookie {
  return { cookieId: COOKIE_ID, state: 'proven', repository: REPO, targetBranch: 'main', baseSha: BASE_SHA,
    headSha: HEAD_SHA, prNumber: 704, replacementDiffFingerprint: DIFF_FINGERPRINT,
    supersededArtifactFingerprint: STALE_ARTIFACT_FINGERPRINT, observedAt: COOKIE_OBSERVED_AT,
    actorId: 'auditor', actorIdentityState: 'verified', ...overrides };
}
function deletionInput(overrides: Partial<EvaluateStaleTruthDeletionInput> = {}): EvaluateStaleTruthDeletionInput {
  const staleArtifact = artifact();
  const cookie = proofCookie();
  return { parallelAudit: evaluateParallelFixAudit(input()), current: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }),
    staleArtifact, proofCookie: cookie,
    trustedArtifactIndex: new Map([[staleArtifact.artifactId, staleArtifact]]),
    trustedProofCookieIndex: new Map([[cookie.cookieId, cookie]]),
    auditedAt: NOW, freshnessWindowMs: 5 * 60 * 1000, ...overrides };
}

describe('evaluateParallelFixAudit', () => {
  it('returns the full independently observed identity when proof is current', () => {
    expect(evaluateParallelFixAudit(input())).toEqual({
      state: 'evidence_complete', currentRepository: REPO, currentTargetBranch: 'main', currentBaseSha: BASE_SHA,
      currentHeadSha: HEAD_SHA, currentPrNumber: 704, currentDiffFingerprint: DIFF_FINGERPRINT,
      dependentProof: 'current', findings: [],
    });
  });

  it('supports branch-only audits while preserving null PR identity', () => {
    const result = evaluateParallelFixAudit(input({ builder: snapshot({ prNumber: null }),
      auditor: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }) }));
    expect(result.state).toBe('evidence_complete');
    expect(result.currentPrNumber).toBeNull();
  });

  it('revokes proof when base, head, diff, repository, target or PR moves', () => {
    const variants = [
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, baseSha: OTHER_BASE_SHA }),
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, headSha: OTHER_HEAD_SHA }),
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, diffFingerprint: OTHER_DIFF_FINGERPRINT }),
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, repository: 'jussray/other' }),
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, targetBranch: 'release' }),
      snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, prNumber: 999 }),
    ];
    for (const auditor of variants) {
      const result = evaluateParallelFixAudit(input({ auditor }));
      expect(result.state).toBe('evidence_conflicted');
      expect(result.dependentProof).toBe('stale');
    }
  });

  it('requires verified independent actor identity', () => {
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'BUILDER', observedAt: AUDITOR_OBSERVED_AT }) })).findings)
      .toContain('parallel_audit_not_independent');
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', actorIdentityState: 'unverified', observedAt: AUDITOR_OBSERVED_AT }) })).findings)
      .toContain('parallel_audit_actor_identity_unverified');
  });

  it('rejects stale, future and older-than-builder observations', () => {
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', observedAt: '2026-08-27T18:04:59.999Z' }) })).findings)
      .toContain('parallel_audit_observation_stale');
    expect(evaluateParallelFixAudit(input({ builder: snapshot({ observedAt: '2026-08-27T18:10:00.001Z' }) })).findings)
      .toContain('parallel_audit_observation_time_unknown');
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', observedAt: '2026-08-27T18:07:59.000Z' }) })).findings)
      .toContain('parallel_audit_older_than_builder');
  });

  it('fails closed on malformed fingerprints or incomplete/conflicted auditor evidence', () => {
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, headSha: 'short', diffFingerprint: null }) })).dependentProof)
      .toBe('stale');
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, evidenceState: 'evidence_incomplete' }) })).findings)
      .toContain('parallel_audit_evidence_incomplete');
    expect(evaluateParallelFixAudit(input({ auditor: snapshot({ actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT, evidenceState: 'evidence_conflicted' }) })).state)
      .toBe('evidence_conflicted');
  });
});

describe('evaluateStaleTruthDeletion', () => {
  it('authorizes only a trusted derived artifact with a trusted exact proof cookie', () => {
    expect(evaluateStaleTruthDeletion(deletionInput())).toEqual({
      state: 'evidence_complete', deletionAuthority: 'authorized', staleArtifactFingerprint: STALE_ARTIFACT_FINGERPRINT,
      replacementHeadSha: HEAD_SHA, replacementDiffFingerprint: DIFF_FINGERPRINT, proofCookieId: COOKIE_ID, findings: [],
    });
  });

  it('denies a caller artifact missing from trusted metadata', () => {
    const proposed = artifact({ artifactId: 'made-up.json' });
    const result = evaluateStaleTruthDeletion(deletionInput({ staleArtifact: proposed }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_artifact_not_trusted');
  });

  it('denies relabeling protected trusted material as deletable derived truth', () => {
    const trusted = artifact({ artifactClass: 'security_evidence' });
    const proposal = artifact({ artifactClass: 'derived_truth_artifact' });
    const result = evaluateStaleTruthDeletion(deletionInput({ staleArtifact: proposal,
      trustedArtifactIndex: new Map([[trusted.artifactId, trusted]]) }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining(['stale_deletion_artifact_integrity_mismatch', 'stale_deletion_artifact_not_deletable']));
  });

  it('preserves source history audit logs and security evidence from trusted metadata', () => {
    for (const artifactClass of ['source_history', 'audit_log', 'security_evidence'] as const) {
      const trusted = artifact({ artifactClass });
      const result = evaluateStaleTruthDeletion(deletionInput({ staleArtifact: trusted,
        trustedArtifactIndex: new Map([[trusted.artifactId, trusted]]) }));
      expect(result.deletionAuthority).toBe('denied');
      expect(result.findings).toContain('stale_deletion_artifact_not_deletable');
    }
  });

  it('denies a proof cookie missing from trusted receipt storage', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({ trustedProofCookieIndex: new Map() }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_cookie_not_trusted');
  });

  it('denies caller rewriting of a trusted proof cookie', () => {
    const tampered = proofCookie({ headSha: OTHER_HEAD_SHA, replacementDiffFingerprint: OTHER_DIFF_FINGERPRINT });
    const trusted = proofCookie();
    const result = evaluateStaleTruthDeletion(deletionInput({ proofCookie: tampered,
      trustedProofCookieIndex: new Map([[COOKIE_ID, trusted]]) }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_cookie_integrity_mismatch');
  });

  it('still enforces proposed/unverified state when that is what trusted storage contains', () => {
    const cookie = proofCookie({ state: 'proposed', actorIdentityState: 'unverified' });
    const result = evaluateStaleTruthDeletion(deletionInput({ proofCookie: cookie,
      trustedProofCookieIndex: new Map([[COOKIE_ID, cookie]]) }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining(['stale_deletion_cookie_not_proven', 'stale_deletion_cookie_actor_unverified']));
  });

  it('binds deletion to the full current parallel identity, not only base/head', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({ parallelAudit: {
      ...evaluateParallelFixAudit(input()), currentRepository: 'jussray/other',
    } }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('stale_deletion_parallel_identity_mismatch');
  });

  it('rejects stale current truth even with a fresh cookie', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({ current: snapshot({ actorId: 'auditor', observedAt: '2026-08-27T18:04:59.999Z' }) }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_current_observation_stale');
  });

  it('rejects future or malformed current truth time', () => {
    const result = evaluateStaleTruthDeletion(deletionInput({ current: snapshot({ actorId: 'auditor', observedAt: 'not-a-time' }) }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toContain('stale_deletion_current_observation_time_unknown');
  });

  it('never deletes current replacement truth itself', () => {
    const currentArtifact = artifact({ fingerprint: DIFF_FINGERPRINT });
    const cookie = proofCookie({ supersededArtifactFingerprint: DIFF_FINGERPRINT });
    const result = evaluateStaleTruthDeletion(deletionInput({ staleArtifact: currentArtifact, proofCookie: cookie,
      trustedArtifactIndex: new Map([[currentArtifact.artifactId, currentArtifact]]),
      trustedProofCookieIndex: new Map([[COOKIE_ID, cookie]]) }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('stale_deletion_current_truth_targeted');
  });

  it('denies cookies that do not bind the exact stale artifact', () => {
    const cookie = proofCookie({ supersededArtifactFingerprint: OTHER_STALE_ARTIFACT_FINGERPRINT });
    const result = evaluateStaleTruthDeletion(deletionInput({ proofCookie: cookie,
      trustedProofCookieIndex: new Map([[COOKIE_ID, cookie]]) }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('stale_deletion_cookie_supersession_mismatch');
  });

  it('supports a valid trusted branch-only supersession cookie', () => {
    const branchParallel = evaluateParallelFixAudit(input({ builder: snapshot({ prNumber: null }),
      auditor: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }) }));
    const cookie = proofCookie({ prNumber: null });
    const result = evaluateStaleTruthDeletion(deletionInput({ parallelAudit: branchParallel,
      current: snapshot({ prNumber: null, actorId: 'auditor', observedAt: AUDITOR_OBSERVED_AT }), proofCookie: cookie,
      trustedProofCookieIndex: new Map([[COOKIE_ID, cookie]]) }));
    expect(result.deletionAuthority).toBe('authorized');
  });

  it('denies stale or older-than-current trusted proof cookies', () => {
    const cookie = proofCookie({ observedAt: '2026-08-27T18:04:00.000Z' });
    const result = evaluateStaleTruthDeletion(deletionInput({ proofCookie: cookie,
      trustedProofCookieIndex: new Map([[COOKIE_ID, cookie]]) }));
    expect(result.deletionAuthority).toBe('denied');
    expect(result.findings).toEqual(expect.arrayContaining(['stale_deletion_cookie_older_than_current', 'stale_deletion_cookie_observation_stale']));
  });
});
