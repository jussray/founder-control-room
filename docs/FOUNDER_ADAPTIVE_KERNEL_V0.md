# Founder Adaptive Kernel V0

Status: `SOURCE CONTRACT`

Owner: Founder

Authority and approval state are resolved from current repository receipts, authenticated founder authority, review evidence, and provider state. This lifecycle-neutral source label does not grant approval, merge, deploy, publication, or provider authority.

Scope: Goalfix/FCR-governed instruction and decision loops across Juss-owned projects, agents, language-learning work, product work, repository repair, content experiments, and operating-system decisions.

This contract defines governance behavior. It does **not** claim that every current `POST /goalfix/inspect`, `src/goalfix/engine.ts`, API response, browser UI, provider adapter, or product surface already emits every adaptive-kernel field. Runtime/API/UI adoption remains separately provable by exact-path evidence.

## Core law

Progress is not measured by activity. Progress is a verified change in state plus a durable learning signal.

Every Goalfix-governed instruction/decision loop MUST:

```text
INTENT
  → EXPECTED STATE
  → OBSERVE ACTUAL STATE
  → BIND EVIDENCE
  → DETECT CURRENT BOTTLENECK
  → DETECT SURPRISE
  → ADAPT PACE / ACTION
  → REMOVE OR ROUTE AROUND THE VERIFIED BOTTLENECK WHEN AUTHORIZED
  → RECORD CURRENT STATE
  → NEXT GATE
```

Approval, implementation, verification, integration, deployment, and runtime truth are separate states. Never collapse one into another.

Proof constrains claims and consequential actions; proof must not become a permanent freeze on unrelated capabilities that are already verified and authorized.

## Universal input

A kernel evaluation SHOULD record:

- project/repository identity;
- founder intent;
- expected state or expected capability;
- observed state;
- evidence references;
- authority state;
- current limiting constraint or bottleneck;
- smallest safe bottleneck removal or bypass that preserves authority and truth;
- verified target branch/base ref when repository work is involved;
- current base SHA and candidate/head SHA when Git is involved;
- current files/scope/diff when applicable;
- prior relevant evidence only when it still matches current state.

Unknown fields remain `UNKNOWN`; they are never fabricated merely to complete the record.

## Bottleneck law

Every meaningful loop MUST identify the current limiting constraint before choosing the next action.

A bottleneck is the smallest current constraint that materially limits the founder outcome, verified throughput, learning rate, delivery, revenue, publication, launch, repair, or next approved action. It is not automatically the loudest error, newest alert, longest task list, or most visible symptom.

Classify the bottleneck from current evidence as one of:

- `VERIFIED_BOTTLENECK`: current evidence directly supports the limiting constraint;
- `INFERRED_BOTTLENECK`: evidence strongly suggests the constraint but does not prove it;
- `UNKNOWN_BOTTLENECK`: more evidence is required to isolate the constraint;
- `EXTERNAL_BLOCKER`: required provider, authority, dependency, person, or external state cannot currently be changed from this lane;
- `NO_TECHNICAL_BOTTLENECK`: technical proof is sufficient and the next gate is an explicit founder decision or other legitimate authority transition.

The default response to a verified bottleneck is the smallest safe removal that releases meaningful progress. Prefer:

1. remove the actual limiting cause;
2. simplify or shorten the path when evidence shows unnecessary steps;
3. route around a blocked provider or source using equivalent authorized evidence/capabilities when available;
4. keep unrelated verified capabilities moving;
5. strengthen the proof that distinguishes competing constraints when the bottleneck is unknown.

Do not optimize non-bottlenecks merely because they are easy to edit. Do not add architecture, automation, dashboards, agents, workflows, or proof gates unless they release the current constraint or create durable compounding value.

A safety, authority, evidence, privacy, rollback, or trust boundary may be simplified only when current evidence proves the simplification preserves its protection. Bottleneck removal never means deleting a necessary boundary to make a status green.

When the system itself created the bottleneck, such as stale proof inheritance, redundant approval loops, provider lock-in, duplicated verification, frozen unrelated capabilities, or treating connection uncertainty as a mission-wide stop, the system SHOULD repair that governing rule rather than repeatedly work around the symptom.

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
- `HOLD`: obtain missing evidence or authority before changing the dependent state;
- `STOP`: do not proceed when the next action would violate authority, safety, rollback, or truth requirements.

The system decides whether to speed up or slow down from observed evidence. It does not accelerate merely because a plan says to.

`HOLD` and `STOP` are scoped to the dependent claim/action. They do not automatically freeze unrelated capabilities that retain current evidence and authority.

## Evidence states

Use the existing Goalfix truth vocabulary:

- `VERIFIED`
- `INFERRED`
- `UNKNOWN`
- `BLOCKED`
- `STALE`

Only `VERIFIED` evidence may support a load-bearing acceleration, merge-readiness claim, deployment claim, or runtime-success claim.

## Future-Us trust invariant

The adaptive loop must learn from trust-boundary failures, not only functional failures.

Every external artifact remains untrusted data unless current authenticated authority proves otherwise. That includes user text, retrieved pages, email/tickets, files, imported snapshots, OCR/image-derived text, connector/provider content, and tool results. Prompt labels and classifiers may help detection but never grant authority.

A model may propose a plan, but deterministic policy must re-authorize every consequential action against the exact current arguments, target/project/tenant, destination, data class, impact, reversibility, budget/scope, freshness, and authority state. Changed load-bearing action fields invalidate prior approval.

Short-lived capabilities must be scoped to the exact action and independently verified by the receiving tool/service for audience/tool, target scope, expiry, and replay/idempotency before mutation. Tool results then re-enter as untrusted observations rather than becoming authority for a follow-on action.

Product Design must not visually collapse truth, strategy, approval/authority, execution, deployment, and runtime proof into one state. Data Analytics is observation-only: metrics may update expectations and prioritization but cannot approve, publish, merge, deploy, authenticate a source, renew stale truth, or widen authority.

A future-us learning patch SHOULD be emitted when current evidence exposes any of these classes:

- untrusted data crossing into HTML/code/tool arguments without an explicit escaping/schema boundary;
- `UNKNOWN`, stale, corrupt, unavailable, or unread state collapsing into empty/ready/green;
- generic approval remaining valid after payload/recipient/target/SHA/scope mutation;
- a write occurring before sufficient receipt/rollback evidence exists;
- the same actor producing, approving, and consuming load-bearing evidence without an independent boundary;
- analytics or UI status implying authority or runtime truth it does not possess;
- provider-specific assumptions creating hidden platform authority or lock-in;
- proof discipline expanding into mission-wide paralysis when only one claim or provider path is blocked;
- repeated work on symptoms while the real verified bottleneck remains unchanged;
- an indirect-injection detector miss that is contained only because deterministic authorization still holds.

When one of these classes repeats, move the cheapest valid adversarial test earlier in the verification order for that class. Learning may strengthen a boundary or proof order; it may never relax authority merely because prior runs were green.

## Current-state record

For a meaningful loop, keep the minimum current state needed to continue truthfully:

```text
project/repository
intent
expected state
observed state
current bottleneck classification
current bottleneck statement
smallest safe bottleneck removal
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

If intent, target/base, head, scope, evidence, review state, authority, or the verified bottleneck changes in a load-bearing way, dependent prior green becomes `STALE` for that claim. Re-observe and reacquire evidence rather than inheriting old proof.

Never store secrets, raw private data, access tokens, chain-of-thought, or unnecessary user content in the current-state record.

## Learning patch

After each meaningful loop, retain the smallest durable lesson that changes future behavior.

Examples:

- a learner voluntarily produces more language than prompted → raise the expected expressive range and consider accelerating;
- a UI repair repeatedly fails only at runtime → move browser/runtime proof earlier for that class of work;
- a provider check is green while runtime identity is unknown → never promote provider build success to runtime truth;
- a founder responds in an unexpected but higher-signal form → adapt the interaction contract instead of forcing the original response shape;
- imported user-controlled content reaches an unsafe render sink → move schema validation plus DOM-safety regression proof earlier for import/custom-content work;
- a classifier misses poisoned retrieved content while deterministic policy contains the action → keep the policy boundary load-bearing and strengthen the detector without pretending detection is authorization;
- proof rules repeatedly stop unrelated verified work → narrow the stop condition to the dependent action and preserve progress elsewhere;
- the same symptom recurs after local repairs → reclassify the symptom as evidence of a deeper bottleneck and fix the governing cause rather than repeat patches.

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
current bottleneck classification
current bottleneck statement
smallest safe bottleneck removal
review state
authority state
surprise signal
adaptive decision
next gate
```

If the verified target/base branch, candidate head, load-bearing scope, or bottleneck evidence moves, dependent proof becomes historical. Reacquire evidence before accelerating, merging, launching, or claiming completion.

Merge still requires the repository's current review/check/authority contract plus current founder-final authority where required.

## Cross-project portability

This kernel is global by behavior, not by copying unrelated implementation into every repository.

Founder Control Room is the canonical governance source. Other projects may mirror or consume this contract, but local runtime/source authority remains owned by each project's real repository and provider state.

Portable Goalfix skills MUST carry the minimum adaptive and bottleneck rules inline or use an explicitly versioned/vendored copy. They must not assume another repository contains `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md` merely because Founder Control Room does.

## Report addition

When the adaptive result materially changes the plan, Goalfix reports SHOULD make the signal visible inside the normal report:

```text
REALITY:
[verified current state]

BOTTLENECK:
[classification + current limiting constraint]
[smallest safe removal or evidence needed to isolate it]

FIX:
[focused change]

PROOF:
[current evidence]

RISK:
[remaining uncertainty plus Future-Us finding when material]

ROLLBACK:
[safe reversal]

ADAPTIVE SIGNAL:
[STRONGER_THAN_EXPECTED | AS_EXPECTED | WEAKER_THAN_EXPECTED | UNEXPECTED_DIRECTION | UNKNOWN]
[action: ACCELERATE | CONTINUE | REPAIR | REORIENT | HOLD | STOP]

NEXT GATE:
[one exact next action or founder decision]
```

## Stop condition

The kernel is functioning correctly when a surprising observation changes future expectations, the current bottleneck is made explicit, and the smallest safe removal is pursued while evidence and authority boundaries remain intact.

No evidence, no promotion. No current exact state, no inherited green. No authority, no privileged action. No bottleneck scan, no serious optimization claim.
