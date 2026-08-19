# Founder Control Room Provider Guide

The Control Room uses providers as replaceable capabilities. Product authority, approvals, event history, and recovery remain owned by the Control Room.

Provider-specific instructions may become stricter, but they do not replace the canonical product contract in `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md` or the repository entry contract in `AGENTS.md`.

## Claude / Claude Code

Best for long-context repository analysis, provider-interface work, structured implementation, and documentation. Must read `CLAUDE.md` and `GLOBAL_AI.md`. For Founder Control Room + Chief AI master-build, full-app, architecture, production-readiness, or multi-surface work, also read the canonical master build spec plus `docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`. Product/UX work also follows the existing Product Design gate and parallel-build contract. It may not infer unseen dashboard state or deployment success.

## Codex / ChatGPT

Best for debugging, code review, tests, repository operations, data analysis, and founder-readable decisions. Must read `AGENTS.md`, `CHATGPT.md`, and `GLOBAL_AI.md`. For master-build work, the canonical master build spec remains the product/architecture source of truth. Tool proof is required for claimed writes.

## OpenAI Platform / Developers

OpenAI Platform is the server-side key and model layer behind replaceable adapters. OpenAI Developers, Agents SDK, and ChatGPT Apps are build surfaces that may create or adapt developer artifacts, but they do not become a second provider authority and model output is never approval or authorization.

Keep keys off clients, repositories, CRM records, logs, screenshots, and chat-visible documentation. Version model, prompt, tool schemas, safety behavior, and provenance. Creating or rotating a key remains a separate founder gate and must use a secure setup flow.

## Anthropic Platform

Server-side model capability behind replaceable adapters. Keep keys off clients. Conversation context is not durable Control Room memory. Validate outputs before writes or provider actions.

## Perplexity / Perplexity MCP

Best for current public research, source validation, adversarial verification, and implementation-ready evidence handoff. Must read `PERPLEXITY.md`. For Founder Control Room + Chief AI master-build, architecture, production-readiness, provider, research, or multi-surface work, also read the canonical master build spec plus `docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`.

Perplexity does not know private repository, Supabase, provider, or production state unless those sources were explicitly connected and inspected. Connected MCP capability may support bounded repository/provider actions only when the exact action is exposed and separately authorized. Before externally using factual claims, numbers, quotations, dates, or action guidance, apply `skills/fact-check-every-claim/SKILL.md`. Product Design research cannot substitute for inspected screenshots or exact-head browser evidence.

## GitHub

Current repository provider and evidence layer. Branches, commits, PRs, checks, merges, deployments, and runtime health are separate states. Preserve the `RepositoryProvider` boundary so GitHub can be replaced.

Repository supersession is governed by **obligations, not branch age or container similarity**. Provider compare plus PR readback supplies the inventory evidence for candidate work, but a matching file, cherry-picked commit, or stale branch is not closure proof. Before a superseded lane can be called safe to close, every provider-discovered unique commit/file and every required residue class must receive one explicit disposition, the replacement relation must be provider-read and acyclic, unresolved required residue/review findings must be zero, historical evidence must remain recoverable, and runtime-sensitive outcomes require proof bound to the current authoritative head. If a replacement chain later loses the obligation, the obligation becomes orphaned and must surface back into the active control plane.

The canonical `RepositoryProvider` deliberately exposes **no ambient branch-deletion capability**. This repository currently defines and verifies the supersession/retirement contract and deletion membrane; it does **not** claim that an automatic receipt-aware retirement reconciler is live. Branch deletion may be reintroduced only through a future reconciler that validates the full obligation receipt before provider mutation.

Production GitHub authentication should prefer short-lived installation credentials from an FCR-owned GitHub App configured with `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`; `GITHUB_TOKEN` remains a bounded local/development fallback. Install the App only on `jussray/founder-control-room` unless a broader repository scope is separately reviewed and proven.

For an active ruleset protecting `jussray/founder-control-room` `main`, repository identity is constitutional and mutable project slugs are not. The ruleset must preserve the FCR approval/check/force-push/deletion floor, and its bypass list must contain exactly one App actor whose numeric ID equals trusted `GITHUB_APP_ID`. Caller-supplied, missing, mismatched, or additional bypass integration IDs fail closed. Provider readback must still prove the observed ruleset matches the requested policy; source validation alone is not live GitHub authority.

The signed GitHub webhook surface uses `GITHUB_WEBHOOK_SECRET` to verify `X-Hub-Signature-256` before accepting provider events. Private keys and webhook secrets never belong in source, PR bodies, issue comments, logs, screenshots, browser bundles, or chat-visible documentation.

## Supabase

Owns Control Room authentication and operational storage inside this project’s separate trust boundary. Service-role credentials stay server-side. Founder access requires session validation plus allowlist authorization.

## HubSpot

CRM proof, deal-associated review tasks, notes, tickets, contacts, companies, and controlled revenue-operation records. Read authority does not imply write authority. Every CRM mutation requires the provider confirmation gate, and outreach, quote publication, payment actions, customer exports, or external communication remain separately authorized actions.

Founder Signal Engine tasks and notes must be associated with the `Founder Signal Engine` deal rather than created as floating records. HubSpot OAuth remains provider-held; never copy access tokens, customer data, vendor intelligence, mailbox contents, payment details, or order data into Control Room storage.

## Required handoff between providers

Every handoff should state:

- verified input and source;
- requested decision or action;
- project and data boundary;
- approval state;
- expected output format;
- proof requirement;
- rollback or fallback;
- sensitive information intentionally excluded.

Convenience is not ownership. Providers may help operate the Control Room; they do not inherit the founder’s authority through proximity.
