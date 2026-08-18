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

Repository/provider/runtime evidence inspected now outranks stale prose, old PR descriptions, old SHAs, old issue summaries, and chat memory. If a governing document contradicts current executable truth, preserve the historical evidence and repair the governing contract rather than pretending the implementation is still in an older phase.

## Canonical workflow

Use the founder stack as **parallel reasoning lenses with serialized authority**:

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
-> Documentation Truth
-> Review
-> Merge gate
-> post-merge re-observation
-> Next launch bottleneck
```

The named lenses are not decorative headings. Encode useful findings into code, tests, workflow contracts, documentation, or an explicit decision not to add machinery.

Reasoning may run in parallel. Writes, merges, deployments, provider mutations, publication, credentials, spending, destructive actions, and external communication stay serialized behind their exact gates.

## 5W1H — Required Before Every Nontrivial Action

- **Who** — requester, decision owner, affected data subjects, execution authority.
- **What** — requested outcome, deliverable, non-goals, existing work/history to preserve.
- **Where** — exact repository, branch, environment, runtime, data source, and provider boundary.
- **When** — lifecycle/release state, ordering, timing, truth age, use boundary, rollback window.
- **Why** — verified founder decision or operational need and evidence.
- **How** — smallest safe implementation, permissions, proof, rollout, rollback.

## Repository identity

**Repository:** `jussray/founder-control-room`

**Role:** Founder-facing operational control plane for portfolio truth, missions, approvals, evidence, release state, founder-content distribution, and narrowly guarded execution.

**Current browser surface:** Founder Control Room has a web UI under `public/control-room/` backed by founder-gated API routes. Do not describe the repository as having no frontend or as a status-only dashboard.

**Trust boundary:** Guarded execution exists, but its existence is not blanket authority. Reads, proposals, approvals, terminal runs, repository writes, merges, deploys, migrations, provider actions, publication, and destructive operations keep separate policy/evidence gates.

## Non-negotiable boundaries

- Never expose credentials, private business/customer data, private prompts, raw diffs, internal evidence references, private provider payloads, private metrics, unreleased roadmap details, or security-sensitive implementation merely to prove progress.
- Keep Founder Control Room data/credentials separate from managed products such as Se’kret Bip.
- Preserve `RepositoryProvider` abstraction unless a reviewed architecture decision replaces it.
- Founder authentication alone is insufficient; founder allowlist authorization remains enforced.
- Curated operational evidence may cross project boundaries. Raw private user content must not.
- Never invent dashboard state, provider configuration, workflow success, deployment success, review/approval history, publication outcome, demand, users, or revenue.
- Never delete founder material/history merely because current truth changed.
- Never turn the guarded terminal into unrestricted raw shell access.
- Success may only be reported after the corresponding operation/evidence actually succeeds.
- Analytics may observe and inform future proposals but may never authorize, renew truth, or widen authority.

## Truth Lease / FutureYou-ME safety

A fact may have been true when observed and unsafe when reused later. A hash proves identity, not continuing reality.

At consequential merge, deploy, schedule, publish, completion-claim, provider, and launch boundaries:

1. identify the claim and load-bearing dependencies;
2. re-observe the authoritative current source;
3. classify current / historical / stale / superseded-invalidated / unknown;
4. use present-tense operational language only while current;
5. preserve prior evidence as history without promoting it back into current authority;
6. never let Current You preference override contradictory repository/provider/runtime evidence; and
7. never let FutureYou/model synthesis become evidence or approval.

Use `Truth Lease` where no stronger domain-specific temporal gate already exists. Preserve exact-head repository gates and founder-content execution-time revalidation when they are stricter.

## Founder-owned progress publishing / Sauce Guard

Founder Control Room should be able to publish verified progress about Juss's own products **from Founder Control Room** without publishing the private recipe.

Canonical separation:

```text
verified product evidence
-> Chief proposes public-safe channel-native copy
-> Sauce Guard removes private machinery
-> temporal truth revalidation
-> exact Current You authority for the executable route
-> FCR direct adapter or bounded n8n/Zapier orchestration
-> provider readback
-> FCR outcome receipt
-> observation-only analytics
```

LinkedIn may use the stronger first-party route. Other supported destinations may use provider-neutral n8n/direct adapters only when actually configured and proven. Zapier/Buffer may remain bounded connector/scheduling helpers where useful.

Draft capability is not adapter proof. Orchestration acceptance is not publication truth. Provider readback is required for the external-state claim.

Investor email remains separate and must never auto-send without the applicable standing policy plus recipient-specific qualification.

## Guarded execution and review boundary

For a write-risk action, verify mission state, exact target identity, founder authority, review/provider policy, evidence, temporal validity, and rollback. A model recommendation is never approval.

Founder Control Room in-app merges have a stronger current review membrane than generic merge guidance:

- exact provider PR identity and exact head/base;
- exact machine evidence;
- canonical provider diff/policy hashes;
- deterministic review witness;
- trusted non-author semantic review;
- P2 blocking;
- server-owned FCR semantic reviewer trust through `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS` at evaluation; and
- final mutable-head re-read before provider integration.

The in-app FCR gate and the live GitHub repository ruleset are separate authority surfaces. Do not claim current GitHub web/API protections from source code alone. Live required approvals, stale-review dismissal, last-push approval, strict checks, thread requirements, and bypass actor/mode configuration require fresh GitHub provider readback.

## Branch and merge discipline

- Inspect current `main` before branching.
- Use one focused branch/PR per logical repair.
- Preserve unrelated work and historical branches/PRs.
- Do not push ordinary implementation directly to `main`.
- If `main` or the PR head moves after proof, earlier green becomes historical only; re-observe or reacquire the narrow repair on fresh main.
- Do not let parallel candidate PRs consume proof lanes when one foundational merge would immediately make another stale.
- Repository merges follow [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md).
- Author self-review, bot substitution, generic comments, or stale-head review do not satisfy a required independent-review gate.
- Merge authority never silently authorizes deploy, migration, auth/RLS, credentials, DNS/bindings, billing, publication, sending, or destructive actions.

## Documentation Truth

Truth-sensitive implementation/provider/authority changes must update `README.md` and the applicable current-state docs in the same bounded change.

The `Documentation Truth` verifier runs on the exact PR head, is load-bearing inside CI / Required Gate, and runs again on merged `main`.

Do not hard-code a durable “current main SHA” into prose. Exact SHAs belong in receipts and historical provenance; resolve current identity at use time.

When a document was once correct but is no longer current, preserve the evidence and mark it historical/superseded/stale or point it to the current authority. Do not change implementation merely to make stale prose true.

## Verification

Use the cheapest valid proof first, then escalate:

1. focused type/lint/static contract check;
2. focused unit/integration test;
3. build when relevant;
4. targeted Playwright for changed user-facing web/runtime paths;
5. Documentation Truth for truth-sensitive state;
6. CI and provider/runtime evidence when the claim depends on them;
7. post-merge exact-main/provider/runtime re-observation before launch/current-state claims.

Compilation, tests, CI, documentation consistency, Cloudflare builds, deployment identity, browser proof, provider publication, and runtime behavior are separate evidence layers. Never substitute one for another.

## Approval gates

Separate exact founder/provider authority remains required for production deployment, database migration, auth/authorization/RLS changes, credential changes, DNS/provider binding, billing, destructive writes, publication, sending, external communication, and any category not covered by a narrower current standing contract.

## Post-merge loop

After every merge:

1. resolve fresh current `main`;
2. verify the merge result/exact resulting SHA;
3. inspect post-merge Documentation Truth;
4. re-read provider/runtime truth relevant to the change;
5. mark stale PR/docs/evidence so they cannot masquerade as current authority;
6. update current-state docs if new provider/runtime truth materially changes the documented state;
7. identify the next launch bottleneck; and
8. continue only with one bounded next slice.

Do not claim launch merely because the merge loop is moving quickly.

## Output format

Return: REALITY · FIX · PROOF · RISK · ROLLBACK · NEXT GATE, including exact repo/branch/SHA, files touched, checks actually run, preserved work/history, truth age/superseded state, documentation state, and blocked evidence.
