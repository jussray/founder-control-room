import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/reconcile-fcr-governance-phase.yml', import.meta.url),
  'utf8',
);

describe('FCR governance phase command contract', () => {
  it('accepts only the founder on governance issue 418 and only the phase command', () => {
    expect(workflow).toContain('issue_comment:');
    expect(workflow).toContain('github.event.issue.number == 418');
    expect(workflow).toContain('github.event.comment.user.id == 286642846');
    expect(workflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(workflow).toContain("startsWith(github.event.comment.body, '/reconcile-fcr-governance-phase ')");
    expect(workflow).toContain(
      'Expected exactly: /reconcile-fcr-governance-phase <40-char-current-main-sha> <founder_only|independent_review> <approval-reference>',
    );
    expect(workflow).toContain("phase not in {'founder_only', 'independent_review'}");
  });

  it('binds provider mutation to exact current main before and after reconciliation', () => {
    expect(workflow).toContain('/git/ref/heads/main');
    expect(workflow).toContain('test "$checked_out" = "$EXPECTED_MAIN_SHA"');
    expect(workflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(workflow).toContain('main moved before governance reconciliation');
    expect(workflow).toContain('main moved during governance reconciliation');
    expect(workflow).toContain('Re-read exact main after provider mutation');
  });

  it('derives the review count from the bounded phase enum instead of accepting caller count input', () => {
    expect(workflow).toContain("const PHASES = new Set(['founder_only', 'independent_review']);");
    expect(workflow).toContain("const requiredApprovingReviewCount = phase === 'founder_only' ? 0 : 1;");
    expect(workflow).toContain('governancePhase: phase');
    expect(workflow).toContain('requiredApprovingReviewCount,');
    expect(workflow).not.toContain('<required-approving-review-count>');
  });

  it('preserves the non-review constitutional floor in both phases', () => {
    expect(workflow).toContain('requirePullRequest: true');
    expect(workflow).toContain("requiredStatusCheckNames: ['Required Gate', 'Verify test-ledger contract']");
    expect(workflow).toContain('blockForcePushes: true');
    expect(workflow).toContain('blockDeletion: true');
    expect(workflow).toContain("bypassActors: [{ kind: 'app', id: appId }]");
    expect(workflow).toContain('Strict exact-head status checks remain zero-bypass.');
    expect(workflow).toContain('CodeQL, force-push protection, deletion protection, and pull-request enforcement remain active.');
  });

  it('uses production App authority and the canonical provider instead of raw ruleset HTTP writes', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('GITHUB_APP_ID: ${{ secrets.APP_ID }}');
    expect(workflow).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(workflow).toContain("from './dist/providers/providerFactory.js'");
    expect(workflow).toContain('providerForProject(PROJECT)');
    expect(workflow).toContain('provider.applyBranchRuleset(PROJECT_ID');
    expect(workflow).not.toContain('api.github.com/repos/jussray/founder-control-room/rulesets');
  });

  it('requires phase-aware provider readback READY before success', () => {
    expect(workflow).toContain("from './scripts/audit-fcr-governance-phase.mjs'");
    expect(workflow).toContain('collectFcrGovernancePhase({');
    expect(workflow).toContain('phase,');
    expect(workflow).toContain("if (topology.status !== 'READY' || topology.governancePhase !== phase)");
    expect(workflow).toContain('FCR governance phase provider readback failed');
  });

  it('retains a sanitized partial-failure receipt and grants no unrelated authority', () => {
    expect(workflow).toContain("schema: 'fcr/github-governance-phase-reconcile@v1'");
    expect(workflow).toContain('providerMutationAttempted');
    expect(workflow).toContain("providerMutationAttempted ? 'UNKNOWN_OR_PARTIAL' : 'NOT_ATTEMPTED'");
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain(
      'Merge, deployment, database, credential, billing, publication, and branch-deletion authority: none granted by this command.',
    );
    expect(workflow).not.toContain('console.log(process.env.GITHUB_PRIVATE_KEY');
  });
});
