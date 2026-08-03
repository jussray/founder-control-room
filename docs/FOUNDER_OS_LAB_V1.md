# Founder OS Lab V1

## Reality

The `juss-chief-ai` prompt contract is already merged into Founder Control Room under `.claude/skills/juss-chief-ai/SKILL.md`. It defines the constitutional routing behavior, but a prompt file is not an executable company runtime.

Founder Control Room also already contains proof-led publishing, a first-party social validator, a Buffer content firewall, Zapier bridge contracts, approval policy, evidence boundaries, and a sealed L0 Founder OS simulation. Rebuilding those systems would create duplicate authority and drift.

## Purpose

`src/founder-os-lab/` is the executable simulation model of the AI company. It converts a founder goal into a deterministic route through Chief AI, one specialist skill, one portable command lens, one provider-preview contract, capability previews, authority state, Red Team findings, L99 state, and an OODA plan.

The checked-in command registry contains:

```text
goalfix
ultrathink
truthmode
confess
redteam
lindymode
ooda
visualize
build
billgates
elonmusk
loop
```

`elonmusk` is a first-principles and product-simplification lens only. It does not simulate a person or transfer identity authority.

The provider-preview registry contains:

```text
ChatGPT
Claude
Codex
Perplexity
GitHub
Supabase
Cloudflare
Zapier
Figma
OpenAI Platform
HubSpot
```

Each provider descriptor declares supported preview actions, credential ownership, required evidence, and rollback. A registry entry is not proof that a provider is connected, authenticated, available, or authorized.

## Isolation contract

The core lab remains **L0 simulation only**.

It has:

- no provider client;
- no Buffer or Zapier invocation;
- no GitHub mutation;
- no Cloudflare call;
- no Gmail or HubSpot call;
- no Supabase query or write;
- no filesystem write;
- no environment-variable read;
- no secret access;
- no merge, deploy, publish, queue, or send authority.

The application exposes one founder-authenticated boundary:

```text
POST /founder-os/preview
```

That route:

- uses the existing founder session and service-role-only founder allowlist;
- accepts only checked-in actions, command IDs, provider IDs, bounded evidence, and optional social-validator input;
- invokes the deterministic sandbox in memory;
- sets `Cache-Control: no-store`;
- persists no plan, receipt, approval, or provider state;
- performs no provider call;
- never changes `executionAllowed: false`.

The authentication middleware may query only the existing `founder_users` allowlist. The lab runtime itself remains database-free. There is no browser surface in V1.

Even when a founder approval reference is supplied, the lab sets both plan and provider `executionAllowed: false`. Approval can make a plan eligible for a future external executor, but it cannot execute inside the lab or preview route.

## Approval and evidence are separate gates

Approval answers whether a separately governed executor may be considered. Evidence answers whether the exact provider/action state is sufficiently known to consider that executor.

For mutating previews, the provider contract declares concrete preflight fields such as:

```text
repository
commitSha
proofUrls
projectId
automationId
workspaceId
recordIds
associationPlan
```

The plan returns:

- `preflightEvidenceRequired`;
- `preflightEvidenceObserved`;
- `preflightEvidenceMissing`.

Presence alone is not validity. Provider-specific semantic checks also apply:

- GitHub and Codex proof must bind to the stated repository and exact commit SHA;
- Supabase and Cloudflare previews require project identity plus source-bound proof;
- Zapier previews require automation identity plus source-bound proof;
- HubSpot previews require workspace identity, record identifiers, and an association plan.

An approval reference never substitutes for missing, unrelated, or mismatched evidence. A mutating preview remains `blocked` until required evidence is both present and semantically bound to the selected provider target. Only then may an approved plan become `ready_for_external_executor`, while `executionAllowed` remains `false`.

Provider or destination receipts remain post-execution evidence. They are not fabricated or required as inputs to a preview.

## First vertical paths

```text
Founder goal
  -> juss-chief-ai
  -> portable command lens
  -> specialist skill
  -> provider preview contract
  -> no provider call
```

The social path also reuses the existing first-party social validator:

```text
Founder goal
  -> juss-chief-ai
  -> proof-led-publishing
  -> existing first-party social validator
  -> Buffer or Zapier handoff preview
  -> no provider call
```

A preview can prove that finished copy contains required proof and metadata while still refusing to queue or publish it.

## Test matrix

The focused tests prove:

1. the complete command and provider registry is present;
2. every command and provider remains non-executing;
3. every default action route selects a provider that supports the previewed action;
4. incompatible action/provider pairs fail closed;
5. an approval reference never enables provider execution;
6. approval without required provider evidence remains blocked;
7. GitHub proof for a different repository or SHA remains blocked;
8. HubSpot outreach lacks readiness without workspace, records, and association context;
9. complete, semantically bound provider evidence is required before executor readiness;
10. a valid social draft routes through `juss-chief-ai` and `proof-led-publishing`;
11. all side-effect flags remain false;
12. prompt leakage fails closed;
13. merge planning remains preview-only even with approval and evidence;
14. identical input produces identical output;
15. the HTTP route requires a founder session;
16. unknown or malformed request fields fail closed;
17. HTTPS proof references and exact commit SHAs are bounded;
18. malformed JSON returns `400 INVALID_JSON` before founder authentication;
19. the route touches no persistence surface beyond founder allowlist authentication.

The focused command runs:

```bash
npm run verify:juss-os-registry
```

The broader path-scoped workflow also runs:

```bash
node scripts/verify-founder-os-lab-isolation.mjs
npm run verify:ai-company-parity
npm run typecheck
```

The isolation verifier rejects provider clients, network calls, environment reads, database mutations, Express routes inside the lab tree, filesystem/network/child-process imports, and live social-adapter execution. The authenticated HTTP membrane lives outside `src/founder-os-lab/` and may only call the pure sandbox.

## Red Team

### Why this should exist

A broad autonomous runtime would compound authority mistakes faster than it compounds founder value. A pure lab plus one read-only preview boundary lets the organization model be tested as data before connecting tools.

### Primary failure modes

- treating a command alias as executable authority;
- treating a provider registry entry as proof of a live connection;
- treating an approval ID as proof that an action executed;
- treating approval as a substitute for exact-head or provider evidence;
- relabeling unrelated proof as evidence for another repository, commit, workspace, or provider;
- importing a live provider client into a preview adapter;
- treating successful content validation as a Buffer or platform receipt;
- expanding one preview route into a second orchestration system.

## Graduation gates

A capability may leave the lab only through a separate focused change that provides:

1. one named adapter and one target provider;
2. explicit read or write authority;
3. exact input and output schemas;
4. idempotency and replay behavior;
5. sanitized audit evidence;
6. failure and timeout classification;
7. rollback and revocation steps;
8. focused contract tests;
9. real-path evidence when user-facing behavior changes;
10. no success claim without a provider or destination receipt.

No approval carries forward from a preview. The first graduated adapter must remain narrower than a general autonomous executor.

## Rollback

Revert the registry, planner, preview route, server mount, focused tests, verifier-script edit, and this document. No provider, account, credential, database, post, email, deployment, or repository state outside the branch requires cleanup.
