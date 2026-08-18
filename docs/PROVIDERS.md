# Founder Control Room Provider Guide

The Control Room uses providers as replaceable capabilities. Product authority, approvals, event history, temporal truth, and recovery remain owned by the Control Room.

Provider-specific instructions may become stricter, but they do not replace the canonical product contract in `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`, repository authority in `GLOBAL_AI.md`, or the merge conditions in `docs/FOUNDER_MERGE_AUTHORITY.md`.

A provider fact may have been true and still be stale now. Present-tense provider claims require fresh readback at the consequential use boundary. Provider success, configuration, execution, and final outcome are separate states.

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

GitHub is the current repository provider and repository-evidence layer. Branches, commits, PRs, reviews, checks, mergeability, rulesets, merges, deployments, and runtime health are separate states. Preserve the `RepositoryProvider` boundary so GitHub can be replaced.

### FCR main ruleset readback

Current source policy for Founder Control Room `main` is fail-closed around provider ruleset mutation and readback:

- a requested FCR-main policy must satisfy the constitutional review floor before mutation;
- activation of independent-review requirements requires an eligible non-owner collaborator rather than creating an impossible owner-only merge lock;
- create/update success is configuration-write evidence only;
- the consuming GitHub ruleset must be read back after mutation;
- readback verifies protected refs, approving-review count, stale-review dismissal, last-push approval, thread resolution, strict required checks, force-push/deletion protection, bypass actors **and bypass mode**, and the caller's requested enforcement intent;
- unexpected provider drift fails closed rather than being flattened into a generic success.

Source hardening does not prove the live GitHub provider currently matches that desired policy. Live ruleset mutation remains a separately founder-authorized provider action and requires fresh provider readback before governance is called fixed.

Historical PRs whose source proof was bound to an older `main` remain provenance only after `main` moves. Reacquire the repair on current main rather than inheriting stale green.

## Cloudflare

Cloudflare is a deployment/runtime provider, not production authority by itself.

The current desired topology is maintained separately in `docs/CLOUDFLARE_REASONING.md` and issue #182. Native Worker Git Builds may provide build/version evidence while remaining non-promoting. Guarded GitHub manual Deploy remains the intended production-promotion authority. Provider readback outranks old workflow descriptions.

Do not infer production from a Pages preview, Worker build success, upload receipt, or an old `/version` observation.

## Supabase

Supabase owns Control Room authentication and operational storage inside this project’s separate trust boundary. Service-role credentials stay server-side. Founder access requires session validation plus allowlist authorization.

Database schema, migration state, RLS policy state, provider health, and application behavior remain separate proof lanes. A service-role-only internal table may intentionally be fail-closed to browser roles; do not add permissive RLS merely to silence an advisor without reviewing ownership and access intent.

## n8n

n8n is the durable multistep orchestration plane after FCR authority. It does not become founder approval, public-claim truth, or final provider outcome authority.

For founder-content distribution keep these states separate:

```text
contract-capable
-> runtime configured / allowlisted
-> adapter proven
-> provider outcome proven
```

The provider-neutral social contract may know how to form an authorized envelope for a destination before the live n8n instance has a configured adapter. Runtime readiness must therefore be redacted and read-only: never expose webhook URLs, bearer tokens, provider credentials, or raw invalid environment values simply to diagnose configuration.

FCR binds the exact approved content and authority before orchestration. n8n may route/schedule through bounded adapters but may not change approved copy, expand destination authority, self-declare `published=true`, or convert orchestration acceptance into final publication truth. Terminal success requires provider readback retained by FCR.

## Zapier

Zapier remains a bounded integration and SaaS-connector plane where it adds real value. It is not the canonical truth or publication authority layer and must not force every channel through a legacy workflow when a stronger first-party or n8n path exists.

Historical Zapier/Buffer budgeting and Day 3 workflows remain useful provenance, but they may not override the current first-party LinkedIn + provider-neutral n8n architecture.

## HubSpot

HubSpot is a relationship/CRM provider for audited founder-project records, review tasks, notes, contacts, companies, deals, and controlled revenue-operation data.

Read authority does not imply write authority. Current code includes a read-only founder-project registry/preflight for the audited account boundary. Sales pipeline/deal stage remains provider metadata, never authoritative project status. CRM mutation, outreach, quote publication, payment actions, customer exports, and external communication remain separately authorized actions.

Founder Signal Engine tasks and notes must be associated with the appropriate audited record rather than created as floating evidence. HubSpot OAuth remains provider-held; never copy access tokens, customer data, vendor intelligence, mailbox contents, payment details, or order data into Control Room storage.

A social publication grant must never silently authorize investor-related HubSpot mutation.

## Social providers

LinkedIn may use the stronger first-party Founder Control Room path when configured and proven. Facebook, Instagram, TikTok, Threads, X, YouTube Shorts, Pinterest, Bluesky, Mastodon, Google Business, and other supported destinations may use bounded n8n/direct adapters as implemented and verified.

A generated channel-native draft is not proof of provider capability. An adapter request is not proof of publication. Provider readback remains the terminal authority for external provider state.

## Required handoff between providers

Every handoff should state:

- verified input and source;
- exact repository/version or evidence identity when relevant;
- truth age or at-use revalidation requirement;
- requested decision or action;
- project and data boundary;
- approval state;
- expected output format;
- proof requirement;
- rollback or fallback;
- sensitive or sauce information intentionally excluded.

Convenience is not ownership. Providers may help operate the Control Room; they do not inherit the founder’s authority through proximity.
