---
name: typescript-strict-review
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
---

# TypeScript Strict Review Skill

## Who

This skill is for strict senior review of TypeScript, TSX, Node, Worker, Supabase-adjacent, or test changes before merge or ready-for-review claims.

## What

Review the supplied diff, PR summary, or patch for production readiness.

The review must prioritize correctness first, then regression risk, type safety, target-stack compatibility, Supabase or Worker integration safety, and minimal blast radius.

## When

Invoke when:

- a PR, draft PR, diff, or patch is being reviewed;
- an agent claims something is mergeable or ready;
- a build, type-check, lint, test, Playwright, Cloudflare, Supabase, or Worker failure needs review;
- a minimal patch has been produced and needs a senior gate.

## Required with

- `typescript-audit` before conclusions about root cause
- `typescript-minimal-patch` when exact fixes are requested
- `portfolio-control-plane` and local repo skills when release, provider, mission, migration, deployment, or cross-repo authority is touched

## Input contract

Normalize the request into this frame:

```text
Review this change like a strict senior reviewer for a production TypeScript app.

Priorities, in order:
1. Correctness
2. Regression risk
3. Type safety
4. Target-stack compatibility
5. Supabase / Worker integration safety
6. Minimal blast radius

Input:
[paste diff / PR summary]

Output:
1. Critical issues (blockers)
2. Medium-risk concerns
3. What is good and should stay unchanged
4. Suggested exact fixes
5. Merge recommendation: YES / NO / YES WITH CHANGES
```

## Review rules

- Do not approve a change only because Git says it is mergeable.
- Treat open draft PRs as audit and review targets, but not merge-ready by default.
- Separate code blockers from evidence blockers.
- Classify zero-step or no-log GitHub Actions as infrastructure evidence, not code proof.
- Treat Cloudflare build or deployment evidence as relevant only to Worker, Pages, or deployment truth.
- Do not ask for broad rewrites when a surgical fix is enough.
- Do not recommend deleting behavior, weakening guards, reducing tests, or suppressing types merely to pass checks.

## Required output

Return exactly:

1. Critical issues, blockers.
2. Medium-risk concerns.
3. What is good and should stay unchanged.
4. Suggested exact fixes.
5. Merge recommendation: YES, NO, or YES WITH CHANGES.

Use `NO` when there is an unresolved correctness, security, privacy, type-safety, integration, review, stack-order, draft, or exact-head evidence blocker.

Use `YES WITH CHANGES` only when the change is conceptually safe but needs a bounded correction before merge.

Use `YES` only when the change is focused, reviewed, non-draft, current, and backed by executed evidence for the touched behavior.

## Definition of done

A strict review is complete only when it names blockers separately from concerns, preserves good parts, gives exact fixes, and refuses to merge without the required release gate.