# Founder Control Room Global AI Contract

## Parent operating contract

Before nontrivial work, read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md).
For Se’kret Bip acquisition, splash, preview, waiting-list, sponsorship, or social
launch work, also read [`Juss Private Operating Plan`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).
For repository integration decisions, read [`Founder Merge Authority`](docs/FOUNDER_MERGE_AUTHORITY.md).
For code-quality expectations, read [`Agent Quality Standard`](docs/AGENT_QUALITY_STANDARD.md).
For agent-requested command execution, read [`Founder Command Bridge`](docs/FOUNDER_COMMAND_BRIDGE.md).
For repository read/edit/write work, read [`Founder GitHub Workspace`](docs/FOUNDER_GITHUB_WORKSPACE.md).

The Founder OS is the private parent skill. This file specializes it for Founder
Control Room. Repository-specific rules may become stricter, but they may not
weaken founder authority, brand/IP protection, privacy, evidence, rollback,
non-deletion, or truthfulness.

This repository follows the shared Jussray founder operating stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

Repeated `redteam` tokens are intentional.

1. **GaryVee frame** — define founder value, operator outcome, and fastest truthful proof.
2. **Lindy screen** — prefer provider-independent interfaces, portable data, Git primitives, documented adapters, and reversible changes.
3. **Redteam I: premise** — attack whether the requested control, automation, or integration should exist and whether the evidence supports it.
4. **L99 systems pass** — inspect authority, provenance, state transitions, event history, provider boundaries, approvals, release gates, rollback, and drift.
5. **Redteam II: plan** — attack the selected implementation, blast radius, founder lockout, credential exposure, cross-project contamination, rollback, and proof.
6. **OODA** — re-observe, orient, decide one path, act minimally, verify, and loop.

Do not collapse the two redteam passes. The first attacks the task. The second attacks the proposed solution.

## Implementation discipline

The operating stack governs implementation, not merely planning or final summaries. Use it while writing code, schemas, migrations, provider adapters, workflows, tests, documentation, and deployment configuration.

For every material implementation, keep this sequence visible in the working decision record:

```text
Goal
→ Reality
→ Redteam I
→ Lindy
→ L99
→ Redteam II
→ OODA
→ Bill Gates
→ Proof
→ Rollback
→ Next gate
```

The **Bill Gates implementation pass** is appended after OODA. It must identify:

- the current bottleneck;
- the highest-leverage correction;
- what should be standardized for reuse;
- what must not be scaled or automated yet.

This extension does not replace or weaken the exact founder stack. It forces the selected code path to survive one final operating-system and scale review before completion is claimed.

Implementation rules:

- Do not stop reasoning when code generation begins.
- Re-observe after each meaningful change rather than carrying stale assumptions into the next file.
- Map code paths to explicit guardrails, evidence sources, and approval boundaries.
- Treat compilation as syntax evidence, tests as behavioral evidence, CI as repository evidence, and runtime observation as deployment evidence. None substitutes for all the others.
- Never code around an unknown provider state, schema state, credential state, or failed workflow merely to make the patch appear complete.
- Report the exact behavior changed, tests actually run, failures or skips, security and provider impact, rollback path, unresolved risk, and next approval gate.

## Truth order

1. Repository, branch, deployed configuration, and runtime actually inspected.
2. Current tests, logs, schemas, API responses, and observed behavior.
3. Explicit founder decisions and approved records.
4. Current official provider documentation.
5. Prior summaries, generated plans, chat memory, and assumptions.

Never claim a file, feature, test, branch, merge, deployment, approval, or provider action exists without evidence.

## Control Room boundaries

- The Control Room is provider-independent. GitHub is the first repository provider, not permanent constitutional infrastructure.
- The Control Room uses its own Supabase project and credentials. It must not borrow Se’kret Bip service-role credentials or directly query Bip’s private database with broad access.
- Bip may send curated, minimized operational events. The Control Room must not become a shadow copy of teen journals, voice, media, parent visibility, or emotional-safety data.
- Founder authorization requires both a valid session and the founder allowlist. Authentication alone is not authorization.
- Every material read, proposal, approval, integration, deployment, rollback, and provider action should leave an auditable event.
- No approval carries forward automatically except the standing evidence-based merge authority recorded in `docs/FOUNDER_MERGE_AUTHORITY.md`. Deployment, migration, rollback, auth, secrets, billing, deletion, publication, and external action remain separate gates.

## Provider roles

- **Claude / Claude Code** — long-context repository analysis, structured implementation, careful refactors, and documentation.
- **Codex / ChatGPT** — debugging, code review, data analysis, repository operations, and founder-readable synthesis.
- **OpenAI Platform** — replaceable server-side model capability behind adapters; never client-side keys.
- **Anthropic Platform** — replaceable server-side model capability; model context is not durable memory.
- **Perplexity** — current public research and source discovery, not private runtime truth.
- **GitHub** — source control, review, CI evidence, and provenance; a merge is not proof of deployment.
- **Supabase** — Control Room authentication and operational storage within this project’s own trust boundary.

## Non-negotiable rules

- Inspect before editing.
- Search for existing interfaces, providers, routes, schemas, and events before adding another.
- Preserve provider abstraction and project separation.
- Prefer focused patches over broad rewrites.
- Keep tokens, service-role credentials, founder sessions, provider secrets, and privileged model calls off public clients and logs.
- Do not weaken auth, founder allowlisting, RLS, audit logging, tests, types, or release gates to make a check green.
- Do not silently change provider ownership, project registry semantics, event schemas, approval states, or deployment targets.
- Do not treat model output as approval, authorization, or repository truth.
- Merge only under the conditions in `docs/FOUNDER_MERGE_AUTHORITY.md`; a merge must never silently authorize a separately gated action.
- For nontrivial code changes, run `npm run typecheck` and `npm test` before claiming readiness, or explicitly report why they could not be run.
- Agents may request command execution through Command Bridge, but they must not receive a raw shell or bypass founder direction.
- Repository edits from Control Room must go through GitHub Workspace or the Approval Engine patch route, and writes must land on mission branches unless a separate founder merge gate is satisfied.

## Approval gates

Require explicit founder approval before:

- creating operational branches or sandboxes when the current authority policy requires it;
- force-pushing, production deploying, or rolling back;
- changing founder identity, auth, authorization, allowlists, sessions, or RLS;
- adding, rotating, deleting, or exposing credentials;
- changing repository providers, domains, DNS, production environments, or billing;
- destructive database or event-history changes;
- sending external communications or executing provider actions in the founder’s name.

Repository merges are governed by the standing founder decision in `docs/FOUNDER_MERGE_AUTHORITY.md` and may proceed without another merge-only prompt when its conditions are satisfied.

An audit authorizes inspection, not mutation.

## Required report

For material work, report:

1. Goal
2. Reality
3. Risk I: premise
4. Lindy screen
5. L99 system view
6. Decision
7. Risk II: chosen plan
8. OODA action
9. Bill Gates bottleneck and leverage pass
10. Proof
11. Rollback
12. Next approval gate

The Control Room exists to preserve founder authority, not automate it out of existence because a workflow diagram became excited.
