# PR #817 / Main reconciliation truth

This addendum preserves PR #817 truths that collided textually with newer `main` documentation while keeping current-main governance and provider documentation authoritative.

## Authority rule

This document is evidence/governance context only. It grants no merge, deploy, publication, provider mutation, spend, secret, billing, database-mutation, deletion, or external-contact authority. Exact-head proof and fresh exact-candidate founder approval remain separate gates.

## Post-deploy reconciliation

Post-Deploy Reconciliation is a load-bearing production gate, not a best-effort observer. After smoke-test, canonical Deploy must run reconciliation in the production environment and require success before proof-of-ship can continue. The reconciler must bind the deployed `/version` identity to the canonical Founder Control Room service and Supabase project before database state can support a release claim. Checked-in reconciliation source, green source tests, or provider upload success do not prove current deployed runtime/database state.

## Founder-content analytics imports

Normalized founder-content analytics CSV input is observation evidence, not action authority. A valid import must retain content/provider identity, account and page identity, audience/metric semantics, bounded measurement windows, observation time, source reference/hash, and deterministic logical provenance. Blank metrics remain unknown rather than zero. Identical logical duplicates may collapse idempotently; conflicting duplicates fail closed.

Import parsing, fixture proof, or regenerated receipts do not establish current provider truth. Present-tense analytics claims still require authorized provider evidence with current account/page identity and freshness. Renaming identical source bytes, changing presentation metadata, or regenerating a receipt must not manufacture a second logical import. Analytics evidence alone cannot authorize publication, scheduling, provider mutation, merge, deploy, spend, or external contact.

## Cross-repository federation freshness

The StoryEngine peer ref/SHA is an evidence subject, not a durable alias for current StoryEngine. Moving either peer pin expires predecessor FCR federation/browser proof. A newly observed peer can select the next evidence subject, but the successor remains UNKNOWN until the complete exact-head FCR → StoryEngine → receipt → FCR runtime/browser witness succeeds. Pin alignment alone grants no merge, deploy, production, or provider-mutation authority.

## GoalFix provider-proof boundary

A workflow catalog may describe repository test inventory without being provider pass evidence. When a repository declares `catalogIsPassEvidence: false`, GoalFix must fail closed unless an explicit bounded provider-check policy supplies the exact provider check-run names. Workflow display names must not be silently promoted into exact-head provider proof.

## Reconciliation choice

Where PR #817 and newer `main` edited the same governance surfaces, current-main semantics win unless the PR invariant remains independently required. In particular, the current-main Repository Settings contract requiring one approving review supersedes #817's older browser expectation of zero approving reviews. This is an explicit authority-age decision, not an accidental conflict resolution.

## Verification materialization

After the two-parent reconciliation was fast-forwarded onto the PR branch, this small truth-only commit was intentionally written through GitHub's normal contents path so the pull request emits a standard synchronize event and re-materializes exact-head CI, browser, documentation, security, and continuity proof. It changes no runtime or provider authority and predecessor green remains stale.
