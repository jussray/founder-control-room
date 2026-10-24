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
