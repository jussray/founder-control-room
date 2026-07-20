---
name: typescript-behavior-tests
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
---

# TypeScript Behavior Tests Skill

## Who

This skill is for agents writing, repairing, reviewing, or retiring tests in TypeScript, TSX, JavaScript, Node, Worker, Supabase client, and frontend codebases managed through Founder Control Room.

## What

Use this skill to produce behavior-focused Jest or Vitest coverage that proves real outcomes, catches regressions, and prevents stale tests from becoming release noise.

Do not use this skill to delete tests just because they are old, slow, inconvenient, or currently failing.

## When

Invoke when the user asks to:

- write TypeScript tests;
- generate Jest or Vitest tests;
- replace brittle tests with behavior tests;
- decide whether old tests are still needed;
- reduce test noise without losing coverage;
- fix CI caused by stale or implementation-detail tests;
- add coverage before a merge, refactor, migration, Worker change, Supabase integration, or PR review.

## Required with

- `skills/typescript-audit/SKILL.md` before choosing test targets;
- `skills/typescript-root-cause-debugger/SKILL.md` when tests are failing and root cause is unknown;
- `skills/typescript-minimal-patch/SKILL.md` when production code must change;
- `skills/typescript-strict-review/SKILL.md` before recommending merge;
- `skills/portfolio-control-plane/SKILL.md` when cross-repo release, proof, or Control Room authority is involved.

## Core prompt

```text
Write TypeScript tests for the following code.

Rules:
- Test real behavior, not implementation details
- Cover happy path, edge cases, and failure modes
- No tests that would pass if the function were deleted
- Use Jest or Vitest (match the project's test runner)
- No mocks unless strictly necessary for external dependencies

Code:
[paste code]

Return:
- Test file with descriptive test names
- Brief note on what each test block covers
```

## Test-authoring contract

Before writing tests:

1. identify the project test runner from `package.json`, existing test files, or config;
2. inspect nearby tests for naming, imports, environment setup, and assertion style;
3. define the behavior contract in user-facing or API-facing terms;
4. list the minimum happy path, edge cases, and failure modes;
5. identify true external dependencies and avoid mocks unless the dependency crosses process, network, filesystem, clock, randomness, provider, or database boundaries.

A valid test must fail when the behavior is removed or broken. A test that still passes if the target function, route, guard, policy, or integration is deleted is not valid proof.

## Test retirement contract

Old tests may be retired only after the agent proves at least one of:

- the behavior under test no longer exists and the product or API contract was deliberately removed with founder-approved scope;
- the same behavior is covered by a stronger, behavior-level test that would fail on the same regression;
- the test asserts implementation details that block a correct implementation and has been replaced by behavior coverage;
- the test depends on stale architecture, stale route names, stale workflow names, or stale provider assumptions, and the new authority is documented.

When removing or replacing a test, report:

- the old test name and file;
- the behavior it used to protect;
- the replacement test or proof;
- why coverage is preserved or why the behavior is intentionally retired;
- the remaining regression risk.

Never delete tests merely to make GitHub Actions green.

## Output format

Return:

1. `Test file` with descriptive test names;
2. `Coverage notes` describing happy path, edge cases, and failure modes;
3. `Mocks used` or `No mocks used`, with justification;
4. `Retirement notes` when replacing or deleting tests;
5. `Verification` with the exact Jest or Vitest command to run.

## Founder Control Room usage

Founder Control Room may use this skill to generate missing behavior tests and to identify obsolete tests, but test deletion remains a separate minimal patch that must preserve or explicitly retire coverage.

## Forbidden shortcuts

Do not:

- assert private implementation details when behavior is observable;
- mock the function under test;
- create placeholder tests, fake mocks, snapshot fog, or tests with no meaningful assertion;
- delete failing tests without diagnosing whether they reveal a real regression;
- remove security, privacy, auth, RLS, consent, route-guard, or release-truth tests unless stronger replacement proof exists;
- claim coverage exists when only source text or snapshots are checked.

## Definition of done

A test change is done only when it matches the project runner, proves behavior, fails on deletion of the behavior, covers success and failure, documents any mocks, and either preserves old coverage or explicitly records a founder-approved behavior retirement.