# Founder Control Room Provider Guide

The Control Room uses providers as replaceable capabilities. Product authority, approvals, event history, and recovery remain owned by the Control Room.

## Claude / Claude Code

Best for long-context repository analysis, provider-interface work, structured implementation, and documentation. Must read `CLAUDE.md` and `GLOBAL_AI.md`. It may not infer unseen dashboard state or deployment success.

## Codex / ChatGPT

Best for debugging, code review, tests, repository operations, data analysis, and founder-readable decisions. Must read `AGENTS.md` and `GLOBAL_AI.md`. Tool proof is required for claimed writes.

## OpenAI Platform

Server-side model capability behind replaceable adapters. Keep keys off clients. Version model, prompt, tool schemas, safety behavior, and provenance. Model output is never approval or authorization.

## Anthropic Platform

Server-side model capability behind replaceable adapters. Keep keys off clients. Conversation context is not durable Control Room memory. Validate outputs before writes or provider actions.

## Perplexity

Current public research and source discovery. It does not know private repository, Supabase, provider, or production state unless those sources were explicitly connected and inspected.

## GitHub

Current repository provider and evidence layer. Branches, commits, PRs, checks, merges, deployments, and runtime health are separate states. Preserve the `RepositoryProvider` boundary so GitHub can be replaced.

## Supabase

Owns Control Room authentication and operational storage inside this project’s separate trust boundary. Service-role credentials stay server-side. Founder access requires session validation plus allowlist authorization.

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