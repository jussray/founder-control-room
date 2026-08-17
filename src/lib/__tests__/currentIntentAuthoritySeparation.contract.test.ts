import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const truthLeaseSource = readFileSync(
  new URL('../truthLease.ts', import.meta.url),
  'utf8',
);
const founderContentAuthority = readFileSync(
  new URL('../../../tools/zapier/founder-content-authorization-contract.cjs', import.meta.url),
  'utf8',
);
const workerGitPolicy = JSON.parse(
  readFileSync(
    new URL('../../../config/cloudflare-worker-git-authority-policy.json', import.meta.url),
    'utf8',
  ),
);

describe('Current You vs once-true authority separation', () => {
  it('revalidates provider/runtime facts at the boundary where they are used', () => {
    expect(truthLeaseSource).toContain('evaluateTruthLeaseAtUse');
    expect(truthLeaseSource).toContain("TruthUseBoundary = 'merge' | 'deploy' | 'schedule' | 'publish' | 'completion-claim'");
    expect(truthLeaseSource).toContain('observation is stale at use time');
    expect(truthLeaseSource).toContain("mayUseClaim: state === 'current'");
  });

  it('does not turn durable founder preference into reusable execution approval', () => {
    expect(workerGitPolicy.currentFounderIntent.persistsUntilSuperseded).toBe(true);
    expect(workerGitPolicy.currentFounderIntent.freshApprovalRequiredForConsequentialMutation).toBe(true);
    expect(workerGitPolicy.canAuthorizeProviderMutation).toBe(false);
    expect(workerGitPolicy.currentFounderIntent.historicalDecisionsCanAuthorize).toBe(false);
  });

  it('keeps FutureYou and historical content intent advisory while Current You authorizes exact public copy', () => {
    expect(founderContentAuthority).toContain("proposal.authority?.future_you_advisory_only !== true");
    expect(founderContentAuthority).toContain("proposal.authority?.historical_content_intent_authoritative !== false");
    expect(founderContentAuthority).toContain("proposal.authority?.analytics_can_authorize_publish !== false");
    expect(founderContentAuthority).toContain("currentYou.source !== 'current_authenticated_founder'");
    expect(founderContentAuthority).toContain('approval public_payload_hash does not match exact public copy');
    expect(founderContentAuthority).toContain('approval must explicitly supersede stale content intent');
  });

  it('preserves the sauce boundary while allowing verified progress claims', () => {
    expect(founderContentAuthority).toContain('all public product-progress claims must be identified, verified, and public-safe');
    expect(founderContentAuthority).toContain('verified private internal evidence is required');
    expect(founderContentAuthority).toContain('proposal contains blocked disclosure categories');
    expect(founderContentAuthority).toContain("proposal sauce scanner version must be sauce-guard-v1");
  });
});
