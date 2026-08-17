---
name: control-room-proof-ladder
description: Apply before completion, readiness, deployment, publication, synchronization, or operational claims to separate configuration, CI, provider, runtime, and outcome proof.
version: 1.1.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: quarterly
---

# Control Room Proof Ladder

## Trigger

Use before any claim that work is complete, fixed, green, ready, deployed, merged, published, connected, synchronized, or operational.

## Purpose

Prevent false-green completion by keeping evidence layers separate and requiring the strongest proof appropriate to the claim.

## Evidence ladder

1. **Configuration proof** — files parse and internal contracts pass.
2. **Compilation proof** — typecheck or build succeeds on the exact head.
3. **Behavior proof** — focused unit or integration tests exercise the changed behavior.
4. **Repository proof** — required CI executes on the exact commit and returns a real conclusion.
5. **Rendered-path proof** — Playwright or equivalent verifies the real browser-visible path against the exact artifact.
6. **Provider proof** — the provider returns a build, deployment, run, message, record, or mutation identifier.
7. **Runtime proof** — logs, traces, screenshots, read-back, or observed behavior confirm the deployed path.
8. **Outcome proof** — the intended user or business result occurred without violating safety, privacy, authority, or accounting boundaries.

## Claim ceiling

An agent may claim only the highest layer actually proven.

Examples:

- valid MCP JSON means **configuration verified**, not connected;
- OAuth success means **authorization completed**, not tool execution;
- merged PR means **source integrated**, not deployed;
- successful Cloudflare build means **build succeeded**, not route or user flow verified;
- a Zapier bridge response without a run ID is **bridge evidence**, not Zap execution;
- a screenshot means **render evidence**, not auth, data, or backend correctness.

## Exact-head rule

Repository evidence must identify the exact 40-character commit SHA. Older-SHA, skipped, queued, cancelled, zero-step, no-log, or unrelated checks are not passes for the target head.

## Consumer-bound dependency proof

A dependency change is not proven merely because a founder, agent, settings screen, API write, secret rotation, or provider dashboard says it changed. Before resuming a blocked lane, prove the **actual consumer** can observe the expected new state without exposing sensitive values.

Examples:

- a secret is not proven available until the exact consuming workflow or runtime sees it as present and passes its shape/authority preflight;
- a ruleset repair is not proven until provider read-back matches the intended review and status-check policy;
- a DNS or route mutation is not proven until the canonical hostname reaches the intended service and exact runtime witness;
- a newly green provider build does not erase an independent runtime or application failure.

A human or agent report that a dependency changed is a **retry trigger to verify**, not proof that the dependency is usable.

## Evidence fingerprint and retry rule

For every blocking failure, retain a compact fingerprint containing the minimum fields that determine whether a retry could produce new evidence:

```text
repository / branch / exact head
blocking gate or consumer
failure classification
external dependency identifier or provider receipt
relevant configuration or runtime revision
```

Retry only after at least one fingerprint component has materially changed or a previously queued/running check reaches a new terminal conclusion.

If the same terminal blocker fingerprint is observed twice with no new evidence:

1. stop automatic retries and duplicate reads;
2. mark the lane `BLOCKED` with one explicit retry trigger;
3. do not manufacture a new commit solely to rerun unchanged external state unless the workflow itself requires an exact-head retrigger and the external dependency is proven changed;
4. if `main`, the PR base, or the authoritative runtime moves, reacquire authority before continuing;
5. resume only when the named retry trigger is evidenced.

## Required proof record

```text
Claim:
Highest proven layer:
Repository/branch/SHA:
Commands and checks:
Provider identifiers:
Runtime artifact:
Missing layer:
False-green test:
Blocker fingerprint:
Retry trigger:
Next gate:
```

## Failure classification

- `not_run`: evidence was never attempted;
- `in_progress`: evidence exists but has no final conclusion;
- `infrastructure_blocked`: runner, provider, or environment failed before meaningful execution;
- `product_failed`: a meaningful test or runtime path failed;
- `scope_not_applicable`: the layer does not apply, with written justification;
- `passed`: exact evidence supports the claim.

## Non-negotiable rules

- No approval carries forward from one evidence layer to another.
- Do not convert absence of errors into success.
- Do not suppress, skip, weaken, or rename a failing gate to create a green appearance.
- Do not call work done while required proof remains queued or in progress.
- Runtime evidence must be minimized and must not expose secrets or private user data.
- Do not retry an unchanged terminal blocker merely to create a newer timestamp.
- Do not treat a reported dependency change as successful until the intended consumer proves it.

## Definition of done

The claim, proof layer, exact evidence, missing evidence, false-green test, blocker fingerprint, retry trigger, rollback, and next gate are recorded without overstating what passed or repeating an unchanged proof loop.
