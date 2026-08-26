---
name: goalfix
description: >
  Token-efficient repair, product-design, and verification skill for Claude,
  Perplexity, Codex, ChatGPT, and other AI agents working across Juss-owned
  GitHub projects. Turns a messy founder goal into the smallest verified fix
  by inspecting the authoritative source, choosing one reversible action,
  patching only the focused cause, and reporting evidence without burning
  unnecessary context.
version: 2.0
visibility: private
owner: Juss
triggers:
  - /goalfix
  - /fixfast
  - /repair-verify-merge
  - ULTRATHINK
  - OODA
  - REDTEAM
---

# /goalfix — Seek, Build, Fix, Verify

## Purpose

Use `/goalfix` when Juss gives a goal, bug, product-design target, GitHub task,
failed check, repo drift, launch blocker, or unclear workflow and wants fast,
truthful progress without wasting tokens.

The skill exists to prevent AI agents from wandering, over-reading, over-building,
rewriting unrelated files, or claiming success before proof exists.

## Core command

```text
/goalfix ULTRATHINK

Goal: [one-sentence outcome]
Repo/branch/PR: [authoritative source]

Seek the real blocker, patch the smallest cause, verify the real path.
Use Playwright for UI/runtime truth. Do not delete, broaden scope, suppress errors,
or claim done without evidence.
Report Reality / Fix / Proof / Risk / Rollback / Next Gate.
```

## Operating stack

Use the shared founder stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

- Founder value: identify the user/business outcome and fastest truthful proof.
- Lindy: prefer durable, portable, reversible fixes over clever temporary tricks.
- Redteam I: attack the premise before changing anything.
- L99: map authority, lifecycle, provenance, evidence, rollback, and compounding value.
- Redteam II: attack the selected fix and its blast radius.
- OODA: observe, orient, decide, act minimally, verify, and loop.
- Art of War: know the ground before movement, win before fighting, avoid unnecessary siege, reuse verified asymmetry, and preserve future options.

## Authority order

When sources conflict, trust this order:

1. Repository, branch, PR, deployed configuration, and runtime actually inspected.
2. Current CI logs, Playwright artifacts, screenshots, traces, schemas, and API responses.
3. Explicit Juss decisions and approved project records.
4. Current official provider documentation.
5. Prior summaries, generated plans, chat memory, and assumptions.

Never claim a file, feature, check, deployment, merge, account state, or provider
action exists without evidence.

## Token budget rules

Before reading broadly, state the token preflight:

```text
AUTHORITATIVE SOURCE:
TARGET:
LIKELY FAILURE AREA:
FIRST FILES/LOGS NEEDED:
STOP CONDITION:
```

Then work narrow-first:

- Search exact errors, failing test names, route names, config names, component names,
  workflow names, and recent diffs before scanning whole repos.
- Read only files that can affect the target path.
- Summarize relevant lines instead of pasting huge files.
- Ask for one missing artifact at a time.
- Stop when the next action requires approval, credentials, private data, or irreversible change.
- Do not run a full-context audit when a focused file, log, or test can answer the question.

## Workflow

### 1. Observe

Inspect the real source of truth:

- repository and branch;
- PR and diff when applicable;
- CI status, job logs, and artifacts;
- deployment/provider logs when relevant;
- app runtime behavior;
- Playwright screenshots/traces for UI and browser flows;
- Product Design source image, Figma frame, screenshot, URL, or coded implementation when design is involved.

Classify all important statements as:

- VERIFIED;
- INFERRED;
- UNKNOWN;
- BLOCKED;
- STALE when previously valid evidence no longer matches current state.

### 2. Orient

Map the goal through 5W1H:

- Who owns the decision, performs the work, and is affected?
- What must change, and what must stay untouched?
- Where is the authoritative source, environment, and proof?
- When should this run, stop, rerun, merge, deploy, or roll back?
- Why does this serve the product, user, brand, business, or safety objective?
- How will it be implemented, tested, observed, and reversed?

Before mutation, satisfy the win-before-fighting preflight: authoritative repository,
target branch, exact base SHA, founder outcome, suspected failure area, first evidence
targets, stop condition, smallest reversible change, rollback, proof plan, and unrelated-work preservation.

### 3. Decide

Pick one focused fix.

Rules:

- one root cause before many symptoms;
- smallest reversible patch;
- no unrelated refactors;
- no mass rewrites unless explicitly authorized;
- no deletion without specific approval;
- no merge unless intended scope, checks, real-path verification, and rollback are understood;
- no public claim without proof.

### 4. Builder

Patch only the needed files.

For code:

- preserve unrelated work;
- keep diffs small;
- use a branch rather than unreviewed direct-main mutation;
- add or update the narrowest useful test;
- do not suppress failing signals;
- do not fake green with mocks, fallbacks, swallowed errors, or hidden skips;
- emit Builder evidence, but never self-certify the fix.

For Product Design:

- preserve the selected visual target and user outcome;
- do not redesign adjacent UI unless requested;
- check responsive states, keyboard/focus behavior, reduced motion, readable contrast,
  empty/loading/error states, and teen-facing privacy/safety copy when relevant;
- compare the coded result against the source visual before handoff.

### 5. Independent Verifier

Run the cheapest valid verification first, then escalate only as needed:

1. static check for touched area;
2. focused unit or integration test;
3. targeted Playwright test for real UI/browser flow;
4. CI or deployment check;
5. artifact/log/screenshot/trace inspection.

Verifier must be independent from Builder for load-bearing certification. Exact-head
receipts must bind to the actual candidate head, not GitHub's synthetic PR merge SHA.

For Se’kret Bip UI, auth, routing, onboarding, splash, preview, waitlist, or runtime
work, Playwright evidence is required before calling the path done.

If GitHub Actions fails with zero useful steps or no product logs, classify it as
infrastructure until job evidence proves a code regression. Do not merge from a
monitoring-only workflow.

### 6. Red Team / Devil

Attack the exact verified candidate rather than a remembered design.

Check for:

- authority bypass;
- stale or mismatched head/diff proof;
- hidden alternate ingress or provider path;
- error suppression or false-success state;
- scope expansion and unrelated blast radius;
- rollback failure;
- evidence produced only by the component being tested;
- proof-cookie lineage that is expired, revoked, cyclic, detached, or unknown-parent.

Red Team must be independent from both Builder and Verifier.

### 7. Exact-head merge gate

The executable workflow is `src/goalfix/executionWorkflow.ts`; the human-readable
contract is `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`.

Every load-bearing checkpoint carries:

```text
repository
exact base SHA
exact candidate head SHA
diff fingerprint
evidence IDs
technical fingerprints
proof-cookie provenance
```

Proof cookies are internal provenance metadata only. They are not HTTP/browser
cookies, auth tokens, bearer credentials, secrets, or tracking identifiers.

If `main` moved after proof, prior green becomes historical provenance:

```text
main moved
→ REVERIFY_REQUIRED
→ reacquire focused change on current main
→ recompute diff fingerprint
→ rerun Verifier
→ rerun Red Team
```

Machine green is not merge authority. Founder merge approval must bind to the exact
candidate head and exact diff fingerprint. Merge using expected-head protection.

### 8. Post-merge truth

Merge is not completion.

After merge:

1. reacquire current `main`;
2. verify merged identity;
3. obtain provider/runtime/browser proof required by the change;
4. correlate receipts to current fingerprints and provenance;
5. mark complete only when the real path is current.

When runtime proof is required but absent, state is `MERGED_UNVERIFIED`, not done.

### 9. Report

Return this exact compact report:

```text
REALITY:
[verified current state]

FIX:
[files changed, commit/PR if applicable]

PROOF:
[tests, logs, screenshots, traces, CI, runtime evidence]

RISK:
[what could still be wrong]

ROLLBACK:
[how to reverse safely]

NEXT GATE:
[one exact founder decision or next action]
```

## Fingerprints and proof cookies

The workflow reuses ATTACK-20 V3 `ProofBinding` semantics:

```text
technical fingerprint
+
declared continuity/provenance cookie
=
load-bearing proof binding
```

A fingerprint says what exact state was observed. A proof cookie says which declared
founder/builder/verification/provider context owns that observation. Either stale or
broken dimension makes the affected proof `UNVERIFIED`.

## Stop conditions

Stop before acting when:

- repo, branch, PR, environment, or source-of-truth authority is unclear;
- credentials, private prompts, sensitive teen data, user records, or private business logic may be exposed;
- deletion or irreversible exposure lacks explicit approval;
- merge or release lacks required evidence;
- the requested action would move away from Juss’s stated objective;
- Product Design lacks a visual target or intended user outcome and building would invent too much.

When stopped, give the exact blocker, safest useful action still available, and the
evidence or approval required.

## Agent-specific notes

- Claude: use this as a project skill or reusable command and honor execution workflow v2 after mutation approval.
- Codex: use it as the execution contract before editing files; verify with tests and Playwright where relevant.
- ChatGPT: use it as the chat-to-action frame and GitHub/Product Design handoff spec.
- Perplexity: use it for fast source discovery, docs verification, and citation-backed blocker research before code edits.

## One-line mantra

Seek the real blocker. Patch the smallest cause. Verify the real path. Preserve the founder’s options.
