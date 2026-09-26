---
name: change-genealogy-audit
description: Reconstruct recent repository change lineage before assigning root cause. Uses a 10-PR default window, bounded comments/diffs, every PR commit identity, recent default-branch commits, provider-proven PR associations, separate failure receipts, and exact-head proof escalation.
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
trigger:
  - /genealogy
  - /audit-history
  - /goalfix
  - ULTRATHINK
---

# Change Genealogy Audit

Read `docs/AI_CHANGE_GENEALOGY_CONTRACT.md` first. This skill is an execution recipe for that contract, not a separate authority system.

## Mission

Before patching a repository symptom, determine how the current behavior evolved and which change is causally relevant. Preserve provenance without drowning the audit in raw patches.

## Observe

Resolve:

- authoritative repository
- authoritative default branch
- current exact default-branch SHA
- current project/mission goal
- target PR/branch when one exists
- current authority ceiling
- stop condition

Start with the semantic provider query:

```json
{
  "repository_full_name": "<owner/repo>",
  "limit": 10,
  "include_comments": true,
  "include_diff": true
}
```

The window means ten PRs, not ten comments or commits.

## Index before expanding

For each PR in the window, index every commit identity and its parents. Preserve PR head and merge/squash commit identity when exposed.

Collect bounded:

- conversation/review evidence
- review-to-commit binding
- file-level diff summaries
- PR state/base/head identity

Do not persist raw patch bodies by default.

Then inspect recent commits on the authoritative default branch and ask the provider for commit-to-PR associations.

Classify only from provider evidence:

- `associated_pr`
- `direct_candidate`
- `unattributed_merge`
- `unknown`

A missing PR association on a single-parent branch commit is a direct candidate, not automatically proven policy bypass.

## Orient

Build a lineage map:

```text
PR -> commit A -> commit B -> commit C -> PR head
                                  |
                                  -> merge/squash/default-branch commit
```

Mark each relevant observation `VERIFIED`, `INFERRED`, `UNKNOWN`, or `BLOCKED`.

Preserve historical failed/intermediate commits. They explain evolution but do not inherit current proof requirements.

## Decide

Choose one evidenced cause before patching many symptoms.

Expand beyond the ten-PR window only when:

- the suspicious commit references an older predecessor;
- the causal chain begins earlier;
- a default-branch commit cannot be attributed from current evidence;
- a contract/test/provider change outside the window is load-bearing.

## Act

Use the smallest reversible fix. Preserve unrelated work. Never suppress a failing signal or rewrite history merely to make the genealogy look clean.

Parallel AI reasoning is allowed through the Founder AI Council. Mutation is serialized.

## Verify

Escalate proof in this order:

1. touched-area type/lint/static check
2. focused unit/integration/contract test
3. exact-head CI/check evidence
4. Playwright/browser proof for user-facing behavior
5. provider/database/runtime readback when load-bearing
6. real-path outcome observation

Base/head movement expires predecessor exact-head proof unless a stronger continuity contract explicitly proves otherwise.

## Separate receipts

Every independent problem gets its own receipt. Never collapse:

- comment collection unavailable
- diff/commit history truncation
- required check failure
- review stale for head
- branch/base movement
- direct-branch attribution unknown
- provider/runtime failure
- Playwright failure
- database failure

One green receipt cannot erase a red or unknown receipt from another evidence plane.

## All-AI inheritance

All enabled Council operators inherit the same genealogy contract:

- ChatGPT / Codex
- Claude / Claude Code
- Gemini
- Muse
- Perplexity
- DeepSeek
- DeepSeek Instructor
- eligible local/future operators admitted by registry

Roles remain capability-bound. DeepSeek Instructor does not gain implementation authority from participating in an audit. Model consensus is not proof or founder approval.

## Report

Return only:

`REALITY / GENEALOGY / FIX / PROOF / RISK / ROLLBACK / NEXT GATE`

Stop when the founder goal is proven on the real path or the next required action exceeds current authority.
