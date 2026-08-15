# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

Founder Control Room is a provider-independent founder operating plane for governed repository work, approvals, evidence, release control, production verification, rollback, and cross-project decision support.

It manages Se'kret Bip and related founder systems without making GitHub, Cloudflare, Supabase, or any other provider the product constitution.

## Current repository truth

**Last refreshed:** 2026-08-15  
**Current `main` at this audit:** `eebdfb718a24fc04b574d28611a62b6041f1d4e6`

Current `main` includes:

- provider-independent repository abstractions and guarded exact-head execution;
- founder approval and reservation boundaries;
- deterministic Cloudflare reasoning;
- MCP capability discovery/policy boundaries;
- constitutional project skill routing;
- Founder OS / Chief AI coordination contracts;
- freshness-aware federated truth receipts surfaced into founder decisions;
- desktop/mobile Playwright proof for current truth-receipt UI behavior; and
- bounded production Worker reconciliation that does not silently inherit database mutation authority.

Repository configuration, a green CI badge, provider upload, or HTTP success does not by itself prove production truth.

## Current production gate

The newest founder-approved Worker reconciliation on exact current main is GitHub Actions run `31864568036`.

Verified execution:

1. exact approved commit checkout succeeded;
2. production authority and current-main verification succeeded;
3. the production configuration validation step failed;
4. downstream Worker reconciliation and runtime proof were skipped.

Issue #182 records that the GitHub `production` environment supplied an **empty `CLOUDFLARE_API_TOKEN`** to the guarded Worker reconcile. Therefore:

- no Worker deployment executed;
- no Supabase database mutation executed;
- runtime `/health` / `/version` release proof did not run; and
- the guarded production lane remains blocked until the existing production-environment token binding is reconciled.

Do not bypass that gate, create a second production deploy path, or resurrect the retired `founder-control-room2` Worker.

The intended production topology remains:

```text
foundercontrolroom.org
  -> Cloudflare Pages project: founder-control-room

api.foundercontrolroom.org
  -> single canonical Worker: founder-control-room
```

The obsolete `founder-control-room2` identity must not be recreated.

## State → Evidence → Claim

Founder Control Room treats completion as an evidence-bearing state.

For any material claim, identify:

1. **State** — what actually changed;
2. **Evidence** — what proves it;
3. **Authority** — which system or actor produced that evidence; and
4. **Claim coverage** — which boundaries the evidence proves and which remain unknown.

Keep repository, CI, provider, database, browser, device, account, and runtime witnesses separate.

`VERIFIED`, `INFERRED`, `UNKNOWN`, and `BLOCKED` are not interchangeable labels.

## Why this exists

GitHub is a host and workflow platform built on Git. Cloudflare is a deployment/runtime provider. Supabase is a database/auth provider. None of them should silently become the founder's control constitution.

Founder Control Room keeps the useful properties:

- versioned source;
- exact refs;
- diffs and review;
- CI evidence;
- approval boundaries;
- rollback;
- audit trails;
- provider read-back; and
- founder-ready truth receipts.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture.

## AI operating contracts

- [`GLOBAL_AI.md`](GLOBAL_AI.md) — provider-neutral founder contract
- [`AGENTS.md`](AGENTS.md) — repository entry contract
- [`CHATGPT.md`](CHATGPT.md) — ChatGPT operating contract
- [`CLAUDE.md`](CLAUDE.md) — Claude / Claude Code overlay
- [`PERPLEXITY.md`](PERPLEXITY.md) — Perplexity overlay
- [`docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`](docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md) — canonical product/architecture contract
- [`docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`](docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md) — UX/product parallel-build contract
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — provider handoffs
- [`docs/CLOUDFLARE_REASONING.md`](docs/CLOUDFLARE_REASONING.md) — Cloudflare OODA/L99 recovery contract
- [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md) — standing evidence-based repository integration authority

Provider overlays may become stricter, but they do not become competing constitutions or expand their own authority.

## Current capability layers

### Repository and mission control

Founder Control Room can model projects, proposals, missions, verification runs, exact refs, and approval state while keeping repository-provider concerns behind an interface.

### Guarded terminal

The terminal executes only registered commands against an exact verified checkout. It does not accept arbitrary shell strings, caller-supplied executables, redirections, pipes, or unreviewed environment mutation.

A terminal run is verification evidence only for the scope that actually executed.

### Cloudflare reasoning

Read-only reasoning is exposed through the provider reasoning contract:

```text
:cloudflare reason <project>
```

```http
GET  /cloudflare/contract
POST /cloudflare/:slug/reason
```

It can assess desired commit, Worker/Pages evidence, release markers, health, credential failures, evidence freshness, and deployment authority.

Reasoning does not grant production mutation authority.

### MCP and capability governance

The repository contains bounded capability declarations and policies for supported tool/provider slots. Repository declarations are intent/configuration, not proof that a live external integration is installed, authenticated, healthy, or authorized for mutation.

### Constitutional skill routing

Project skills are selected under repository authority, privacy, proof, runtime-discovery, commercial, provider, messaging, and mutation constraints. A skill cannot expand its own authority ceiling.

### Federated truth receipts

Current `main` can assess freshness-aware repository truth receipts and surface bounded founder recommendations in the Control Room UI.

The current browser proof covers desktop and mobile rendering for the scoped truth-receipt behavior. It is not a claim that every upstream provider or production surface is healthy.

## Production deployment authority

Production does **not** deploy merely because `main` moved.

The canonical production path is approval-bound and exact-head gated. Depending on the maintenance scope, the repository uses the full guarded deployment lane or a narrower Worker-only reconciliation lane. Narrow maintenance lanes must not silently inherit unrelated Supabase/database mutation authority.

Production release evidence remains incomplete until the applicable lane proves:

- exact approved current-main SHA;
- required production configuration;
- provider mutation success for the authorized scope;
- migration ledger evidence when database mutation is actually authorized;
- canonical Worker identity;
- `/health`;
- `/version.gitSha` matching the approved SHA;
- public-safe guardrails; and
- required runtime/browser proof.

The current blocker is configuration/credential binding in the GitHub `production` environment, not evidence that another Worker or deployment architecture should be invented.

## Data boundary

Founder Control Room uses its **own** Supabase project, separate from Se'kret Bip's database, trust boundary, and service-role credentials.

The Control Room consumes curated operational evidence. It must not become a broad back door into Se'kret Bip private user data.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Public-safe configuration may live in `.env.example`; secret values do not belong in source, logs, retained artifacts, or browser bundles.

## Founder authentication

Founder-only routes require verified session/auth state plus the founder allowlist. The browser UI and API remain separate from arbitrary shell execution.

## Guarded founder terminal

The terminal is enabled only when the repository/environment policy permits it and all applicable checks pass, including:

- founder authentication;
- allowed origin/loopback constraints;
- reviewed workspace root;
- registered command ID;
- exact mission/repository commit;
- checkout HEAD equality; and
- allowed risk for the current mission state.

Approved branch/merge actions use reservation/idempotency controls before provider mutation so ambiguous provider success cannot be silently replayed.

## Authority model

| Action | Authority |
|---|---|
| Read project/evidence | Founder-authenticated or explicitly public-safe read |
| Run bounded verification | Applicable founder/repository authority |
| Create branch | Separate repository write authority |
| Merge focused repository repair | Standing evidence-based merge authority only when exact-head gates are satisfied |
| Deploy / mutate production | Separate exact production authority |
| Database migration | Separate migration/database authority |
| Credentials/secrets | Separate credential authority |
| Publication / billing / destructive action | Separate exact authority |
| Rollback | Separate rollback authority |

No approval silently carries forward to another authority class.

## Documentation rule

Current `main`, executable implementation, exact-head verification, and provider/runtime receipts outrank stale Markdown.

Markdown should be repaired when it materially drifts from verified truth. Do **not** modify implementation merely to make stale prose true. Historical documents may remain historical as long as they are not presented as current authority.

## License

Copyright © 2024–2026 Juss Ray. All rights reserved. Proprietary software — see [LICENSE](LICENSE).
