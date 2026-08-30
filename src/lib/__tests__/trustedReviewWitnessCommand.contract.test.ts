import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDeterministicReviewRules } from '../../review/deterministicReviewProducer.js';

const reviewWorkflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);

describe('trusted review witness command contract', () => {
  it('accepts only the immutable founder identity on governance issue 418', () => {
    expect(reviewWorkflow).toContain('issue_comment:');
    expect(reviewWorkflow).toContain("github.event_name == 'issue_comment'");
    expect(reviewWorkflow).toContain('github.event.issue.number == 418');
    expect(reviewWorkflow).toContain('github.event.comment.user.id == 286642846');
    expect(reviewWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(reviewWorkflow).toContain("startsWith(github.event.comment.body, '/review-witness ')");
    expect(reviewWorkflow).toContain(
      'Expected exactly: /review-witness <pull-request-number> <40-char-current-main-sha>',
    );
    expect(reviewWorkflow).toContain("re.fullmatch(r'[1-9][0-9]{0,8}', pr_number)");
    expect(reviewWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', main_sha)");
  });

  it('fails closed unless the command names exact current main and an open PR targeting it', () => {
    expect(reviewWorkflow).toContain('/git/ref/heads/main');
    expect(reviewWorkflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(reviewWorkflow).toContain('pulls/${PR_NUMBER}');
    expect(reviewWorkflow).toContain("test \"$state\" = 'open'");
    expect(reviewWorkflow).toContain("test \"$base_ref\" = 'main'");
    expect(reviewWorkflow).toContain('test "$base_sha" = "$EXPECTED_MAIN_SHA"');
  });

  it('scopes workflow-dispatch write authority to the founder command job', () => {
    const commandJob = reviewWorkflow.split('  dispatch-trusted-witness:')[1]?.split('  publish-trusted-witness:')[0] ?? '';
    expect(commandJob).toContain('actions: write');
    expect(commandJob).toContain('contents: read');
    expect(commandJob).toContain('issues: read');
    expect(commandJob).toContain('pull-requests: read');
    expect(commandJob).not.toContain('contents: write');
    expect(commandJob).not.toContain('issues: write');
    expect(commandJob).not.toContain('pull-requests: write');
  });

  it('hard-codes the trusted witness workflow and binds dispatch to founder-supplied main', () => {
    expect(reviewWorkflow).toContain(
      '/actions/workflows/deterministic-review-core-advisory.yml/dispatches',
    );
    expect(reviewWorkflow).toContain('--arg ref main');
    expect(reviewWorkflow).toContain('--arg pr "$PR_NUMBER"');
    expect(reviewWorkflow).not.toContain('--argjson pr "$PR_NUMBER"');
    expect(reviewWorkflow).toContain('--arg expected_main_sha "$EXPECTED_MAIN_SHA"');
    expect(reviewWorkflow).toContain(
      "'{ref:$ref, inputs:{pull_request_number:$pr, expected_main_sha:$expected_main_sha}}'",
    );

    expect(reviewWorkflow).not.toContain('/actions/workflows/deploy.yml/dispatches');
    expect(reviewWorkflow).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(reviewWorkflow).not.toContain('supabase');
    expect(reviewWorkflow).not.toContain('wrangler');
    expect(reviewWorkflow).not.toContain('CLOUDFLARE_');
    expect(reviewWorkflow).not.toContain('SUPABASE_');
  });

  it('requires workflow dispatch to carry the founder-bound main SHA into trusted publication', () => {
    expect(reviewWorkflow).toContain('workflow_dispatch:');
    expect(reviewWorkflow).toContain('pull_request_number:');
    expect(reviewWorkflow).toContain('expected_main_sha:');
    expect(reviewWorkflow).toContain('Founder-bound exact current main SHA for this witness request');
    expect(reviewWorkflow).toContain('EXPECTED_FOUNDER_MAIN_SHA: ${{ inputs.expected_main_sha }}');
    expect(reviewWorkflow).toContain('[[ "$EXPECTED_FOUNDER_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(reviewWorkflow).toContain(
      'test "$EXPECTED_FOUNDER_MAIN_SHA" = "$EXPECTED_TRUSTED_MAIN_SHA"',
    );
    expect(reviewWorkflow).toContain('test "$EXPECTED_FOUNDER_MAIN_SHA" = "$current_main"');
  });

  it('leaves review publication and provider readback inside founder-bound exact current-main code', () => {
    expect(reviewWorkflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
    );
    expect(reviewWorkflow).toContain('environment: production');
    expect(reviewWorkflow).toContain('EXPECTED_TRUSTED_MAIN_SHA: ${{ github.sha }}');
    expect(reviewWorkflow).toContain('GITHUB_APP_ID: ${{ secrets.APP_ID }}');
    expect(reviewWorkflow).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(reviewWorkflow).not.toContain('secrets.GITHUB_APP_ID');
    expect(reviewWorkflow).not.toContain('secrets.GITHUB_PRIVATE_KEY');
    expect(reviewWorkflow).toContain('test "$EXPECTED_TRUSTED_MAIN_SHA" = "$current_main"');
    expect(reviewWorkflow).toContain('node scripts/publish-deterministic-review-witness.mjs');
    expect(reviewWorkflow).toContain('Re-read trusted main after publication');
    expect(reviewWorkflow).toContain('founder_bound_main=%s');
  });

  it('keeps the command inside an existing P1 deterministic-review trust root', () => {
    const findings = evaluateDeterministicReviewRules([{
      path: '.github/workflows/deterministic-review-core-advisory.yml',
      status: 'modified',
      additions: 1,
      deletions: 1,
      patch: '@@ -1 +1 @@\n-old\n+new',
    }]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'trust-root-self-modification',
        severity: 'P1',
        path: '.github/workflows/deterministic-review-core-advisory.yml',
      }),
    ]));
  });

  it('states that dispatch is evidence only, never merge or release authority', () => {
    expect(reviewWorkflow).toContain(
      'Verdict, Founder Final, merge, deploy, provider, database, secret, and publication authority: none granted by this command',
    );
  });

  it('binds governance reconciliation to immutable founder identity and exact current main', () => {
    const governanceJob = reviewWorkflow.split('  reconcile-fcr-governance:')[1] ?? '';

    expect(governanceJob).toContain("github.event_name == 'issue_comment'");
    expect(governanceJob).toContain('github.event.issue.number == 418');
    expect(governanceJob).toContain('github.event.comment.user.id == 286642846');
    expect(governanceJob).toContain("github.event.comment.user.login == 'jussray'");
    expect(governanceJob).toContain("startsWith(github.event.comment.body, '/reconcile-fcr-governance ')");
    expect(governanceJob).toContain(
      'Expected exactly: /reconcile-fcr-governance <40-char-current-main-sha> <approval-reference>',
    );
    expect(governanceJob).toContain("re.fullmatch(r'[0-9a-f]{40}', main_sha)");
    expect(governanceJob).toContain('test "$actual" = "$EXPECTED_MAIN_SHA"');
    expect(governanceJob).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(governanceJob).toContain('main moved before governance reconciliation');
    expect(governanceJob).toContain('main moved during governance reconciliation');
  });

  it('keeps provider-policy mutation inside production App authority and the canonical provider factory', () => {
    const governanceJob = reviewWorkflow.split('  reconcile-fcr-governance:')[1] ?? '';

    expect(governanceJob).toContain('environment: production');
    expect(governanceJob).toContain('GITHUB_APP_ID: ${{ secrets.APP_ID }}');
    expect(governanceJob).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(governanceJob).not.toContain('secrets.GITHUB_APP_ID');
    expect(governanceJob).not.toContain('secrets.GITHUB_PRIVATE_KEY');
    expect(governanceJob).toContain("from './dist/providers/providerFactory.js'");
    expect(governanceJob).toContain('providerForProject(PROJECT)');
    expect(governanceJob).toContain('provider.applyBranchRuleset(PROJECT_ID');
    expect(governanceJob).toContain('name: FOUNDER_CONTROL_ROOM_CANONICAL_RULESET_NAME');
    expect(governanceJob).toContain("targetRefs: ['main']");
    expect(governanceJob).toContain('requirePullRequest: true');
    expect(governanceJob).toContain('requiredApprovingReviewCount: 1');
    expect(governanceJob).toContain("requiredStatusCheckNames: ['Required Gate', 'Verify test-ledger contract']");
    expect(governanceJob).toContain('blockForcePushes: true');
    expect(governanceJob).toContain('blockDeletion: true');
    expect(governanceJob).toContain("bypassActors: [{ kind: 'app', id: appId }]");

    expect(governanceJob).not.toContain('/rulesets');
    expect(governanceJob).not.toContain('wrangler');
    expect(governanceJob).not.toContain('supabase');
    expect(governanceJob).not.toContain('/actions/workflows/deploy.yml/dispatches');
    expect(governanceJob).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
  });

  it('requires a full provider topology READY readback before declaring governance reconciliation complete', () => {
    const governanceJob = reviewWorkflow.split('  reconcile-fcr-governance:')[1] ?? '';

    expect(governanceJob).toContain("from './scripts/audit-github-governance-preflight.mjs'");
    expect(governanceJob).toContain("from './dist/providers/githubAppAuth.js'");
    expect(governanceJob).toContain('collectGovernancePreflight({');
    expect(governanceJob).toContain("targetRef: 'main'");
    expect(governanceJob).toContain('trustedGitHubAppId: appId');
    expect(governanceJob).toContain("if (topology.status !== 'READY')");
    expect(governanceJob).toContain('FCR governance topology failed full provider preflight');
    expect(governanceJob).toContain('full_topology_preflight=${topology.status}');
    expect(governanceJob).toContain('Full provider topology preflight: `READY` required before this completion summary can run');
  });

  it('retains sanitized reconciliation evidence even after partial provider mutation failure', () => {
    const governanceJob = reviewWorkflow.split('  reconcile-fcr-governance:')[1] ?? '';

    expect(governanceJob).toContain('let providerMutationAttempted = false;');
    expect(governanceJob).toContain('providerMutationAttempted = true;');
    expect(governanceJob).toContain('} catch (error) {');
    expect(governanceJob).toContain('} finally {');
    expect(governanceJob).toContain("providerMutationAttempted ? 'UNKNOWN_OR_PARTIAL' : 'NOT_ATTEMPTED'");
    expect(governanceJob).toContain("schema: 'fcr/github-governance-reconcile@v2'");
    expect(governanceJob).toContain('providerMutationState,');
    expect(governanceJob).toContain('topology,');
    expect(governanceJob).toContain('failure,');

    const receiptUpload = governanceJob.split('- name: Retain sanitized governance reconciliation receipt')[1] ?? '';
    expect(receiptUpload).toContain('if: always()');
  });

  it('emits a sanitized provider receipt without widening authority', () => {
    const governanceJob = reviewWorkflow.split('  reconcile-fcr-governance:')[1] ?? '';

    expect(governanceJob).toContain("'artifacts/github-governance-reconcile.json'");
    expect(governanceJob).toContain("schema: 'fcr/github-governance-reconcile@v2'");
    expect(governanceJob).toContain('approvalReference');
    expect(governanceJob).toContain('commandCommentId');
    expect(governanceJob).toContain('result,');
    expect(governanceJob).toContain(
      'Merge, deployment, database, secret/credential, billing, publication, and branch-deletion authority: none granted by this command',
    );
    expect(governanceJob).not.toContain('console.log(process.env.GITHUB_PRIVATE_KEY');
    expect(governanceJob).not.toContain('console.log(process.env.GITHUB_APP_ID');
  });
});
