export type MergeAuthoritySource =
  | {
      kind: 'current-main-policy';
      policySha: string;
      currentMainSha: string;
      merged: boolean;
    }
  | {
      kind: 'provider-enforcement';
      providerReadbackObserved: boolean;
    }
  | {
      kind: 'current-you-authorization';
      authenticated: boolean;
      exactHeadSha: string;
      approvedHeadSha: string;
      fresh: boolean;
      revoked: boolean;
    }
  | {
      kind: 'pull-request-proposal';
      state: 'open' | 'draft' | 'closed-unmerged' | 'superseded' | 'merged';
      prNumber: number;
    };

export type MergeAuthorityDecision = Readonly<{
  authoritative: boolean;
  reason:
    | 'current-main-policy'
    | 'provider-readback'
    | 'fresh-current-you'
    | 'proposal-only'
    | 'stale-or-unverified';
}>;

export function classifyMergeAuthority(source: MergeAuthoritySource): MergeAuthorityDecision {
  if (source.kind === 'pull-request-proposal') {
    return Object.freeze({ authoritative: false, reason: 'proposal-only' });
  }

  if (source.kind === 'current-main-policy') {
    const authoritative = source.merged && source.policySha === source.currentMainSha;
    return Object.freeze({
      authoritative,
      reason: authoritative ? 'current-main-policy' : 'stale-or-unverified',
    });
  }

  if (source.kind === 'provider-enforcement') {
    return Object.freeze({
      authoritative: source.providerReadbackObserved,
      reason: source.providerReadbackObserved ? 'provider-readback' : 'stale-or-unverified',
    });
  }

  const authoritative =
    source.authenticated &&
    source.fresh &&
    !source.revoked &&
    source.exactHeadSha === source.approvedHeadSha;

  return Object.freeze({
    authoritative,
    reason: authoritative ? 'fresh-current-you' : 'stale-or-unverified',
  });
}
