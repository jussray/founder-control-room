# Main Release Provenance Recovery — 2026-09-05

## Incident

Two founder-support changes were committed directly to `main`:

- `1d8d59bd88640cf6d24fa282c7073cadca6c2b15` — support surface implementation
- `e288d024c38c8ca1bccff4fcd3b0ad871236551a` — rendered Playwright verification

The product/source checks for the support rail were green, but the `Main Release Provenance` workflow correctly rejected `e288d024c38c8ca1bccff4fcd3b0ad871236551a` because the current `main` SHA was not itself a merged pull-request merge commit.

## Historical truth

The direct commits remain historical repository facts. This recovery does not rewrite, delete, force-move, squash away, or relabel those commits.

Historical truth is immutable. Current truth must be re-observed.

## Recovery

This pull request is release-truth-only: it restores current release provenance through the repository's normal pull-request path, preserves the superseded Se’kret Bip adapter refresh request as historical evidence, and carries the cross-plane contradiction rule in the existing Founder Control Room operator skill. It does not change product runtime behavior.

At the time of this historical recovery, `scripts/verify-main-release-provenance.mjs` used the reason `reviewed_pr_merge_provenance` for an exact merged-PR association. A later 2026-09-07 correction narrows that machine claim to `pr_merge_provenance` because the classifier does not itself inspect review or merge-authorization evidence. This correction does not rewrite the underlying 2026-09-05 incident.

It does **not** grant deployment authority, runtime authority, publication authority, review authority, or merge authority to any other carrier.

It does **not** alter PR #735 or inherit proof from PR #735.

## Acceptance criteria

A recovery is complete only when all of the following are true:

1. this branch is based on the current authoritative `main` at merge-gate evaluation; the observed base for this proof cycle is `main@af87c67e05584203b04610eb25e6f89ad8c1e7a0`;
2. required exact-head CI for this pull request is terminal and green;
3. this pull request is merged through the normal repository merge path;
4. the resulting new `main` SHA is the merge commit associated with exactly this merged pull request;
5. `Main Release Provenance` runs against that exact new `main` SHA and proves `pr_merge_provenance`; review and merge authorization remain separate evidence planes;
6. deployment/runtime/browser claims remain separate and require their own current evidence.

If `main` moves again before merge, criterion 1 expires and the branch must be reacquired against the new authoritative base before merge authority can be restored.

## Non-claims

This receipt does not claim that the current source is deployed to Cloudflare, that the public runtime serves the recovery SHA, that production behavior is verified, or that Mailchimp has a verified public signup URL.

Proof before claim.
