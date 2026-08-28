# GitHub Truth MCP v0

## Decision

Build one read-only founder-facing capability inside the existing Founder Control Room remote MCP server:

```text
Audit pull request #N in founder-control-room.
```

The tool name is `github_audit_pr`.

This is an evidence audit, not a merge recommendation or execution capability.

## Reused architecture

The implementation deliberately reuses current Founder Control Room primitives:

- existing `/mcp` remote MCP transport and OAuth/static compatibility boundary;
- existing server-held project grant;
- canonical `RepositoryProvider` / `providerForProject` construction boundary;
- existing GitHub App installation authentication, with local `GITHUB_TOKEN` fallback only where the repository already permits it;
- existing `mcp_tool_calls` redacted receipt ledger;
- existing Cloudflare Worker deployment authority;
- existing Vitest and remote MCP contract tests.

The MCP subsystem does not import Octokit, mint GitHub credentials, or construct a GitHub client for this audit. It asks the configured `RepositoryProvider` for the optional provider-neutral `auditPullRequestEvidence` capability. GitHub-specific bounded reads live inside the GitHub provider family and therefore inherit the same project mapping, credential construction, and provider governance boundary as other repository operations.

No new database migration, Worker identity, auth model, or generalized MCP platform is introduced.

## v0 repository allowlist

`github_audit_pr` is hard-scoped to:

```text
projectId: founder-control-room
repository: jussray/founder-control-room
```

The caller cannot provide an arbitrary owner or repository. Expanding this allowlist is a separate reviewed change. A configured repository provider that does not support bounded PR/MR evidence fails closed rather than falling back to a host-specific client in the MCP layer.

## Evidence gathered

The audit performs bounded provider-backed reads for:

- pull-request identity and state;
- base and head SHA;
- changed-file count and a capped changed-file summary;
- check runs bound to the observed head SHA;
- GitHub Commit Status API contexts bound to the observed head SHA;
- workflow runs filtered to the observed head SHA and reduced to the newest execution per workflow/event context;
- review events and their recorded commit SHA;
- a second pull-request read to detect load-bearing PR changes and GitHub update-cursor movement during the audit.

Checks, commit statuses, raw workflow runs, reviews, and changed-file observations are capped at 100 returned/observed provider records per collection. The provider carries explicit completeness metadata for each collection. If the provider reports or implies more evidence than the bounded observation contains, the audit returns `evidence_incomplete` with `evidence_collection_truncated`; it never promotes a partial page into complete evidence.

Workflow currentness is evaluated before the MCP classifier sees the evidence. If the same workflow/event context has an older failed execution and a newer successful replacement on the same head, only the newest execution represents the current workflow context. Raw workflow truncation still marks the lane incomplete even if this reduction leaves a small current set.

For review history over the cap, bounded provider reads may retain recent evidence, but omitted history means the reducer cannot prove that no earlier unresolved blocker exists. Therefore incomplete review history always produces `reviewDecision: unknown`; it can never publish `approved` or `none` from a truncated history.

Review state is reduced per reviewer. An outstanding `changes_requested` remains blocking across later head pushes and ordinary comments. An approval or dismissal clears that reviewer's blocker, but only an approval bound to the observed head counts as current approval. The second PR observation also compares GitHub's `updatedAt` cursor; if GitHub reports activity during evidence collection, the audit conflicts and must be repeated rather than claiming current review truth from an earlier snapshot.

The audit never requests patch contents by default.

## Deterministic classifications

`verdict` is one of:

- `evidence_complete`
- `evidence_incomplete`
- `evidence_conflicted`

These values describe evidence quality, not code quality.

Examples:

- Current CI can fail while the verdict is still `evidence_complete`: the system has complete evidence of failure.
- A failing or pending legacy GitHub commit-status context is part of CI truth and cannot be hidden by green check runs or Actions workflows.
- A known current CI failure outranks another current pending signal and remains `ciConclusion: fail`.
- An older failed workflow execution does not remain authoritative after a newer execution for the same workflow/event context supersedes it.
- Passing CI from an old SHA is `evidence_incomplete` with `ci_stale_for_head_sha`.
- An approval recorded against an older commit SHA is not counted as current approval and produces `review_approval_stale_for_head_sha`.
- An outstanding change request recorded on an older head remains blocking until that reviewer approves or the review is dismissed.
- A PR head that changes during the audit is `evidence_conflicted`.
- A base, state, draft, mergeability, or GitHub update-cursor change during the audit is also `evidence_conflicted`, even if the head SHA stays the same.
- Truncated review history produces `reviewDecision: unknown` and cannot assert approval or no blockers.
- Missing CI is never treated as passing.
- Truncated bounded evidence is never treated as complete.
- `mergeable: null` is informationally unknown, never proof of safety.

The summary is built from the final PR observation. This prevents the audit from reporting an initial state as current after the second provider read has already observed a different load-bearing PR state or update cursor.

## Receipt boundary

The existing external MCP receipt writer stores hashes and structural summaries only. It does not store raw arguments or raw provider results.

Every successful tool call returns the existing governance boundary:

```json
{
  "readOrPreviewOnly": true,
  "executionAllowed": false,
  "founderApprovalGranted": false,
  "cookiesUsed": false,
  "fingerprintsUsed": false
}
```

The audit result also states:

```json
{
  "evidenceAuditOnly": true,
  "mergeApproved": false,
  "mutationPerformed": false
}
```

## Explicit non-goals

v0 does not expose or perform:

- merge or approval;
- comments, labels, issues, branch writes, or workflow dispatch;
- repository settings changes;
- provider token passthrough;
- generic HTTP proxying;
- arbitrary repository access;
- production deployment;
- a claim that passing CI means secure or safe to merge.

## Release gates

Before merge:

1. Typecheck passes.
2. Lint passes.
3. Unit tests pass, including stale-head, stale-approval, persistent-change-request, moving-PR-state/update-cursor, missing-CI, commit-status failure/pending, failure-plus-pending, superseded-workflow, and truncated-review/evidence attacks.
4. Test discovery reports zero default-excluded supported tests and case-mismatched test-like files cannot false-green.
5. Existing remote MCP tests advertise exactly seven narrow tools.
6. Review confirms no repository-host SDK or credential construction occurs in the MCP subsystem, no GitHub mutation method is reachable through this tool, and incomplete review history cannot publish approval/no-blocker state.

After merge, production activation still requires the repository's normal Worker deployment authority and one authenticated read-only smoke audit. Merge approval does not carry forward into deployment approval.
