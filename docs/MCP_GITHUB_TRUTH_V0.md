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
- existing GitHub App installation authentication, with local `GITHUB_TOKEN` fallback only where the repository already permits it;
- existing `mcp_tool_calls` redacted receipt ledger;
- existing Cloudflare Worker deployment authority;
- existing Vitest and remote MCP contract tests.

No new database migration, Worker identity, auth model, or generalized MCP platform is introduced.

## v0 repository allowlist

`github_audit_pr` is hard-scoped to:

```text
projectId: founder-control-room
repository: jussray/founder-control-room
```

The caller cannot provide an arbitrary owner or repository. Expanding this allowlist is a separate reviewed change.

## Evidence gathered

The audit performs bounded GitHub-native reads for:

- pull-request identity and state;
- base and head SHA;
- changed-file count and a capped changed-file summary;
- check runs bound to the observed head SHA;
- workflow runs filtered to the observed head SHA;
- review events;
- a second pull-request read to detect a head change during the audit.

The audit never requests patch contents by default.

## Deterministic classifications

`verdict` is one of:

- `evidence_complete`
- `evidence_incomplete`
- `evidence_conflicted`

These values describe evidence quality, not code quality.

Examples:

- Current CI can fail while the verdict is still `evidence_complete`: the system has complete evidence of failure.
- Passing CI from an old SHA is `evidence_incomplete` with `ci_stale_for_head_sha`.
- A PR head that changes during the audit is `evidence_conflicted`.
- Missing CI is never treated as passing.
- `mergeable: null` is informationally unknown, never proof of safety.

## Receipt boundary

The existing external MCP receipt writer stores hashes and structural summaries only. It does not store raw arguments or raw GitHub results.

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
- GitHub token passthrough;
- generic HTTP proxying;
- arbitrary repository access;
- production deployment;
- a claim that passing CI means secure or safe to merge.

## Release gates

Before merge:

1. Typecheck passes.
2. Lint passes.
3. Unit tests pass, including stale-head and missing-CI attacks.
4. Existing remote MCP tests advertise exactly seven narrow tools.
5. Review confirms no GitHub mutation method is reachable through this tool.

After merge, production activation still requires the repository's normal Worker deployment authority and one authenticated read-only smoke audit. Merge approval does not carry forward into deployment approval.
