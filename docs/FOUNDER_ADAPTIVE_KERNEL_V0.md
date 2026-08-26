# Founder Adaptive Kernel V0

Status: `APPROVED SOURCE CONTRACT`

Owner: Founder

Scope: Goalfix/FCR-governed instruction and decision loops across Juss-owned projects, agents, language-learning work, product work, repository repair, content experiments, and operating-system decisions.

This contract defines governance behavior. It does **not** claim that the current `POST /goalfix/inspect`, `src/goalfix/engine.ts`, API response, or browser UI already emits expected-state, surprise, adaptive-action, or current-state fields. Runtime/API/UI integration is a separate implementation and proof gate.

## Core law

Progress is not measured by activity. Progress is a verified change in state plus a durable learning signal.

Every Goalfix-governed instruction/decision loop MUST:

```text
INTENT
  → EXPECTED STATE
  → OBSERVE ACTUAL STATE
  → BIND EVIDENCE
  → DETECT SURPRISE
  → ADAPT PACE / ACTION
  → RECORD CURRENT STATE
  → NEXT GATE
```

Approval, implementation, verification, integration, deployment, and runtime truth are separate states. Never collapse one into another.

## Universal input

A kernel evaluation SHOULD record:

- project/repository identity;
- founder intent;
- expected state or expected capability;
- observed state;
- evidence references;
- authority state;
- verified target branch/base ref when repository work is involved;
- current base SHA and candidate/head SHA when Git is involved;
- current files/scope/diff when applicable;
- prior relevant evidence only when it still matches current state.

Unknown fields remain `UNKNOWN`; they are never fabricated merely to complete the record.

## Surprise signal

Compare expected state with observed state and classify the result as exactly one of:

- `STRONGER_THAN_EXPECTED`: verified performance, fluency, capability, quality, or progress materially exceeds the prior expectation;
- `AS_EXPECTED`: verified behavior matches the prior expectation closely enough that pacing does not need to change;
- `WEAKER_THAN_EXPECTED`: verified behavior materially underperforms the prior expectation or reveals a real defect;
- `UNEXPECTED_DIRECTION`: behavior is real and useful but differs from the expected path, requiring the model to update rather than force the old plan;
- `UNKNOWN`: evidence is insufficient to compare expected and observed state safely.

Unexpected behavior is information. Do not force it back into the previous script merely because it differs.

## Adaptive decision

The kernel emits one primary next action:

- `ACCELERATE`: increase challenge, scope depth, autonomy, or cadence only when evidence is current and the stronger-than-expected signal is safe;
- `CONTINUE`: keep the present pace when evidence supports the existing difficulty/scope;
- `REPAIR`: narrow to the smallest causal fix when evidence shows a weaker-than-expected result or defect;
- `REORIENT`: change the plan when the observed path is useful but materially different from the prior expectation;
- `HOLD`: obtain missing evidence or authority before changing state;
- `STOP`: do not proceed when the next action would violate authority, safety, rollback, or truth requirements.

The system decides whether to speed up or slow down from observed evidence. It does not accelerate merely because a plan says to.

## Evidence states

Use the existing Goalfix truth vocabulary:

- `VERIFIED`
- `INFERRED`
- `UNKNOWN`
- `BLOCKED`
- `STALE`

Only `VERIFIED` evidence may support a load-bearing acceleration, merge-readiness claim, deployment claim, or runtime-success claim.

## Current-state record

For a meaningful loop, keep the minimum current state needed to continue truthfully:

```text
project/repository
intent
expected state
observed state
verified target branch/base ref (when applicable)
base SHA (when applicable)
head SHA (when applicable)
PR identity (when applicable)
files/scope/diff (when applicable)
evidence IDs
review state
authority state
surprise signal
adaptive decision
next gate
```

This record is descriptive only. It never grants merge, deploy, publish, provider, founder, or execution authority.

If intent, target/base, head, scope, evidence, review state, or authority changes in a load-bearing way, dependent prior green becomes `STALE` for that claim. Re-observe and reacquire evidence rather than inheriting old proof.

Never store secrets, raw private data, access tokens, chain-of-thought, or unnecessary user content in the current-state record.

## Learning patch

After each meaningful loop, retain the smallest durable lesson that changes future behavior.

Examples:

- a learner voluntarily produces more language than prompted → raise the expected expressive range and consider accelerating;
- a UI repair repeatedly fails only at runtime → move browser/runtime proof earlier for that class of work;
- a provider check is green while runtime identity is unknown → never promote provider build success to runtime truth;
- a founder responds in an unexpected but higher-signal form → adapt the interaction contract instead of forcing the original response shape.

Learning changes expectations. It does not rewrite historical evidence.

## Repository binding

For repository work, the adaptive kernel composes with Goalfix and never replaces local authority gates.

A repository state record MUST distinguish:

```text
repo
verified target branch/base ref
base SHA
head SHA
PR identity when applicable
files/scope/diff
proof/evidence IDs
review state
authority state
surprise signal
adaptive decision
next gate
```

If the verified target/base branch, candidate head, or load-bearing scope moves, dependent proof becomes historical. Reacquire evidence before accelerating, merging, launching, or claiming completion.

Merge still requires the repository's current review/check/authority contract plus current founder-final authority where required.

## Cross-project portability

This kernel is global by behavior, not by copying unrelated implementation into every repository.

Founder Control Room is the canonical governance source. Other projects may mirror or consume this contract, but local runtime/source authority remains owned by each project's real repository and provider state.

Portable Goalfix skills MUST carry the minimum adaptive rules inline or use an explicitly versioned/vendored copy. They must not assume another repository contains `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md` merely because Founder Control Room does.

## Report addition

When the adaptive result materially changes the plan, Goalfix reports SHOULD make the signal visible inside the normal report:

```text
REALITY:
[verified current state]

FIX:
[focused change]

PROOF:
[current evidence]

RISK:
[remaining uncertainty]

ROLLBACK:
[safe reversal]

ADAPTIVE SIGNAL:
[STRONGER_THAN_EXPECTED | AS_EXPECTED | WEAKER_THAN_EXPECTED | UNEXPECTED_DIRECTION | UNKNOWN]
[action: ACCELERATE | CONTINUE | REPAIR | REORIENT | HOLD | STOP]

NEXT GATE:
[one exact next action or founder decision]
```

## Stop condition

The kernel is functioning correctly when a surprising observation changes future expectations while preserving evidence and authority boundaries.

No evidence, no promotion. No current exact state, no inherited green. No authority, no privileged action.
