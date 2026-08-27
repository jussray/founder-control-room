import type { UltrathinkActionContract } from './coreContract.js';

export interface MergeIntentAuthoritySource {
  missionId: string;
  projectId: string;
  targetBranch: string;
  approvedBaseSha: string;
  approvedHeadSha: string;
  approvalProofId: string;
  approvedBy: string;
  proofExpiresAt: string;
  revision: number;
}

export interface MergeIntentProofSource {
  id: string;
  status: 'pass' | 'fail' | 'not_evaluated';
  ranAt: string;
}

export function mergeIntentToUltrathinkContract(
  intent: MergeIntentAuthoritySource,
  proof: MergeIntentProofSource,
): UltrathinkActionContract {
  return {
    identity: {
      kind: 'merge',
      projectId: intent.projectId,
      resourceId: intent.missionId,
      target: `${intent.targetBranch}@${intent.approvedBaseSha}`,
      candidate: intent.approvedHeadSha,
    },
    evidence: [{
      id: proof.id || intent.approvalProofId,
      gateId: 'merge',
      state: proof.status,
      observedAt: proof.ranAt,
      expiresAt: intent.proofExpiresAt,
    }],
    authority: {
      approvedBy: intent.approvedBy,
      expiresAt: intent.proofExpiresAt,
      revision: intent.revision,
    },
  };
}
