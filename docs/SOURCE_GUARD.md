# Source Guard — README and evidence integrity

## Purpose

Source Guard is a bounded, read-only CI check for selected repo-controlled claims. It helps prevent the documented Sauce Guard and conversion-tracking boundaries from silently drifting away from source contracts. It **complements**, but does not replace, the [Documentation Truth](../.github/workflows/documentation-truth.yml) gate.

## What is checked

The verifier at scripts/verify-sauce-source-guard.mjs reads a declared set of repository files and fails when:

1. The README loses its links to these two guard documents or its source-only disclaimer.
2. The existing Sauce Guard skill loses its evidence, founder-approval, provider-readback or private-sauce boundary.
3. The conversion-tracking contract loses its four-event allowlist, personal-data exclusions, project/origin boundaries or explicit-approval-before-deletion rule.
4. Guard documentation stops distinguishing source checks from live publication and customer-conversion outcomes.
5. Founder merge documentation no longer requires exact repository, PR, base and head approval.

The structured public-draft validator rejects unsupported claim states, missing CURRENT evidence or dates, undated HISTORICAL claims, and obvious credential markers. This is a **review helper** only; a validator pass never authorizes publication.

## Truth layers

- **SOURCE IMPLEMENTED:** repository files and checks exist.
- **CONFIGURED:** provider/runtime setup independently observed.
- **ACTIVE:** intended live path exercised.
- **PROVEN:** current exact-subject evidence supports the particular outcome.

These states cannot be silently promoted. For example, the [portfolio conversion contract](PORTFOLIO_CONVERSION_TRACKING.md) retains site-wiring and conversion-outcome UNKNOWN status until independently exercised and verified.

## CI and permissions

The separate GitHub Actions workflow at .github/workflows/sauce-source-guard.yml checks out the exact PR head or merge-group candidate, checks its SHA, and runs read-only validation and Node regression tests. It requests contents: read only. No provider, publication, database write, deletion or deploy credential is needed.

## Rollback and limits

Changes can be reversed via a separately reviewed source revision without deleting historical evidence. A green static check cannot prove all README statements are accurate, all private details are screened, live permission checks work, or users have converted. Consequential changes still require current, exact founder authorization under [Founder Merge Authority](FOUNDER_MERGE_AUTHORITY.md).


## Supabase evidence boundary — October 24, 2026

The active FCR Supabase project **oojzfmmywbvficgybaxd** accepted migration
`20261024231659_sauce_source_guard_minimal_evidence_boundary`. The migration
is mirrored in [source](../supabase/migrations/20261024231659_sauce_source_guard_minimal_evidence_boundary.sql).
Fresh catalog readback on October 25, 2026 verified
`public.guard_source_verification_receipts` exists with RLS enabled, no RLS
policies, no `anon` or `authenticated` table grants, and `service_role`
granted only SELECT and INSERT. The table had zero rows at that readback.

The table stores **bounded source/catalog observation metadata only**: guard
name, scope, FCR repository/commit identity, scoped result, optional GitHub
evidence URL, observation time, and recording time. A `passed` record requires
a GitHub evidence URL, but existence of a URL or row **does not prove** that the
referenced check actually passed. Consumers must independently verify that
evidence against the exact version. It is not a second approval ledger and
**never grants** merge, deployment, deletion, or publication permission.
Existing approval and provider-readback records remain authoritative.

Historical drift disclosure: at the initial audit, Supabase history contained
`20261013223238_restrict_reconciliation_events_authenticated_read_20261013`
without matching Git source. PR #995 later restored that applied migration and
the Sauce/Source receipt migration source plus both preview contracts without
replaying SQL or editing remote migration history. Post-merge exact-main
verification at `fb9998c670f01a86b684290472d61a3775c0f9ff` observed
112 remote and 112 local migration versions with zero drift. That parity is a
dated observation, not permanent truth; future repository or provider movement
requires fresh reconciliation.
