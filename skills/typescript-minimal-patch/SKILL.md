---
name: typescript-minimal-patch
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
---

# TypeScript Minimal Patch Skill

## Who

This skill is for AI operators and repository agents writing the smallest safe repair for a TypeScript, TSX, Node, Worker, or test bug after the repo state has already been audited.

## What

Use this skill to produce a minimal patch for a specific bug in a specific file or module.

Do not use it for broad refactors, architecture rewrites, speculative cleanup, fake mocks, placeholder logic, or build-passing deletion.

## When

Invoke after the audit step has identified:

- the bug;
- the file or module;
- the current behavior;
- the expected behavior;
- the smallest safe edit surface;
- the verification gate.

## Required with

- `typescript-audit`
- `typescript-strict-review` after patching
- `portfolio-control-plane` when the patch affects missions, providers, evidence, approvals, releases, or cross-repo coordination

## Input contract

Normalize the request into this frame:

```text
You are writing a minimal patch for a TypeScript codebase.

Task: Fix [BUG] in [FILE/MODULE]

Constraints:
- Keep existing behavior unless directly related to the bug
- Touch as few files as possible, no broad refactors
- No placeholder logic, no fake mocks unless explicitly requested
- Explain why each change is necessary in exactly one sentence

Input:
[paste relevant code]

Return:
- Unified diff or exact replacement blocks
- One-paragraph explanation
- Manual test steps
```

## Patch rules

- Audit before patching.
- Preserve existing behavior unless it is directly part of the bug.
- Touch the fewest files possible.
- Prefer unified diffs when the caller provided enough context; otherwise provide exact replacement blocks.
- Do not remove tests, types, guards, privacy checks, consent checks, auth checks, RLS assumptions, or validation to make a check pass.
- Do not invent secrets, env values, remote endpoints, fake production data, or placeholder provider behavior.
- Do not make live Supabase, Cloudflare, billing, deployment, credential, or external-account changes from a patch request.

## Required output

Return:

1. Unified diff or exact replacement blocks.
2. One paragraph explaining the patch.
3. Manual test steps.

Every changed line group must have exactly one sentence explaining why the change is necessary.

## Verification

Name the smallest verification path available:

- focused unit or contract test for the touched behavior;
- `npm run type-check` for TypeScript surface changes;
- lint when formatting or static rules are touched;
- Playwright when user-facing runtime flow changes;
- Cloudflare build evidence only when Worker or Pages behavior changed.

If verification was not run or cannot be run, say that clearly.

## Definition of done

The patch is done only when the bug is addressed with minimal blast radius, existing unrelated behavior is preserved, verification is named or executed, rollback is obvious, and the follow-up strict review has no blockers.