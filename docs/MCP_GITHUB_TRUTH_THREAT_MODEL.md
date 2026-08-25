# GitHub Truth MCP v0 threat model

## Trust boundary

The tool may support only this claim:

> At timestamp T, Founder Control Room observed GitHub evidence E for pull request N at head SHA H and classified the completeness/freshness of that evidence under the v0 rules.

It cannot support:

- “This code is secure.”
- “This PR should be merged.”
- “Deployment will succeed.”
- “The repository is permanently healthy.”

## Primary attacks and controls

| Attack or failure | Control |
| --- | --- |
| Passing CI belongs to an older commit | Every check/workflow observation is compared with the first observed PR head SHA. Mismatch produces `ci_stale_for_head_sha`. |
| PR changes during the audit | Fetch PR state before and after the evidence reads. A changed head produces `head_sha_changed_during_audit` and `evidence_conflicted`. |
| Caller supplies a stale expected SHA | Optional `expectedHeadSha` is a full 40-character SHA and mismatch produces `expected_head_sha_mismatch`. |
| Missing checks are interpreted as success | Zero conclusive CI observations produce `ci_missing_or_unknown` and `evidence_incomplete`. |
| Failed CI is hidden by a positive-sounding verdict | `evidence_complete` means evidence completeness only; `summary.ciConclusion` remains `fail` and a blocker finding is returned. |
| Arbitrary repository access | v0 accepts only `projectId=founder-control-room`; repository identity is server-held as `jussray/founder-control-room`. |
| GitHub token exfiltration | Tokens are resolved server-side through GitHub App auth or the existing local fallback and are never accepted as tool arguments or returned. |
| Write capability sneaks into MCP | Tool schema exposes only audit arguments. The reader implements only GET-equivalent Octokit operations. Existing MCP governance still reports `executionAllowed=false`. |
| Full patch content leaks through evidence | Changed-file output contains path/status/additions/deletions only and is capped at 100 entries. |
| Receipt laundering | Receipt creation remains internal to the external MCP executor and hashes the request/result. There is no generic create-receipt tool. |
| Unbounded GitHub evidence | Checks, workflows, reviews, and changed files are capped at 100 observations each. No unbounded retry loop is added. |

## Authentication and authorization

Two identities remain separate:

1. **MCP caller identity**: authenticated by the existing remote MCP OAuth/static compatibility boundary and server-held project grant.
2. **GitHub capability identity**: authenticated server-side through the existing repository-scoped GitHub App installation token where production credentials are configured.

Both must succeed. A caller grant does not become a GitHub credential, and GitHub installation scope does not become Founder Control Room authorization.

## No new authority

This change adds no new:

- database table or RLS policy;
- Cloudflare Worker identity;
- secret type;
- deployment path;
- GitHub write permission;
- founder approval type;
- cross-project execution authority.

Any expansion beyond read-only PR evidence is a new security review.
