# Founder Control Room Provider Guide

The Control Room uses providers as replaceable capabilities. Product authority, approvals, event history, and recovery remain owned by the Control Room.

## Claude / Claude Code

Best for long-context repository analysis, provider-interface work, structured implementation, and documentation. Must read `CLAUDE.md` and `GLOBAL_AI.md`. It may not infer unseen dashboard state or deployment success.

## Codex / ChatGPT

Best for debugging, code review, tests, repository operations, data analysis, and founder-readable decisions. Must read `AGENTS.md` and `GLOBAL_AI.md`. Tool proof is required for claimed writes.

## OpenAI Platform / Developers

OpenAI Platform is the server-side key and model layer behind replaceable adapters. OpenAI Developers, Agents SDK, and ChatGPT Apps are build surfaces that may create or adapt developer artifacts, but they do not become a second provider authority and model output is never approval or authorization.

Keep keys off clients, repositories, CRM records, logs, screenshots, and chat-visible documentation. Version model, prompt, tool schemas, safety behavior, and provenance. Creating or rotating a key remains a separate founder gate and must use a secure setup flow.

## Anthropic Platform

Server-side model capability behind replaceable adapters. Keep keys off clients. Conversation context is not durable Control Room memory. Validate outputs before writes or provider actions.

## Perplexity

Current public research and source discovery. It does not know private repository, Supabase, provider, or production state unless those sources were explicitly connected and inspected.

## GitHub

Current repository provider and evidence layer. Branches, commits, PRs, checks, merges, deployments, and runtime health are separate states. Preserve the `RepositoryProvider` boundary so GitHub can be replaced.

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
