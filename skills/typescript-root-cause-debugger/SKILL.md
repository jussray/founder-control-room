---
name: typescript-root-cause-debugger
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
---

# TypeScript Root-Cause Debugger Skill

## Who

This skill is for calm senior debugging of TypeScript, TSX, Node, Worker, Supabase-adjacent, or production-app behavior where the user wants root-cause analysis rather than unrelated guesses.

## What

Use this skill to diagnose a specific feature, screen, error, regression, or unexpected behavior from logs, code, screenshots, diffs, or recent changes.

Do not use it to replace architecture, rewrite broad modules, or list generic possibilities without ranking and checks.

## When

Invoke when the user asks for debugging, root cause, diagnosis, why something failed, why a screen behaves incorrectly, why a PR broke, or why a TypeScript/Worker/Supabase path is not working.

## Required with

- `typescript-audit` before claims about repo state or PR state
- `typescript-minimal-patch` when a code fix is requested
- `typescript-strict-review` after a patch or PR change
- `portfolio-control-plane` when debugging crosses missions, providers, evidence, approvals, releases, or project boundaries

## Input contract

Normalize the request into this frame:

```text
Act like a calm senior debugger. I want root-cause analysis, not a list of unrelated guesses.

Context:
- Repo: [REPO]
- Feature / screen: [FEATURE]
- Expected: [EXPECTED]
- Actual: [ACTUAL]
- Recent change, if any: [CHANGE]

Evidence:
[paste error log / stack trace / code / screenshots]

Rules:
- Restate the problem first
- Rank top 3 most likely causes by probability
- Give fastest checks in order
- Suggest only minimal TypeScript changes
- Do not replace architecture unless absolutely necessary

Return:
1. Diagnosis
2. Ordered debug checklist
3. Smallest viable patch
4. Regression risks after patch
```

## Diagnosis rules

- Restate the problem first in concrete terms.
- Rank no more than three likely causes by probability.
- Tie each likely cause to evidence; mark gaps as unverified.
- Prefer the fastest discriminating checks before proposing edits.
- Separate code defects from missing evidence, stale branches, runner failures, Cloudflare failures, Supabase/config failures, and user-data/precondition issues.
- Do not treat zero-step/no-log GitHub Actions as application failure.
- Do not treat Cloudflare build failure as proof of TypeScript runtime logic failure without logs.

## Required output

Return exactly:

1. Diagnosis.
2. Ordered debug checklist.
3. Smallest viable patch.
4. Regression risks after patch.

The smallest viable patch must touch only the files needed to fix the highest-probability verified cause.

## Forbidden shortcuts

Do not:

- list unrelated guesses;
- propose broad rewrites before the fastest checks;
- delete guards, tests, types, privacy checks, consent checks, auth checks, RLS assumptions, or validation to make symptoms disappear;
- invent logs, env values, secrets, API behavior, database state, or user actions;
- use fake mocks or placeholders unless explicitly requested;
- replace architecture unless the evidence proves the architecture itself is the defect.

## Definition of done

Root-cause debugging is complete only when the problem is restated, top causes are ranked, checks are ordered, the smallest viable patch is named, and regression risks after that patch are explicit.