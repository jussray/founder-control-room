# Human-Safe Build Contract

Founder Control Room governs AI-assisted work for the human approving, reviewing, operating, and recovering the portfolio.

## Core rule

A founder-facing control, mission, approval gate, health view, outage view, authentication state, or recovery workflow must not resolve to silence when the system knows enough to show a state.

Do not use `return null` for loading, error, empty, denied, offline, unavailable, recovery, or transitional states that can block understanding or action.

## Required human-facing states

Every control surface must provide the applicable state with clear language and an honest next action:

- loading or checking;
- success;
- empty;
- denied or permission-limited;
- offline or degraded;
- error;
- blocked with the missing proof or approval;
- recovery, retry, back, rollback, or safe exit.

Never imply that a mission, approval, merge, deployment, migration, provider action, or recovery completed when evidence is missing.

## Where `null` remains valid

`null` may remain in provider, data, parser, service, storage, cache, registry, and optional-value contracts when it explicitly means `not found`, `not configured`, `not applicable`, or `unknown`.

That contract must be typed or tested. A founder-facing caller must translate it into a visible state whenever the absence affects comprehension, authority, security, cost, deployment truth, or the next action.

Optional decorative elements may render nothing only when their absence cannot hide progress, failure, denial, evidence, authority, or a required action.

## Safe implementation loop

### Observe

Inspect the active route, component, provider result, exact branch head, mission evidence, approval state, existing tests, and rendered behavior. Distinguish a valid unknown sentinel from a blank-screen defect.

### Orient

Red-team unavailable providers, stale evidence, denied founder access, missing approvals, empty ledgers, partial workflow runs, outages, malformed payloads, network loss, and narrow/mobile layouts.

### Decide

Choose the smallest proven repair. Prefer platform primitives and existing components. Do not add a dependency when plain TypeScript, JavaScript, browser, Node.js, or Worker behavior is sufficient.

### Act

Render the missing state, preserve founder authority and provider boundaries, add a focused regression test, and run the exact applicable proof gates.

## Proof requirements

- Unit or source-contract proof for the state decision.
- Type, test, and build proof where applicable.
- Playwright proof for changed rendered control-room behavior.
- Exact-head CI evidence before merge.
- Separate live provider evidence for deployment, database, domain, or production claims.

A screenshot, design mock, PR body, or green unrelated workflow is not runtime or provider proof.

## Red-team constraints

Never replace `null` mechanically across a repository. Blind replacement can invent evidence, weaken denied states, expose private data, or turn unknown provider status into false confidence.

Never show success when the underlying action is unknown or failed. Never convert a missing approval into implicit authorization merely to avoid a blank screen.

## Definition of done

The change is complete when the founder can tell:

1. what the system is doing;
2. what happened;
3. which evidence and authority are present or missing;
4. what action is available next;
5. how to recover or roll back when recovery is possible.

Build the smallest safe thing, prove it at the exact head, and leave no human staring into an empty frame.
