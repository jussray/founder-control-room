# Founder Control Room Global AI Contract

## Parent operating contract

Before nontrivial work, read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md).
For Se’kret Bip acquisition, splash, preview, waiting-list, sponsorship, or social
launch work, also read [`Juss Private Operating Plan`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).
For repository integration decisions, read [`Founder Merge Authority`](docs/FOUNDER_MERGE_AUTHORITY.md).

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
- **Anthropic Platform** — replaceable server-side model capability behind adapters; model context is not durable memory.
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

1. Reality
2. Risk I: premise
3. L99 system view
4. Decision
5. Risk II: chosen plan
6. Action
7. Proof
8. Rollback
9. Next approval gate

The Control Room exists to preserve founder authority, not automate it out of existence because a workflow diagram became excited.
