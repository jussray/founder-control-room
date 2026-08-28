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
| Passing CI belongs to an older commit | Every check, commit-status, and workflow observation is compared with the first observed PR head SHA. Mismatch produces `ci_stale_for_head_sha`. |
| A failing/pending legacy Commit Status is omitted while checks/Actions are green | The provider reads the head's bounded combined Commit Status API contexts as a separate CI evidence lane; failure/error blocks, pending remains pending, and truncation prevents complete evidence. |
| An old failed workflow survives after a successful replacement run | Raw workflow observations are reduced to the newest execution per workflow/event context using run number, run attempt, then update time; raw-page truncation still prevents `evidence_complete`. |
| PR head changes during the audit | Fetch PR state before and after the evidence reads. A changed head produces `head_sha_changed_during_audit` and `evidence_conflicted`. |
| PR base/state/draft/mergeability changes while head stays the same | Compare all load-bearing PR truth across the two reads. Any incompatible change produces `pr_truth_changed_during_audit`, the summary uses the final observation, and the verdict is `evidence_conflicted`. |
| A review/comment/activity update occurs after review evidence is read but before the final PR observation | The initial and final PR observations must have the same GitHub `updatedAt` cursor. Cursor movement produces `pr_truth_changed_during_audit` and `evidence_conflicted`, forcing a retry rather than publishing stale review truth as current. |
| A change request was submitted on an older head and the author pushes a new commit | Review state is reduced per reviewer. `changes_requested` remains blocking across head pushes and ordinary comments until that reviewer approves or the review is dismissed. |
| An old approval is incorrectly treated as approval for the new head | Approval clears that reviewer's blocker but counts as `approved` only when it is bound to the observed head (or carries no provider SHA). Old-head approvals emit `review_approval_stale_for_head_sha`. |
| Review history exceeds the bounded observation and an unresolved blocker may live on an omitted page | Truncated review history can never publish `approved` or `none`; the classifier forces `reviewDecision: unknown`, emits `review_decision_unknown_due_to_truncation`, and the evidence verdict remains incomplete. |
| Caller supplies a stale expected SHA | Optional `expectedHeadSha` is a full 40-character SHA and mismatch produces `expected_head_sha_mismatch`. |
| Missing CI is interpreted as success | Zero conclusive check, commit-status, and current workflow observations produce `ci_missing_or_unknown` and `evidence_incomplete`. |
| A known failure is hidden by another pending CI signal | Failure conclusions are evaluated before pending statuses, so a current failure remains `ciConclusion: fail` and returns `ci_failed`. |
| A failing CI record exists beyond a 100-observation cap | Check, commit-status, and raw workflow reads propagate provider counts. Any truncated collection produces `evidence_collection_truncated` and cannot return `evidence_complete`. |
| New review state exists after the first 100 historical reviews | The bounded reader may retain recent review evidence, but omitted history still marks the audit incomplete and forces an unknown review decision. |
| Changed-file metadata is truncated | The observed file count is compared with the PR's provider-reported changed-file count. A partial summary marks evidence incomplete. |
| Failed CI is hidden by a positive-sounding verdict | `evidence_complete` means evidence completeness only; `summary.ciConclusion` remains `fail` and a blocker finding is returned. |
| Arbitrary repository access | v0 accepts only `projectId=founder-control-room`; repository identity is server-held as `jussray/founder-control-room`. |
| GitHub token exfiltration | Tokens are resolved server-side through GitHub App auth or the existing local fallback and are never accepted as tool arguments or returned. |
| Write capability sneaks into MCP | Tool schema exposes only audit arguments. Provider evidence collection uses read operations only. Existing MCP governance still reports `executionAllowed=false`. |
| Full patch content leaks through evidence | Changed-file output contains path/status/additions/deletions only and is capped at 100 entries. |
| Receipt laundering | Receipt creation remains internal to the external MCP executor and hashes the request/result. There is no generic create-receipt tool. |
| Unbounded GitHub evidence | Returned/observed checks, commit statuses, raw workflows, reviews, and changed files are bounded at 100 records per collection. Review pagination performs bounded reads only; no unbounded retry loop is added. |

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
