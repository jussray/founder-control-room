# ChatGPT Operating Contract — founder-control-room

This file governs ChatGPT (ChatGPT, API, Codex tasks, and connector-backed sessions) when working in `jussray/founder-control-room`.

Before nontrivial work, also read:

- [`AGENTS.md`](AGENTS.md)
- [`GLOBAL_AI.md`](GLOBAL_AI.md)
- [`docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`](docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md)
- [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md)

Repository and runtime evidence outrank stale prose. If a governing document contradicts inspected current code or runtime truth, record the contradiction and repair the governing contract rather than pretending the implementation is still in an older phase.

## 5W1H — Required Before Every Nontrivial Action

- **Who** — requester, decision owner, affected data subjects, execution authority.
- **What** — requested outcome, deliverable, non-goals, existing work to preserve.
- **Where** — `jussray/founder-control-room`, exact branch, environment, runtime, dashboard data sources, and provider boundary.
- **When** — lifecycle/release state, ordering, timing, rollback window.
- **Why** — verified founder decision or oversight need and evidence.
- **How** — smallest safe implementation, permissions, verification, rollout, rollback.

## Repository Identity

**Repository:** `jussray/founder-control-room`

**Role:** Founder-facing operational control plane for portfolio truth, missions, approvals, evidence, release state, and narrowly guarded execution across the Chief AI ecosystem.

**Current browser surface:** Founder Control Room already has a web UI under `public/control-room/` backed by founder-gated API routes. Do not describe the repository as having no frontend or as a status-only dashboard.

**Trust boundary:** Guarded execution exists, but its existence is not blanket authority. Reads, proposals, approvals, terminal runs, repository writes, merges, deployments, migrations, provider actions, publication, and destructive operations keep their own policy and evidence gates.

## Non-Negotiable Boundaries

- Never expose credentials, private business data, vendor details, or customer/order records in UI or model output.
- Credentials and integration tokens stay in vault or backend secret storage, never client code.
- Keep Founder Control Room data and credentials separate from managed products such as Se’kret Bip.
- Preserve `RepositoryProvider` abstraction unless an approved architecture decision replaces it.
- Founder authentication alone is insufficient; founder allowlist authorization remains enforced.
- Curated operational evidence may cross project boundaries. Raw private user content must not.
- Never invent dashboard state, provider configuration, workflow success, deployment success, approval history, demand, or revenue.
- Never delete founder material without exact deletion authority.
- Never turn the guarded terminal into an unrestricted raw shell.
- Success may only be reported after the corresponding operation and evidence actually succeed.

## Guarded Execution Boundary

Current code may expose bounded execution such as exact-head mission verification and allowlisted terminal commands. Treat those paths as controlled capabilities, not permission to mutate freely.

For a write-risk action, verify the applicable mission state, exact target SHA, explicit confirmation or approval receipt, policy boundary, evidence, and rollback. A model recommendation is never approval.

## Branch and Merge Discipline

- Inspect current `main` before branching.
- Use one focused branch and one PR per logical repair.
- Preserve unrelated work.
- Do not push ordinary implementation directly to `main`.
- Repository merges follow [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md). Standing evidence-based merge authority may permit the exact merge when its conditions are satisfied.
- Merge authority does **not** silently authorize deployment, migration, auth/RLS changes, credentials, DNS, billing, publication, sending, destructive actions, or other separately gated operations.

## Verification

Use the cheapest valid proof first, then escalate:

1. focused type/lint/static contract check;
2. focused unit or integration test;
3. build when relevant;
4. targeted Playwright for changed user-facing web/runtime paths;
5. CI and provider/runtime evidence when the claim depends on them.

Compilation, tests, CI, Cloudflare build status, deployment identity, and runtime behavior are separate evidence layers. Never substitute one for another.

## Approval Gates

Separate exact founder authority remains required for production deployment, database migration, auth/authorization/RLS changes, credential changes, DNS, billing, destructive writes, publication, sending, external communication, and any other category not covered by a narrower standing policy.

## Output Format

Return: REALITY · FIX · PROOF · RISK · ROLLBACK · NEXT GATE, including exact repo/branch/SHA, files touched, checks actually run, preserved work, and any blocked evidence.
