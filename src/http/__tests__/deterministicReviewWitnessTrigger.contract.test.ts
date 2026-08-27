import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const routeMarker = "'/review/deterministic-witness/:pullRequestNumber'";
const routeStart = serverSource.indexOf(routeMarker);
const routeEnd = serverSource.indexOf("app.use('/', onboardingRouter)", routeStart);
const routeSource = routeStart >= 0 && routeEnd > routeStart
  ? serverSource.slice(routeStart, routeEnd)
  : '';

describe('deterministic review witness trigger contract', () => {
  it('keeps the trigger inside the founder-only privileged runtime membrane', () => {
    expect(routeSource).not.toBe('');
    expect(routeSource).toContain('requireFounder');
    expect(routeSource).toContain("requirePortfolioSwitchOn('fcr-privileged-execution-master')");
    expect(routeSource).toContain('publishDeterministicReviewWitness');
  });

  it('pins repository/provider identity in server-owned source instead of request input', () => {
    expect(serverSource).toContain("repo_provider: 'github'");
    expect(serverSource).toContain("slug: 'founder-control-room'");
    expect(serverSource).toContain("repo_identifier: 'jussray/founder-control-room'");
    expect(routeSource).not.toContain('req.body');
    expect(routeSource).not.toContain('req.query');
  });

  it('fails closed unless the running release is the exact current main SHA', () => {
    expect(routeSource).toContain('process.env.GIT_SHA');
    expect(routeSource).toContain('EXACT_COMMIT_SHA.test(runtimeSha)');
    expect(routeSource).toContain("provider.resolveRef(FCR_REVIEW_PROJECT.slug, 'main')");
    expect(routeSource).toContain('currentMainSha.toLowerCase() !== runtimeSha.toLowerCase()');
    expect(routeSource).toContain('currentMainAfter.toLowerCase() !== runtimeSha.toLowerCase()');
    expect(routeSource).toContain('requires the exact current main runtime');
  });

  it('accepts only a positive PR number and returns non-authorizing witness metadata', () => {
    expect(routeSource).toContain('Number(req.params.pullRequestNumber)');
    expect(routeSource).toContain('Number.isInteger(pullRequestNumber)');
    expect(routeSource).toContain('pullRequestNumber <= 0');
    expect(routeSource).toContain('proposalOnly: true');
    expect(routeSource).toContain('mergeAuthorized: false');
    expect(routeSource).toContain('executionAuthorized: false');
    expect(routeSource).toContain('reviewHash: production.receipt.reviewHash');
    expect(routeSource).toContain('evidenceFingerprint: signal.evidenceFingerprint ?? null');
    expect(routeSource).toContain('issuer: signal.issuer ?? null');
  });
});
