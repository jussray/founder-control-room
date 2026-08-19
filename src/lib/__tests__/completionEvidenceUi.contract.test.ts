import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bridgePath = fileURLToPath(
  new URL('../../../public/control-room/v10-plan-bridge.js', import.meta.url),
);
const source = readFileSync(bridgePath, 'utf8');

describe('Founder Control Room completion claim UI contract', () => {
  it('never upgrades an execution response to completion without a named receipt and exact evidence', () => {
    expect(source).toContain("response.clone().json()");
    expect(source).toContain("completion is not claimed: execution receipt unavailable");
    expect(source).toContain("exact completion evidence is incomplete");
    expect(source).toContain("Merge witnessed. Evidence: execution ${receipt}");
    expect(source).toContain("Branch witnessed. Evidence: execution ${receipt}");
    expect(source).toContain("result.expectedHeadSha");
    expect(source).toContain("result.evidence");
  });

  it('downgrades provider success when downstream state reports warnings', () => {
    expect(source).toContain("Array.isArray(result.warnings)");
    expect(source).toContain("completion is not claimed. Evidence: execution ${receipt}. Warning:");
    expect(source).toContain("status: 'incomplete'");
  });

  it('replaces legacy optimistic claims with an explicit claim status', () => {
    expect(source).toContain("'Merge executed.'");
    expect(source).toContain("'Branch created.'");
    expect(source).toContain("applyEvidenceBackedCompletionClaim");
    expect(source).toContain("notice.dataset.completionClaim");
    expect(source).toContain("notice.dataset.claimStatus");
    expect(source).toContain("notice.dataset.evidenceCount");
    expect(source).toContain("'witnessed'");
    expect(source).toContain("'incomplete'");
    expect(source).toContain("'unverified'");
  });

  it('emits sanitized analytics for claim quality without leaking execution payloads', () => {
    expect(source).toContain("new CustomEvent('fcr:completion-claim'");
    expect(source).toContain('claimStatus: claim.status');
    expect(source).toContain('evidenceKinds: claim.evidenceKinds');
    expect(source).toContain('evidenceCount: claim.evidenceKinds.length');
    expect(source).toContain('warningCount: claim.warningCount');
    expect(source).not.toContain('detail: evidence.payload');
  });

  it('correlates concurrent completion evidence with a bounded expiring same-action queue', () => {
    expect(source).toContain('const pendingExecutionEvidence = []');
    expect(source).toContain('const completionEvidenceTtlMs = 30_000');
    expect(source).toContain('const maxPendingExecutionEvidence = 8');
    expect(source).toContain('prunePendingExecutionEvidence');
    expect(source).toContain('enqueueExecutionEvidence(body.actionType, payload)');
    expect(source).toContain('findIndex((entry) => entry.actionType === actionType)');
    expect(source).toContain('pendingExecutionEvidence.splice(index, 1)[0]');
  });

  it('fails closed when a legacy success notice has no matching execution evidence', () => {
    expect(source).toContain('evidence?.payload ?? null');
    expect(source).toContain('applyClaimToNotice(notice, actionType, evidence?.payload ?? null)');
    expect(source).not.toContain('let lastExecutionEvidence = null');
  });
});
