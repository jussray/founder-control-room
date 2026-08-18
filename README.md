# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

Founder Control Room is a provider-independent founder operating plane for governed repository work, approvals, evidence, capability control, release control, production verification, rollback, founder-content distribution, and cross-project decision support.

It manages Se'kret Bip and related founder systems without making GitHub, Cloudflare, Supabase, n8n, Zapier, HubSpot, or any other provider the product constitution.

## Current repository truth

**Current identity is resolved at use time.** Do not treat a hard-coded SHA in durable prose as permanently current.

For a present-tense repository claim:

1. resolve the current `main` SHA from GitHub;
2. bind the relevant evidence to that exact SHA;
3. distinguish repository, CI, provider, deployment, runtime, browser, account, and human-outcome truth;
4. apply the applicable temporal gate or Truth Lease when the claim can decay; and
5. mark older exact-SHA evidence as historical rather than promoting it back to current authority.

Exact SHAs still belong in PRs, receipts, artifacts, incident records, and historical provenance. They do not belong in this README as an automatically renewable statement of “current main.”

Current implementation includes:

- provider-independent repository abstractions and guarded exact-head execution;
- founder approval and reservation boundaries;
- deterministic Cloudflare reasoning and exact-deployed-SHA browser witness contracts;
- canonical capability governance through `.control/capability.json`;
- constitutional project skill routing;
- Founder OS / Chief AI coordination contracts;
- freshness-aware federated truth receipts surfaced into founder decisions;
- a bounded Truth Lease contract for facts that can decay, with domain-specific temporal publication protection already stronger on the founder-content path;
- a durable founder-only **Founder Switchboard** with explicit BUILT / CONFIGURED / ACTIVE / PROVEN states, desired-state overrides, stale-head detection, atomic audit receipts, an enforced privileged-execution kill switch, observe-only provider intent, and locked-off high-consequence gates;
- a privacy-safe public skill-testing evidence loop with `/devil` v1 round registry, structured receipts, KPI calculations, aggregate field reporting, and focused tests;
- first-party LinkedIn founder-content execution capability with exact Current You authority, temporal claim revalidation, one-shot execution reservation, provider write/readback semantics, and retained outcome boundaries;
- provider-neutral n8n founder-content orchestration contracts that keep contract capability, runtime allowlisting, adapter proof, and provider outcome proof separate;
- bounded Zapier/Buffer integration paths where they still add connector, scheduling, or fallback value without becoming publication authority;
- a read-only HubSpot founder-project registry/preflight that keeps sales metadata separate from project truth and CRM mutation authority;
- desktop/mobile Playwright proof for scoped truth-receipt, Content Manager, FutureYou, and Switchboard behavior; and
- bounded production Worker reconciliation that does not silently inherit database mutation authority.

Repository configuration, a green CI badge, provider upload, scheduler acceptance, or HTTP success does not by itself prove production or publication truth.

## Documentation truth gate

README files, current-state docs, PR bodies, issues, and AI operating prompts can affect future decisions. They are therefore part of the truth surface.

For truth-sensitive architecture, authority, publishing, provider, capability, workflow, deployment, or launch changes:

```text
change the truth
-> refresh README + applicable current-state docs in the same bounded PR
-> run Documentation Truth on the exact PR head
-> merge only with normal repository proof
-> run Documentation Truth again on merged main
-> re-observe provider/runtime facts before reusing present-tense claims
```

Historical material stays available as provenance. When it no longer describes current authority, label it `HISTORICAL`, `SUPERSEDED`, `REVALIDATION_REQUIRED`, or otherwise point to the current authority instead of deleting the record or letting it compete silently with current truth.

The documentation verifier emits sanitized coverage/state evidence only. It does not expose credentials, private proof, raw diffs, private prompts, customer data, or provider payloads, and analytics may observe but never authorize or renew truth.

## Capability authority

`.control/capability.json` is the **canonical capability authority** for repository capability declarations and current capability verification.

`.control/capability.yaml` is retained only as a **compatibility pointer** for older tooling or historical references. It must not become a second editable source of capability truth, and a future agent must not reconcile disagreement by choosing whichever file is more convenient.

Capability source declaration is still not runtime proof. Keep these layers separate:

```text
canonical capability declaration
-> repository verifier proof
-> configured provider/tool state
-> active execution capability
-> observed outcome proof
```

If capability authority changes again, update the canonical schema/verifier and this current-state documentation in the same bounded change instead of letting JSON/YAML drift reappear.

## Production authority and current provider topology

Production does **not** deploy merely because `main` moved or because a native provider build succeeded.

The durable intended topology is:

```text
foundercontrolroom.org
  -> Cloudflare Pages project: founder-control-room

api.foundercontrolroom.org
  -> canonical Worker: founder-control-room

Cloudflare Worker Git Builds
  -> connected build/version evidence lane
  -> non-promoting

GitHub guarded manual Deploy
  -> sole production-promotion authority
```

The retired `founder-control-room2` identity must remain absent and must not be recreated without a new explicit founder decision that supersedes the current topology.

Provider facts are intentionally **not frozen into this README as permanent current state**. Before a production claim or mutation, re-read the authoritative Cloudflare evidence and issue #182, verify the then-current provider configuration, and require the applicable exact-main deploy/runtime proof.

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

### Historical production provenance

An earlier founder-approved Worker reconciliation attempt, GitHub Actions run `31864568036`, was executed against exact then-current `main@eebdfb718a24fc04b574d28611a62b6041f1d4e6`.

At that historical boundary:

1. exact approved commit checkout succeeded;
2. production authority and current-main verification succeeded for that run;
3. production configuration validation failed;
4. downstream Worker reconciliation and runtime proof were skipped; and
5. no successful deployment or runtime receipt was produced by that attempt.

Those facts remain useful provenance. They are not a current production-health claim.

## Founder-owned progress publishing

The product goal is deliberate: **Founder Control Room should be able to tell verified progress about the founder's own products from the founder's own product without giving away the private recipe.**

Current architecture separates story, authority, transport, and outcome:

```text
verified project/product evidence
-> Chief proposes platform-native public-safe story
-> Sauce Guard keeps private machinery private
-> temporal truth revalidation
-> exact Current You authority for the executable path
-> channel router
   -> first-party LinkedIn where configured/proven
   -> provider-neutral n8n orchestration for bounded social adapters
   -> Zapier / Buffer where they still add bounded value
-> provider readback
-> Founder Control Room receipt
-> observation-only analytics
```

The shared campaign model supports LinkedIn, Facebook, Instagram, Threads, X, TikTok, YouTube Shorts, Pinterest, Bluesky, Mastodon, and Google Business drafts. Draft support is not live-adapter proof.

Keep these states separate per channel:

```text
contract-capable
-> configured / allowlisted
-> adapter-proven
-> provider-outcome-proven
```

Public-safe progress can explain what changed, what was learned, why it matters, and approved public proof. Private prompts, raw diffs, credentials, security-sensitive implementation, customer data, unreleased roadmap, private metrics, and proprietary mechanics stay behind Sauce Guard.

Investor email remains a separate authority class. It must never auto-send without the applicable standing policy **and recipient-specific qualification**.

## State → Evidence → Claim

Founder Control Room treats completion as an evidence-bearing state.

For any material claim, identify:

1. **State** — what actually changed;
2. **Evidence** — what proves it;
3. **Authority** — which system or actor produced that evidence; and
4. **Claim coverage** — which boundaries the evidence proves and which remain unknown.

Keep repository, CI, provider, database, browser, device, account, publication, and runtime witnesses separate.

`VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, `STALE`, `SUPERSEDED`, and `HISTORICAL` are not interchangeable labels.

## Founder Switchboard

The Founder Switchboard is the current visual control surface for audited portfolio capabilities.

It deliberately separates four questions that are often collapsed into one misleading “green” state:

```text
BUILT -> CONFIGURED -> ACTIVE -> PROVEN
```

A capability can exist in source without being configured, configured without being active, or active without having enough evidence to call it proven.

Switchboard controls are authority-aware:

- **enforced** controls can have a real server-side effect inside their already-granted authority, including the privileged-execution master kill switch;
- **observe-only** controls record desired/provider intent without pretending the repository can mutate an external provider;
- **locked-off** controls keep high-consequence actions outside the active authority membrane until code/evidence changes the lock through review.

Desired-state changes produce durable audit receipts. Stale-head detection prevents an old repository audit from being presented as current capability truth.

The Switchboard does not create new deployment, database, credential, billing, publication, destructive-action, or rollback authority.

## Why this exists

GitHub is a host and workflow platform built on Git. Cloudflare is a deployment/runtime provider. Supabase is a database/auth provider. n8n and Zapier are orchestration providers. HubSpot is a relationship/CRM provider. None of them should silently become the founder's control constitution.

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
- [`docs/TRUTH_DECAY_AUDIT.md`](docs/TRUTH_DECAY_AUDIT.md) — truth aging / future-you-me failure contract
- [`docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`](docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md) — public communication, Sauce Guard, and publication truth boundary

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

The canonical capability declaration is `.control/capability.json`. The repository uses schema/verifier proof to decide whether that declaration is internally valid. Live tool/provider installation, authentication, health, and mutation authority remain separate runtime facts.

The legacy `.control/capability.yaml` compatibility pointer must not be treated as a second source of authority.

### Constitutional skill routing

Project skills are selected under repository authority, privacy, proof, runtime-discovery, commercial, provider, messaging, and mutation constraints. A skill cannot expand its own authority ceiling.

### Federated truth receipts

The implementation can assess freshness-aware repository truth receipts and surface bounded founder recommendations in the Control Room UI.

Browser proof for a scoped truth-receipt behavior is not a claim that every upstream provider or production surface is healthy.

### Public skill-testing evidence loop

The repository contains an instrumented, privacy-safe field-testing loop for public skills. The first registered round is `/devil` v1 and includes:

- a structured public-safe receipt model;
- a named round registry bound to the skill/version under test;
- KPI calculations for valid-test submission rate, iteration yield, and repeat testers;
- aggregate reporting that does not expose raw submission content; and
- focused tests for analytics and reporting behavior.

This proves the repository instrumentation exists. It does **not** by itself prove that a public campaign has run, that testers submitted data, that distribution occurred, or that a new skill version earned promotion.

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
| Publication | Exact current publication authority + provider readback; standing eligibility alone is not execution |
| Investor email | Applicable standing policy + recipient-specific qualification + send authority |
| Billing / destructive action | Separate exact authority |
| Rollback | Separate rollback authority |

No approval silently carries forward to another authority class.

## Documentation rule

Current `main`, executable implementation, exact-head verification, current founder intent, and provider/runtime receipts outrank stale Markdown.

Markdown must be repaired when it materially drifts from verified truth. Do **not** modify implementation merely to make stale prose true. Historical documents may remain historical as long as they are not presented as current authority.

The `Documentation Truth` workflow makes this rule executable for truth-sensitive changes and rechecks the merged transition on `main`.

## License

Copyright © 2024–2026 Juss Ray. All rights reserved. Proprietary software — see [LICENSE](LICENSE).