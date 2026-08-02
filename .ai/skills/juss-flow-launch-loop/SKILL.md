---
name: juss-flow-launch-loop
description: >
  Canonical execution controller for Juss-directed implementation, review, merge,
  release, and full-app-launch work. Converts ULTRATHINK, steal, Lindy, OODA,
  L99, Bill Gates, Elon Musk, GoalFix, and Juss Flow into an evidence-gated loop.
version: 1.0
visibility: private
owner: Juss
---

# Juss Flow Launch Loop

## Goal

Move the authoritative product toward a truthful full app launch without replacing
Juss's intent with a smaller cosmetic task, creating fake-green evidence, deleting
history, or scaling an unproven path.

`/goal full app launch` is a durable mission, not permission to claim launch before
runtime, product, privacy, provider, release, and rollback evidence exists.

## Voice and intent

Keep Juss's flow: direct, founder-readable, energetic, plainspoken, and outcome-first.
Do not bury the decision in corporate language. Preserve canon names, product intent,
brand tone, and the reason the feature exists. Translate shorthand into explicit
engineering contracts without sanding off the founder's actual objective.

## Canonical reasoning sequence

```text
Goal
-> Reality
-> ULTRATHINK
-> Steal pass
-> Redteam I
-> Lindy
-> L99
-> Redteam II
-> OODA
-> Bill Gates
-> Elon Musk
-> Implement
-> Proof
-> Review
-> Merge gate
-> Release truth
-> Rollback
-> Next loop
```

The sequence continues during implementation. It is not decorative prose added after
a diff.

## Method contracts

### ULTRATHINK

Use deeper analysis where the work crosses repositories, providers, auth, privacy,
security, money, brand, user state, production, or irreversible actions. Decompose the
system, identify hidden dependencies, separate verified facts from inference, and
surface the bottleneck early.

ULTRATHINK does not authorize endless analysis. Stop when the highest-leverage safe
next action is clear and its proof contract is defined.

### Steal

Steal principles, structures, and durable mechanisms. Do not copy protected expression,
private implementation, credentials, branding, or proprietary assets.

For every borrowed pattern record:

- source or inspiration;
- principle being adopted;
- why it fits this product;
- what is deliberately different;
- legal, brand, privacy, and maintenance risk;
- proof that the adapted mechanism works here.

`steal me too` means capture Juss's own repeatable judgment, language patterns,
decision rules, and proven workflows as versioned internal skills. It does not mean
impersonating Juss publicly or inventing approval.

### Lindy

Prefer mechanisms that survive provider swaps, team changes, scale, and time:

- open formats;
- explicit contracts;
- portable data;
- reversible migrations;
- observable state;
- small interfaces;
- documented ownership;
- boring infrastructure where boring wins.

Reject temporary cleverness that hides authority or creates future lock-in without a
material near-term advantage.

### L99

Map the complete system before broad mutation:

- who has authority;
- what state exists;
- where state is stored;
- when transitions occur;
- why the transition is allowed;
- how it is executed;
- provenance;
- evidence;
- privacy boundary;
- cost;
- failure modes;
- rollback;
- compounding value;
- next authority gate.

No important state transition may exist only in agent memory.

### OODA

Observe the actual repo, branch, providers, tests, runtime, designs, and user flow.
Orient around the founder goal and current bottleneck. Decide one reversible path.
Act minimally. Re-observe after every meaningful edit, test, review, merge, and deploy.

### Bill Gates pass

Ask:

1. What is the bottleneck?
2. What single correction creates the most leverage?
3. What reusable standard prevents this class of failure?
4. What should not be scaled yet?
5. Can the result be measured without theater metrics?

### Elon Musk pass

In this order:

1. Question each requirement and its owner.
2. Delete unnecessary steps, code, providers, and abstractions.
3. Simplify and optimize what remains.
4. Shorten the feedback and proof cycle.
5. Automate only the stable path.

Automation before deletion and simplification is a defect multiplier.

## GoalFix

When the literal request conflicts with the actual launch goal:

1. state the requested action;
2. state the inferred durable goal;
3. identify the mismatch;
4. preserve the goal;
5. choose the smallest action that advances it;
6. name what remains blocked.

Never quietly shrink `full app launch` into documentation-only completion.

## Product Design gate

For new product surfaces:

1. define the user and intended outcome;
2. inspect existing visual and product truth;
3. create exactly three genuinely distinct directions when no target exists;
4. record the selected target;
5. implement responsively;
6. verify loading, empty, partial, error, blocked, stale, and success states;
7. verify keyboard, screen reader, contrast, motion, and touch behavior;
8. compare source visual to rendered output;
9. capture Playwright screenshots and traces tied to the exact SHA.

Design evidence proves UX and visual behavior only. It does not prove auth, RLS,
database, provider, deployment, or production safety.

## Implementation contract

Before mutation, record:

```text
Goal:
Authoritative repo:
Base branch and SHA:
Current truth:
Critical bottleneck:
Smallest coherent slice:
Definition of done:
Required tests:
Runtime proof:
Rollback:
Next founder gate:
```

Implementation rules:

- audit before edit;
- preserve unrelated work;
- prefer surgical, reversible changes;
- do not remove behavior merely to make tests pass;
- do not expose or hardcode secrets;
- add behavior tests for changed contracts;
- add Playwright for changed user-facing paths;
- keep mock, fallback, fixture, and production paths visibly distinct;
- attach evidence to the exact branch and SHA;
- report verified, inferred, blocked, and untested separately.

## Review loop

Review is a fresh attack, not self-congratulation.

1. Compare base and head.
2. Read every changed file in context.
3. Reconstruct user-visible and state-transition behavior.
4. Run Redteam II on the selected implementation.
5. Inspect tests for false confidence and missing negative cases.
6. Inspect security, privacy, accessibility, cost, observability, and rollback.
7. Resolve material review threads.
8. Rerun required checks on the exact head SHA.
9. Re-observe runtime and design evidence.

Do not approve merely because the author and reviewer are the same agent.

## Merge gate

Standing founder intent allows a merge only when all repository merge-authority
conditions are satisfied. It does not waive them.

Merge only when:

- scope and intent match;
- the head SHA has not moved since verification;
- required checks are genuinely green;
- user-facing paths have current Playwright proof when relevant;
- no unresolved critical review thread remains;
- runtime/provider evidence is sufficient for the claim;
- privacy, security, brand, and data boundaries pass;
- rollback is understood;
- the PR does not mix unrelated risky work.

Use the repository's preferred merge method. Pass the expected head SHA when the API
supports it. If the head moves, stop and verify again.

## Release and launch truth

Distinguish these states:

```text
specified
implemented
unit-verified
integration-verified
browser-verified
CI-verified
merged
deployed
runtime-verified
launch-ready
launched
```

Never collapse them into one green badge.

A full app launch requires at minimum:

- the intended public or approved user entry point works;
- authentication and authorization are verified;
- data and privacy boundaries are verified;
- primary user journeys pass in a production-like environment;
- provider dependencies and failure states are understood;
- monitoring and incident ownership exist;
- rollback is executable;
- accessibility blockers are resolved;
- legal, safety, or minor-user gates relevant to the product are satisfied;
- release evidence is tied to the deployed artifact;
- Juss retains final control over publication and irreversible launch actions.

## Loop behavior

After each merge or blocked attempt:

1. Observe current release truth.
2. Select the next launch bottleneck.
3. Open or update one bounded mission.
4. Implement the smallest coherent slice.
5. Verify and review.
6. Merge only if green.
7. Record proof, rollback, and the next gate.

Do not run an uncontrolled autonomous merge loop. Each iteration must remain bounded by
current evidence, repository rules, provider permissions, and explicit irreversible
action gates.

## Completion report

End material work with:

```text
Changed:
Proven:
Not proven:
Risks:
Rollback:
Release state:
Next exact action:
Next founder gate:
```
