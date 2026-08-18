# ChatGPT Operating Contract — founder-control-room

This file governs ChatGPT (ChatGPT, API, Codex tasks, and connector-backed sessions) when working in `jussray/founder-control-room`.

Before nontrivial work, also read:

- [`AGENTS.md`](AGENTS.md)
- [`GLOBAL_AI.md`](GLOBAL_AI.md)
- [`.ai/skills/juss-flow-launch-loop/SKILL.md`](.ai/skills/juss-flow-launch-loop/SKILL.md)
- [`docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`](docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md)
- [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md)
- [`docs/TRUTH_DECAY_AUDIT.md`](docs/TRUTH_DECAY_AUDIT.md)
- [`docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`](docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md)

Repository and runtime evidence outrank stale prose. If a governing document contradicts inspected current code or runtime truth, record the contradiction and repair the governing contract rather than pretending the implementation is still in an older phase.

A fact that was once true may be historical rather than current. Preserve the evidence and explicitly classify it `HISTORICAL`, `SUPERSEDED`, `STALE`, `UNKNOWN`, or the applicable domain state instead of allowing old PRs/docs/chat memory to compete silently with current evidence.

## Canonical ChatGPT workflow

Use the founder reasoning stack as **parallel lenses with serialized authority**:

```text
Goal
-> Reality
-> ULTRATHINK
-> Product Design + Data Analytics
-> Redteam I
-> Lindy
-> L99
-> OODA
-> Hormozi
-> Bill Gates
-> Elon Musk
-> Implement
-> Proof
-> Redteam II
-> Documentation truth
-> Review
-> Merge gate
-> Post-merge re-observation
-> Next launch bottleneck
```

Reasoning may run in parallel. Writes, merges, deploys, publications, spending, credentials, database mutation, and destructive actions stay serialized behind their exact authority gates.

Do not use the named lenses as decorative headings. Encode their useful findings into code, tests, workflow contracts, documentation, evidence, or an explicit decision to avoid unnecessary machinery.

## 5W1H — Required Before Every Nontrivial Action

- **Who** — requester, decision owner, affected data subjects, execution authority.
- **What** — requested outcome, deliverable, non-goals, existing work to preserve.
- **Where** — `jussray/founder-control-room`, exact branch, environment, runtime, dashboard data sources, and provider boundary.
- **When** — lifecycle/release state, ordering, timing, truth age, rollback window.
- **Why** — verified founder decision or oversight need and evidence.
- **How** — smallest safe implementation, permissions, verification, rollout, rollback.

## Repository Identity

**Repository:** `jussray/founder-control-room`

**Role:** Founder-facing operational control plane for portfolio truth, missions, approvals, evidence, release state, documentation truth, and narrowly guarded execution across the Chief AI ecosystem.

**Current browser surface:** Founder Control Room has a web UI under `public/control-room/` backed by founder-gated API routes. Do not describe the repository as having no frontend or as a status-only dashboard.

**Trust boundary:** Guarded execution exists, but its existence is not blanket authority. Reads, proposals, approvals, terminal runs, repository writes, merges, deployments, migrations, provider actions, publication, and destructive operations keep their own policy and evidence gates.

## Non-Negotiable Boundaries

- Never expose credentials, private business data, private provider details, customer/order records, private prompts, raw diffs, unreleased roadmap, private metrics, or security-sensitive implementation merely to prove progress.
- Credentials and integration tokens stay in vault or backend secret storage, never client code or public content.
- Keep Founder Control Room data and credentials separate from managed products such as Se’kret Bip.
- Preserve `RepositoryProvider` abstraction unless an approved architecture decision replaces it.
- Founder authentication alone is insufficient; founder allowlist authorization remains enforced.
- Curated operational evidence may cross project boundaries. Raw private user content must not.
- Never invent dashboard state, provider configuration, workflow success, deployment success, approval history, publication outcome, demand, or revenue.
- Never delete founder material without exact deletion authority.
- Never turn the guarded terminal into an unrestricted raw shell.
- Success may only be reported after the corresponding operation and evidence actually succeed.
- Analytics may observe patterns and outcomes but may not approve actions, renew truth, or expand authority.

## Truth Lease / future-you-me safety

A hash proves identity, not continuing reality. For consequential present-tense claims that can decay, re-observe the load-bearing dependencies at the use boundary.

Use the generic Truth Lease only where no equivalent or stronger domain-specific temporal gate already exists. Preserve stronger paths such as founder-content temporal claim revalidation.

At merge, deploy, schedule, publish, completion-claim, and other consequential boundaries:

```text
fresh evidence matches -> CURRENT
proof aged out -> STALE / re-check required
dependency changed -> INVALIDATED / truth changed
required proof missing -> UNKNOWN / proof missing
```

Only current proof may support a current operational claim. Current You preference cannot override contradictory repository/provider/runtime evidence. FutureYou is advisory and cannot become evidence or approval.

## Founder-owned progress publishing / Sauce Guard

The product goal is to publish verified progress about Juss's own products **from Founder Control Room** without giving away the private recipe.

Canonical separation:

```text
verified product evidence
-> Chief proposes public-safe channel-native story
-> Sauce Guard removes private machinery
-> temporal truth revalidation
-> exact Current You authority for the executable path
-> FCR direct adapter or bounded n8n/Zapier orchestration
-> provider readback
-> FCR outcome receipt
-> observation-only analytics
```

LinkedIn may use the stronger first-party path. Facebook, Instagram, TikTok, and other supported social destinations may use provider-neutral n8n where configured and proven. Buffer/Zapier remain bounded helpers where useful, never terminal truth authority.

Investor email stays separate and must never auto-send without both the applicable standing policy and recipient-specific qualification.

## Guarded Execution Boundary

Current code may expose bounded execution such as exact-head mission verification and allowlisted terminal commands. Treat those paths as controlled capabilities, not permission to mutate freely.

For a write-risk action, verify the applicable mission state, exact target SHA, explicit confirmation or approval receipt, policy boundary, evidence, temporal validity, and rollback. A model recommendation is never approval.

## Branch and Merge Discipline

- Inspect current `main` before branching.
- Use one focused branch and one PR per logical repair.
- Preserve unrelated work and history.
- Do not push ordinary implementation directly to `main`.
- Repository merges follow [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md). Standing evidence-based merge authority may permit the exact merge when its conditions are satisfied.
- If `main` or the PR head moves after proof, discard stale merge authority and reacquire/re-run exact-head proof.
- Close or explicitly supersede stale PR candidates once a current-main successor exists; preserve them as historical evidence rather than deleting them.
- Merge authority does **not** silently authorize deployment, migration, auth/RLS changes, credentials, DNS, billing, publication, sending, destructive actions, or other separately gated operations.

## Documentation Truth

Truth-sensitive implementation/provider/authority changes must update `README.md` and the applicable current-state docs in the same bounded change.

Run the repository `Documentation Truth` workflow on the exact PR head and again on merged `main`.

Do not hard-code a durable “current main SHA” into prose and pretend it renews itself after every merge. Exact SHAs belong in receipts/provenance; resolve current identity at use time.

When a document was once correct but is no longer current, preserve provenance and mark it historical/superseded or point it to the current authority. Do not change code merely to make stale prose true.

## Verification

Use the cheapest valid proof first, then escalate:

1. focused type/lint/static contract check;
2. focused unit or integration test;
3. build when relevant;
4. targeted Playwright for changed user-facing web/runtime paths;
5. Documentation Truth for truth-sensitive current-state changes;
6. CI and provider/runtime evidence when the claim depends on them;
7. post-merge exact-main/provider/runtime re-observation before launch claims.

Compilation, tests, CI, Cloudflare build status, deployment identity, documentation consistency, provider publication, and runtime behavior are separate evidence layers. Never substitute one for another.

## Approval Gates

Separate exact founder authority remains required for production deployment, database migration, auth/authorization/RLS changes, credential changes, DNS, billing, destructive writes, publication, sending, external communication, and any other category not covered by a narrower current standing policy.

## Post-merge loop

After every merge:

1. resolve fresh current `main`;
2. verify the merge receipt/exact resulting SHA;
3. run/inspect post-merge Documentation Truth;
4. re-read provider/runtime truth relevant to the change;
5. mark stale PR/docs/evidence so they cannot masquerade as current;
6. update README/current docs if new post-merge provider truth materially changes the documented state;
7. identify the next launch bottleneck;
8. continue only with a bounded next slice.

Do not claim launch merely because the merge loop is moving quickly.

## Output Format

Return: REALITY · FIX · PROOF · RISK · ROLLBACK · NEXT GATE, including exact repo/branch/SHA, files touched, checks actually run, preserved work, truth age/superseded state, documentation state, and any blocked evidence.
