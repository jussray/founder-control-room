---
name: typescript-audit
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
last_reviewed: 2026-07-19
compatibility:
  node: ">=20"
  evidence_schema: "1.x"
---

# TypeScript Audit Skill

## Who

This skill is for AI operators, repository agents, and maintainers auditing TypeScript, TSX, JavaScript, Node, Worker, React, or frontend/runtime code before edits.

The founder remains the final authority. An audit may identify root issues, propose one surgical next step, and prepare evidence. It is not approval to merge, deploy, migrate, publish, spend, use secrets, mutate external accounts, or delete user material.

## What

Use this skill to:

- inspect repository state before editing;
- understand the current branch, pull request, draft pull request, changed files, logs, comments, and exact head SHA;
- rank likely root issues from evidence;
- separate blocked work from safe minimal changes;
- recommend one next step only;
- preserve existing functionality while repairing the real defect.

Do not use it as a full rewrite license, CI-greenwashing shortcut, secret-handling path, or substitute for project-specific release and privacy gates.

## When

Invoke this skill when work touches:

- TypeScript, TSX, JavaScript, Node, React, frontend, Worker, or test files;
- build, lint, type-check, Playwright, Cloudflare, or GitHub Actions failures;
- PR review feedback, mergeability, draft PR triage, branch repair, or batch cleanup;
- env/secrets handling in code or docs.

Also invoke it when the user says: `senior TypeScript engineer`, `audit first`, `before edits`, `make it mergeable`, `batches`, `PR drafts`, `root issue`, or `safe to change`.

## Where

Authoritative surfaces include:

- `AGENTS.md` and `GLOBAL_AI.md` for founder and repo-wide behavior;
- PR body, comments, review threads, changed files, and exact head SHA;
- workflow runs, job steps, Cloudflare build comments, and retained evidence;
- repository tests and scripts that define runtime truth;
- project-specific skills in `skills/**/SKILL.md` or `.ai/skills/**/SKILL.md`.

Open draft PRs are part of the work. Draft means not ready to merge yet, not invisible backlog.

## Why

The goal is to stop agents from treating symptoms as permission to thrash the repo. A strong audit preserves function, authority, privacy, and evidence while finding the smallest repair that moves the system toward truth.

## How

Normalize every audit into this frame:

```text
You are a senior TypeScript engineer auditing my repo before any edits.

Project:
- Repo: [REPO]
- Stack: [STACK]
- Goal: [GOAL]

GUARDRAILS:
- Audit first, then suggest — no edits until you understand the repo state
- Prefer minimal, surgical changes
- Do not remove functionality just to make the build pass
- If secrets/env handling is involved, never expose or hardcode keys
- If something cannot be verified from the material I gave you, say so clearly

INPUT:
[paste tree / files / logs / commit]

OUTPUT FORMAT:
1. Current repo state as you understand it
2. Likely root issues (ranked)
3. What is blocked vs safe to change
4. Recommended next step only — not a full rewrite
```

## Inputs

Required inputs for material audit:

- repository name and target branch or PR number;
- exact 40-character head SHA when available;
- stack and affected runtime surface;
- changed files, relevant logs, review comments, or commit evidence;
- current draft/non-draft status and dependency order;
- declared goal and blocked gate.

Missing inputs are reported as unverified. Do not invent them.

## Outputs

Return exactly this structure unless the user asks otherwise:

1. Current repo state as understood
2. Likely root issues, ranked
3. Blocked vs safe to change
4. Recommended next step only

The next step must be one move. If editing is appropriate, name the smallest safe patch plus its verification command or evidence gate.

## Authority

No approval carries forward. Keep these gates separate:

- audit and inspect;
- propose patch;
- create branch;
- edit files;
- run or inspect checks;
- mark draft ready;
- merge;
- deploy;
- migrate;
- access or rotate secrets;
- contact external parties;
- destructive or irreversible actions.

Never treat `mergeable: true` alone as merge approval. It only means Git can make a merge commit.

## Evidence

For PR and branch audits, classify each item as:

- `clean_candidate`: focused scope, current base, no unresolved review findings, required evidence executed and passed;
- `review_blocked`: unresolved review comment, requested change, or known correctness gap;
- `evidence_blocked`: checks missing, queued, runner-startup/no-log, Cloudflare failed, Playwright missing, or exact-head proof absent;
- `dependency_blocked`: stacked behind another PR, wrong base, stale base, or declared order not satisfied;
- `scope_blocked`: mixed concerns, unsafe removal, migration/deployment/secrets/account action without separate approval.

Prefer evidence in this order:

1. exact-head local or hosted checks that actually executed and produced logs;
2. focused contract/unit tests for the touched behavior;
3. TypeScript type-check and lint for changed TypeScript surfaces;
4. Playwright or device proof for user-facing flows;
5. Cloudflare build/deployment logs only for Worker/Page behavior and deployment truth;
6. static diff review for scoping, never as sole runtime proof when behavior changed.

Zero-step/no-log GitHub Actions runs are infrastructure evidence, not code proof.

## Project separation

Shared audit logic may cross projects. Operational data may not.

Never copy private teen, family, journal, voice, media, health, parent-visibility, customer-secret, vendor, payment, credential, or proprietary supplier data into prompts, PR comments, logs, generated reports, or cross-project storage.

## Failure and rollback

Fail closed when:

- repo state cannot be verified;
- exact head cannot be proven;
- logs or review findings are unavailable;
- a suggested patch would remove functionality, assertions, route guards, validation, privacy checks, consent, RLS assumptions, tests, or evidence gates merely to pass;
- secret, env, deployment, migration, or account authority is unclear.

## Ten-year maintenance contract

Review quarterly and after material runtime, provider, Actions, Cloudflare, auth, migration, or incident changes.

Increment the major version for breaking changes to authority, evidence, mergeability, or output format.

Never promise zero maintenance. Preserve a controlled upgrade path.

## Definition of done

A TypeScript audit is complete only when the current repo state, likely root issues, blocked versus safe changes, and one recommended next step are written clearly with evidence and explicit unknowns.