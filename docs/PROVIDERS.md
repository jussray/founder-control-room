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

The remote read-only MCP tool `github_audit_pr` uses `src/providers/GitHubPrTruthReader.ts` only as an observation adapter over the current `RepositoryProvider` boundary. It must read PR/base/head/check/review/diff state without direct provider credentials, bind sanitized candidate and evidence fingerprints to a short-lived non-authorizing `external-read` continuity cookie, keep provider collection completeness `not_proven`, and never approve, merge, comment, dispatch, deploy, publish, or mutate GitHub. The continuity cookie is semantic evidence lineage, not a browser/session cookie and not an authority grant.

Repository supersession is governed by **obligations, not branch age or container similarity**. Provider compare plus PR readback supplies the inventory evidence for candidate work, but a matching file, cherry-picked commit, or stale branch is not closure proof. Before a superseded lane can be called safe to close, every provider-discovered unique commit/file and every required residue class must receive one explicit disposition, the replacement relation must be provider-read and acyclic, unresolved required residue/review findings must be zero, historical evidence must remain recoverable, and runtime-sensitive outcomes require proof bound to the current authoritative head. If a replacement chain later loses the obligation, the obligation becomes orphaned and must surface back into the active control plane.

The canonical `RepositoryProvider` deliberately exposes **no ambient branch-deletion capability**. This repository currently defines and verifies the supersession/retirement contract and deletion membrane; it does **not** claim that an automatic receipt-aware retirement reconciler is live. Branch deletion may be reintroduced only through a future reconciler that validates the full obligation receipt before provider mutation.

Production GitHub authentication should prefer short-lived installation credentials from an FCR-owned GitHub App configured with `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`; `GITHUB_TOKEN` remains a bounded local/development fallback. The release-coverage witness uses the same App-aware, repository-scoped construction path. If either App variable is set without the other, construction fails closed instead of silently degrading to a fallback token. Install the App only on `jussray/founder-control-room` unless a broader repository scope is separately reviewed and proven.

Deterministic independent-review witness publication is stricter than ordinary repository access. `src/providers/providerFactory.ts` may expose `publishDeterministicReviewWitness(...)` for Founder Control Room only when `GITHUB_APP_ID` plus `GITHUB_PRIVATE_KEY` minted the repository-scoped installation token; a PAT-only or local `GITHUB_TOKEN` construction must fail closed for this capability. `src/providers/DeterministicReviewGitHubProvider.ts` may create only the exact success Check Run derived from the full review hash and exact reviewed head, and its normal runtime witness writer must remain pinned to `https://api.github.com`; a custom `GITHUB_API_BASE_URL` may exercise witness publication only through an explicitly injected test transport. `src/review/deterministicReviewWitnessPublisher.ts` must accept success only after provider readback reports the same exact-head check from the server-owned App id. The concrete witness writer, GitHub App credential minting, security-preserving provider inheritance, provider readback, provider factory/interface, deterministic producer/publisher, independent-review gate, and merge consumer form one trust chain; changes to that chain must not self-certify through the same deterministic producer. Receipt creation and Check Run publication remain proposal/evidence operations and never mint founder-final, merge, deployment, secret, provider-policy, database, billing, publication, or destructive-action authority.

For an **existing non-FCR named GitHub ruleset**, `src/providers/SecurityPreservingGitHubProvider.ts` fails closed instead of reconstructing and PUT-updating provider state from an earlier read until a separately reviewed concurrency-safe reconciliation contract exists. It may diagnose only locally provable requested-ref exclusions: exact normalized ref equality and the `~ALL` sentinel. It must not invent wildcard, character-class, or `~DEFAULT_BRANCH` semantics locally. A non-empty bypass replacement remains fail-closed. When the named non-FCR ruleset does not exist, the direct create-only provider path may create it from the requested configuration; Founder Control Room's constitutional ruleset remains delegated to the canonical provider path. This is source-side safety logic, not proof that any live provider ruleset currently has the intended topology.

For active governance protecting `jussray/founder-control-room` `main`, repository identity is constitutional and mutable project slugs are not. One founder policy request is translated into **two aggregated GitHub rulesets**. The review membrane owns pull-request requirement, approving-review freshness, last-push approval, review-thread resolution, force-push protection, and deletion protection; it contains exactly one App actor whose numeric ID equals trusted `GITHUB_APP_ID`, and that bypass is constrained to GitHub `pull_request` mode. The strict-freshness companion owns the exact required status checks with `strict_required_status_checks_policy: true`, targets the same protected refs, contains zero bypass actors, and contains no pull-request or other rule types. The provider applies and reads back the no-bypass freshness membrane before changing the review membrane, so a partial active reconciliation cannot weaken the old membrane. A successful provider result receipts **both** ruleset component identities. If the later review write fails before GitHub returns a provider identity, the error retains the already-verified freshness ruleset name and ID. If the review write succeeds but its hardened readback then fails, the error retains **both** mutated ruleset identities for reconciliation. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.

The canonical FCR ruleset cannot be disabled, demoted to evaluate mode, or retargeted away from `main` through the generic repository-administration route. A live provider rollback therefore means a separately authorized restoration to a previously proven **active** safe topology, with readback of both component identities; it does not mean turning governance off.

Canonical founder-final integration must use the provider-backed reviewed PR number plus the exact reviewed head SHA through the pull-request merge endpoint; the App is not granted an `always` bypass for direct protected-branch writes. FCR still re-resolves reviewed base and head immediately before the provider sink. If the base moves after that last local read, the no-bypass strict-freshness ruleset is the provider-side invariant that must invalidate mergeability until the candidate is current and its checks rerun. A provider merge rejection is terminal for that attempt and must never fall back to generic direct protected-branch integration. Source validation and unit mocks are not live GitHub authority; the final claim still requires an authorized provider mutation plus authoritative readback and a controlled stale-base proof.

This preserves separate membranes instead of weakening either one: ordinary GitHub merges remain subject to native independent-review policy and the no-bypass current-base/status floor, while the authenticated FCR founder-final path may cross only the review membrane through the trusted App, only through a reviewed pull request, and only after FCR has revalidated the exact base/head authority it already bound internally.

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
