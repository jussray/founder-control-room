# Human-Safe Build Doctrine

Use this rule in every repository and every AI-assisted build session.

## Principle

Build for the human receiving the system, not merely for code completion.

A user-facing component, screen, route gate, approval flow, or workflow must not resolve to silence when the system can show a truthful state.

## Rendering contract

Do not use `return null` for a loading, error, empty, denied, offline, unavailable, recovery, or transitional state that can block understanding or action.

Render the applicable state with:

- plain, truthful language;
- accessible status semantics;
- the safest available next action;
- retry, back, recovery, or safe exit when applicable;
- no false success.

## Valid `null` contracts

Data, parser, service, provider, storage, cache, and optional-value functions may return `null` when it explicitly means `not found`, `not configured`, or `not applicable`.

The contract must be typed or tested. A human-facing caller must translate meaningful absence into a visible state.

Optional decorative components may render nothing only when their absence cannot hide progress, failure, denial, important data, or a required action.

## OODA execution

**Observe:** Read the active route, caller, exact branch head, tests, and rendered behavior. Identify whether `null` is a valid sentinel or a human-facing defect.

**Orient:** Red-team slow responses, empty data, denied access, missing configuration, stale sessions, malformed input, provider failure, offline behavior, privacy boundaries, and narrow layouts.

**Decide:** Choose the smallest proven repair. Prefer platform primitives and existing components. Avoid new dependencies.

**Act:** Render the state, add a focused regression test, and run exact-head type, test, build, Playwright, or device proof as applicable.

## Red-team boundary

Never replace `null` mechanically across a repository. Blind replacement can leak data, weaken authorization, invent content, trigger false success, or break valid optional contracts.

## Definition of done

The human can tell:

1. what the system is doing;
2. what happened;
3. whether their action or data is safe;
4. what they can do next;
5. how to recover when recovery is possible.

No human should receive an empty frame where the system could provide truth, direction, or recovery.
