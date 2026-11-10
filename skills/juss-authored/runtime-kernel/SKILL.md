---
name: "runtime-kernel"
description: "Executable runtime verification kernel with complete enforcement: proves WHAT/WHERE/WHEN, separates forensic WHO from authority, validates evidence independence, blocks self-certification, and detects value/evidence confusion."
---

# Runtime Kernel

Author: Juss

The point of this kernel: code, CI, and deploy can all be green while production is broken, and an
agent can sound certain about who caused something it only watched happen. Every claim has to pay rent
at the real execution boundary.

## Class separation (don't blend these)

| Class | Members | Job | Is NOT |
|---|---|---|---|
| Router | ULTRATHINK | pick skills, depth, route, aggregate, detect contradictions | a source of truth |
| Reasoning | Socrates, 80/20, MoSCoW, Redteam I/Twin, Lindy/Twin | narrow, prioritize, attack | proof |
| Governance | L99, DECLARE→PERMIT→…→DECIDE | authority, rollback, decisions | execution |
| Loop | OODA, /goalfix | one bounded change, reloop | verification |
| Instruments | Python, JS/TS, Playwright | inspect and exercise reality | reasoning |
| Truth | runtime readback (browser, API, DB, provider) | what is actually so | interpretation |

Reasoning suggests truth. Code inspects it. Tests approximate it. Runtime exposes it. Evidence preserves
it. Governance authorizes decisions. None substitute for another.

## Attribution invariant

```text
possible_actors = [FCR, Chief, PromptOS, Sol, agents, CI/CD, humans, providers, ...]
FORENSIC_WHO = UNKNOWN
UNKNOWN --identity+action evidence--> CANDIDATE --sufficient attribution evidence--> PROVEN
```

An inventory of who *could* have acted is not an answer to who *did*. Never infer owner, actor,
deployer, requester, cause, or responsible system from context, naming, or "it's usually X."

**Attribution and authority are independent dimensions.** A runtime kernel must be able to prove that
an actor performed an action even when that actor had no authority to do it.

```text
ATTRIBUTION = UNKNOWN | CANDIDATE | PROVEN
AUTHORITY   = AUTHORIZED | UNAUTHORIZED | UNKNOWN
```

Therefore this is valid and important:

```text
WHO.EXECUTED.attribution = PROVEN
WHO.EXECUTED.authority_status = UNAUTHORIZED
```

WHO splits into independent roles, each bound separately and each potentially different:
`REQUESTED · AUTHORIZED · EXECUTED · OBSERVED · VERIFIED · DECIDED`.

WHY follows the same evidence ladder. Stated intent is not cause. Correlation ("it broke after the
deploy") is CANDIDATE at best until a trace, diff, or reproduction links cause to effect.

## Forensic WHO vs prospective action authority

These are **different questions**, not an exception to one another.

- **Forensic WHO** asks who performed a past action. It remains UNKNOWN until attribution evidence proves
  identity + action. Investigation order is WHAT → WHERE → WHEN → HOW → WHY → WHO.
- **Prospective action authority** asks whether the actor about to create a side effect is allowed to do
  so. It is a precondition to PERMIT/ATTEMPT and does not prove forensic attribution of any past event.

If prospective authority cannot be proven before a governed side effect, the action is BLOCKED. That
block does not magically answer forensic WHO.

## 5W1H as evidence slots

Every slot carries three distinct things:

```text
value      = the fact or candidate fact being asserted
status     = UNKNOWN | CANDIDATE | PROVEN
evidence[] = pointers that support the status
```

Do not use the value itself as its own evidence. A production URL can be the WHERE value; it is not
proof that a behavior occurred there.

| Axis | Bind with |
|---|---|
| WHAT | observed state/change/claim, not the ticket's description of it |
| WHERE | exact repo, branch, environment, URL, Worker, DB, provider, browser |
| WHEN | observation timestamp; bind artifact/deployment generation separately when relevant |
| HOW | commits, workflow runs, commands, logs, provider events, Playwright traces |
| WHY | causal evidence only; else UNKNOWN/CANDIDATE |
| WHO | per-role attribution plus separate authority status/evidence |

Rules:
- `PROVEN` requires a non-empty value and evidence.
- `CANDIDATE` also requires a value and at least one evidence pointer; unsupported guesses stay UNKNOWN.
- `UNKNOWN` uses `value: null` (or an explicitly unknown value) and does not masquerade as evidence.
- A value cannot be its own evidence. The URL is the WHERE; the trace proves the URL was reached.

## Depth scaling (80/20 governs the kernel itself)

Running every layer on a typo is the token waste /goalfix exists to prevent. ULTRATHINK picks depth:

- **Light** — reversible, local, no prod/money/user data: Socrates → /goalfix → cheapest proof.
- **Standard** — touches deploy, auth, data, or a shared surface: add MoSCoW, Redteam I, L99, OODA.
- **Full** — irreversible, public, money, minors' data (Se'kret Bip), or attribution disputes: every
  layer including both Twins, independent verifier required.

State the chosen depth and why in one line before starting.

## The layers (what each must output)

- **Socrates** — list assumptions; for each, "do we know this, or did we see WHAT from somewhere?"
- **80/20** — the single highest-leverage proof to get first.
- **MoSCoW** — Must-prove / Should / Could / Won't for this claim.
- **Redteam I** — how the chosen fix fails.
- **Redteam Twin** — attacks Redteam I's framing: could the evidence pass while reality is broken? is
  the verifier, env, or cache stale? is the test proving a simulation? could another actor have
  produced identical evidence? Independence matters: if subagents exist, run the Twin in a fresh agent
  that gets the claim and evidence but not Redteam I's reasoning. Same context twice is not a twin.
- **Lindymode** — prefer boring, explicit, reversible, few-dependency patterns.
- **Lindymode Twin** — what future change (provider, deps, auth model, schema, secret rotation, domain,
  new surface) makes the "durable" choice wrong here?
- **L99** — Authority · State · Evidence · Rollback · Compounding value. No actor both creates an
  effect and is the sole certifier of it.
- **OODA** — Observe actual state → Orient against goal/MoSCoW → Decide → Act one bounded change → reloop.
  Outcome read: STRONGER / AS_EXPECTED / WEAKER / UNEXPECTED_DIRECTION / UNKNOWN →
  ACCELERATE / CONTINUE / REPAIR / REFOCUS / HALT.
- **/goalfix** — smallest reversible patch, narrowest test, no unrelated refactor, never merge without
  green checks + real-path proof.

## Instruments

Python when data/state/evidence dominates (hashing, schema, receipts, DB/API probes, log parsing).
JS/TS when browser/runtime dominates (Playwright, DOM, Workers, webhooks, real user flows). Both only
when the proof genuinely crosses layers. Se'kret Bip UI/runtime fixes require Playwright evidence before
VERIFIED.

## Runtime proof minimum

A first-class runtime claim cannot become VERIFIED merely because `must` is empty or because a verifier
exists. VERIFIED requires, at minimum:

```text
WHAT.PROVEN
WHERE.PROVEN
WHEN.PROVEN
runtime.observed = true
runtime.environment is bound
```

When an artifact identity is relevant, `runtime.artifact_required = true` and an artifact binding is
mandatory. If execution occurred in the governed run, WHO.EXECUTED must be PROVEN so verifier/executor
independence can actually be established. An UNKNOWN executor cannot satisfy an independent-verifier
Must.

## Receipts

Record each run as a JSON receipt and validate it:

```bash
python scripts/check_receipt.py receipt.json
```

The checker enforces:
- PROVEN and CANDIDATE 5W1H slots carry separate value + evidence.
- forensic WHO attribution binds actor + identity evidence + action evidence; authority is recorded
  separately as AUTHORIZED / UNAUTHORIZED / UNKNOWN and must be AUTHORIZED for VERIFIED claims.
- PROVEN WHY carries causal (not correlational) evidence.
- governed side effects require prospective authority before ATTEMPT, and EXECUTED actor must match
  the authorized actor.
- VERIFIED always requires WHAT/WHERE/WHEN, a real runtime observation, environment binding, relevant
  artifact binding, and a PROVEN verifier with AUTHORIZED status.
- if execution occurred, VERIFIED requires a PROVEN executor distinct from the verifier, both with
  AUTHORIZED authority status.
- an empty `must` list can never bypass the core runtime proof minimum.
- a value cannot be its own evidence (e.g., URL in WHERE.evidence is invalid; trace pointer is valid).
- identity evidence cannot be reused to claim different actors performed different actions.

Schema and examples live in `references/receipt-schema.md`.

## Final states

`VERIFIED · FAILED · UNKNOWN · RECONCILING · BLOCKED` — UNKNOWN never quietly becomes success, and
"tests passed" is not VERIFIED unless evidence covers the real path required by the claim.

## Report

```text
DEPTH:     light | standard | full — one-line reason
REALITY:   5W1H slots with value + PROVEN/CANDIDATE/UNKNOWN + evidence pointers
FIX:       files / commit / PR
PROOF:     tests, Playwright traces, logs, provider readback, receipt path + checker result
RISK:      what Redteam Twin + Lindy Twin left standing
ROLLBACK:  exact reversal
STATE:     VERIFIED | FAILED | UNKNOWN | RECONCILING | BLOCKED
NEXT GATE: one founder decision or action
```