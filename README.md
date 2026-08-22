# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

Founder Control Room is a provider-independent founder operating plane for governed repository work, approvals, evidence, capability control, release control, production verification, rollback, founder-content distribution, and cross-project decision support.

It manages Se'kret Bip and related founder systems without making GitHub, Cloudflare, Supabase, n8n, Zapier, HubSpot, or another provider the product constitution.

## Current repository truth

**Current identity is resolved at use time only by a separately authorized live-provider revalidation.** A hard-coded SHA, date, PR body, issue comment, screenshot, provider result, or received webhook is historical evidence once the underlying state moves. A stored GitHub branch-head event is explicitly a last-observed source fact, not current-main proof.

For a present-tense repository claim:

1. resolve current `main` from GitHub;
2. bind repository evidence to that exact SHA;
3. distinguish repository, CI, provider, deployment, runtime, browser, account, publication, analytics, and human-outcome truth;
4. apply the applicable temporal gate or Truth Lease when the claim can decay; and
5. preserve older exact-version evidence as historical or superseded instead of silently promoting it back into current authority.

Exact SHAs belong in PRs, retained receipts, artifacts, incident records, and historical provenance. They do not automatically renew themselves as current truth after another merge.

Current implementation includes:

- provider-independent repository abstractions and guarded exact-head execution;
- an obligation-aware work supersession contract in which stale/similar branches are only candidates, provider inventory and required residue must be fully and singly accounted, replacement provenance must remain explicit and acyclic, runtime-sensitive closure proof must be current-head-bound, and historical evidence remains recoverable;
- a canonical repository-provider deletion membrane: ambient `deleteBranch()` authority is intentionally absent until a future obligation-aware receipt reconciler exists and proves safe retirement before provider mutation;
- founder proof, idempotency/reservation, and rollback boundaries;
- an FCR-specific provider-grounded independent-review membrane before in-app provider integration;
- a canonical FCR founder-final merge policy that keeps deterministic independent review load-bearing, binds authenticated founder approval to the exact PR/base/head, and preserves the older server-owned semantic-review policy only for already-pinned compatibility paths;
- canonical capability governance through `.control/capability.json`;
- deterministic Cloudflare reasoning, request-trace/source contracts, and founder-gated Access recovery tooling whose source existence does not itself prove live provider configuration;
- a read-only Cloudflare hostname-inventory witness that discovers the reviewed zone's HTTP-relevant DNS names, classifies inventory/proxy drift, and simulates Request Trace per eligible proxied hostname without granting provider-mutation authority or persisting DNS targets/origin IPs;
- a secret-free exact-head Cloudflare bridge authority contract that is load-bearing inside CI / `Required Gate`, while live Cloudflare and GitHub provider state remain separate authority facts;
- a repository-owned Worker build authority membrane that binds native Workers Builds to the checked-out source SHA, permits only non-promoting native version uploads, and reserves production promotion for exact manual GitHub release authority without claiming live provider configuration;
- freshness-aware federated truth receipts and a bounded Truth Lease contract for claims that can decay;
- evidence-dependent consequential portfolio execution that binds founder authorization to the exact approved decision context and Truth Lease, then re-observes the lease dependencies at the declared use boundary so changed, stale, missing, or invalidated truth forces reconfirmation instead of execution;
- a production-specific Truth Lease composer that can bind one exact repository head to matching Cloudflare Worker/Pages runtime identity, Supabase production-state evidence, exact-runtime Playwright proof, and exact-head independent review, while failing closed when any required dependency is changed, stale, missing, or mismatched at use time;
- a typed [release-identity / rollout-coverage contract](docs/RELEASE_IDENTITY_AND_COVERAGE.md) that keeps binary version identity separate from privacy-safe aggregate traffic observation, with predeclared thresholds and no merge, deploy, or authorization effect;
- a project-bound, independently witnessed rollout-coverage ingress that accepts only Cloudflare aggregate `passed` observations, rejects self-attested/control-plane claims, wrong deployment targets, stale/out-of-order evidence, and expired coverage windows, and withholds current coverage until a read-through GitHub main revalidation supplies the matching identity;
- a durable founder-only **Founder Switchboard** with explicit BUILT / CONFIGURED / ACTIVE / PROVEN states and guarded authority modes;
- a privacy-safe public skill-testing evidence loop with `/devil` v1 structured receipts and aggregate analytics;
- first-party LinkedIn founder-content execution with exact Current You authority, FCR-owned one-shot approval storage/claim, temporal revalidation, and provider readback requirements;
- provider-neutral n8n founder-content orchestration contracts that keep contract capability separate from runtime configuration and final provider outcome;
- provider-neutral founder-content contracts under `tools/founder-content-contracts/`, with core approval storage, first-party execution, and temporal revalidation importing the canonical provider-neutral authorization contract directly while `tools/zapier/` remains a compatibility export surface for bounded connector and scheduling callers;
- founder-authenticated n8n stage-conveyor readiness that can read the existing sanitized receipt ledger and call the enabled runtime live-verified only when a retained accepted activation-probe receipt matches the deployed exact `GIT_SHA`, while stale-head, missing-runtime-SHA, missing-proof, and readback failures remain visibly unverified without exposing webhook/token values;
- founder-authenticated n8n/Buffer founder-content activation readiness that exposes configuration presence and provider allowlist state without returning webhook/token values or promoting configuration into publication proof;
- founder-authenticated n8n/Buffer activation readiness that exposes configuration presence and provider allowlist state without returning webhook/token values, and promotes the canonical conveyor to `enabled-live-verified` only when a retained activation-probe receipt matches the deployed exact `GIT_SHA`; stale, missing, or unreadable proof remains non-live and fail-closed;
- bounded Zapier/Buffer integration where it still adds connector, scheduling, or fallback value without becoming publication authority;
- HubSpot integration boundaries that keep CRM metadata and external communication separate from repository truth and founder authority;
- desktop/mobile Playwright proof for scoped Control Room behavior; and
- bounded production/recovery workflows that do not silently inherit unrelated database, credential, publication, or provider-mutation authority.

Repository configuration, a green CI badge, a merge, a provider upload, a scheduler acceptance, or HTTP success does not by itself prove production or publication truth.

## Documentation truth gate

README files, current-state docs, PR descriptions, issues, AI operating contracts, and runbooks can affect future decisions. They are therefore part of the truth surface, not harmless commentary.

For truth-sensitive architecture, authority, provider, publishing, capability, workflow, or launch changes:

```text
change the operational truth
-> refresh README + applicable current-state docs in the same bounded PR
-> run Documentation Truth on the exact PR head
-> require Documentation Truth inside CI / Required Gate
-> merge only when the normal authority membrane is satisfied
-> run Documentation Truth again on the merged main transition
-> re-observe provider/runtime facts before reusing present-tense claims
```

Default-suite test discovery has a bounded evidence claim: a baseline entry means the file is excluded from the default `npm test` suite, not that it never ran in every CI workflow. The base-bound ratchet cannot accept newly excluded candidate tests and requires stale debt entries to be removed.

Historical material stays available as provenance. When it no longer describes current authority, mark it `HISTORICAL`, `SUPERSEDED`, `STALE`, `REVALIDATION_REQUIRED`, or point it to the current authority instead of deleting the record or letting it compete silently with fresh truth.

The verifier emits sanitized counts, domains, coverage, and failure reasons only. A truth-sensitive change must also update a structured documentation receipt that names each changed source path and a meaningful, path-bound invariant; punctuation-only, hidden-comment, whitespace-only, or pathless receipt touches cannot satisfy the gate. This establishes traceability and materiality, not independent semantic or live-provider proof, so human/security review remains required. The verifier does not store credentials, raw private evidence, raw diffs, private prompts, customer data, private metrics, or provider payloads. Analytics may observe documentation drift but never authorize, renew, or rewrite objective truth.

A docs-only truth-sync merge closes an existing drift cycle. Its post-merge receipt closes the transition without forcing another documentation edit merely because the merge commit SHA changed.

## Capability authority

`.control/capability.json` is the **canonical capability authority** for repository capability declarations.

`.control/capability.yaml` is a non-authoritative compatibility pointer. It intentionally carries no independent capability, health, deploy, rollback, proof, or verification state.

Keep these layers separate:

```text
canonical declaration
-> repository verifier proof
-> configured provider/tool state
-> active execution capability
-> observed outcome proof
```

The mutable capability ledger itself does not prove current-head CI, deployment, or runtime health. Read immutable current evidence for those claims.

## Independent review and founder-final merge truth

Founder Control Room's canonical in-app merge path requires exact provider PR identity, exact-head machine evidence, canonical diff/policy hashes, a passed exact-head deterministic independent-review witness, P2 blocking, an authenticated founder-final approval bound to the exact PR/base/head, and a last-moment head re-read before provider integration.

The deterministic review remains proposal-only and non-authorizing. The authenticated founder-final receipt supplies the final human authority only after independent proof is current. Founder self-approval is therefore **not** relabeled as independent review.

New founder-final approvals use a server-owned policy with zero required semantic humans, deterministic review required, P2 blocking, and `founderFinalApprovalRequired: true`. The older `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS` policy remains compatibility-only for missions already pinned under the earlier human-semantic-review model.

This source/runtime membrane is **not proof of the live GitHub repository ruleset**. GitHub web/API merges, required approval counts, stale-review dismissal, last-push approval, thread-resolution rules, strict status freshness, and bypass actor/mode configuration are separate provider facts that require current GitHub readback.

A GitHub merge outside the in-app FCR execution path does not prove the FCR deterministic-review + founder-final contract was used.

### FCR GitHub App authority

Production GitHub authentication should prefer repository-scoped installation credentials minted from `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`. The FCR App should be installed only on `jussray/founder-control-room` unless broader scope is separately reviewed.

For any active ruleset protecting `jussray/founder-control-room` `main`, the only permitted bypass actor is exactly the numeric App identity configured by trusted `GITHUB_APP_ID`. Missing, mismatched, caller-supplied alternative, or additional bypass integration IDs fail closed. `GITHUB_WEBHOOK_SECRET` separately authenticates the signed `/api/webhooks/github` event ingress. Secret values never belong in source, PR bodies, issue comments, logs, screenshots, browser bundles, or chat-visible documentation.

## Founder-owned progress publishing

The product goal is deliberate: **Founder Control Room should be able to tell verified progress about the founder's own products from the founder's own product without giving away the private recipe.**

Current architecture separates story, authority, transport, and outcome:

```text
verified product / repository evidence
-> Chief proposes a public-safe, channel-native story
-> Sauce Guard keeps private machinery private
-> temporal claim classification
-> authenticated Current You confirms the exact public copy
-> FCR issues + persists an exact one-shot approval
-> publish request references the exact authorization hash
-> FCR atomically claims the matching stored approval
-> execution-time temporal revalidation
-> channel router
   -> first-party LinkedIn where configured and proven
   -> provider-neutral n8n only where an equally authoritative adapter exists
   -> Zapier / Buffer where they still add bounded connector or scheduling value
-> provider readback
-> Founder Control Room outcome receipt
-> observation-only analytics
```

For the first-party route, caller-supplied approval JSON is not publication authority. `POST /automation/conveyor/founder-content/approvals` requires authenticated exact-copy confirmation before FCR issues and stores the one-shot authority. `POST /automation/conveyor/founder-content/publish-now` must reference the exact `authorization_hash`; FCR then claims the exact matching unrevoked, unconsumed, unexpired stored approval before temporal revalidation or provider mutation.

Changing the approved copy, proposal/public-payload identity, source version, channel, or authorization fingerprint requires fresh matching approval. A consumed approval does not become replay authority after downstream failure. Approval issuance or claim is still not publication truth. Provider readback remains terminal external-state evidence.

Public-safe progress may explain what changed, what was learned, why it matters, an approved public proof, and an honest unresolved next gate.

Keep private prompts, raw diffs, credentials, internal evidence references, private provider payloads, private metrics, customer/private data, security-sensitive implementation details, unreleased roadmap detail, and proprietary mechanics behind Sauce Guard.

For social destinations keep these states separate:

```text
contract-capable
-> configured / allowlisted
-> adapter-proven
-> provider-outcome-proven
```

The generic founder stage-conveyor readiness may report `not-configured`, `ready-for-probe`, `enabled-awaiting-proof`, or `enabled-live-verified`. `enabled-live-verified` is allowed only when n8n is configured and enabled, the deployed FCR runtime exposes a valid exact `GIT_SHA`, and the newest retained accepted `n8n-live-probe-*` receipt for `founder-control-room` in `capability_execution_receipts` binds that same exact SHA. A stale-head receipt, missing receipt, missing runtime SHA, or receipt-ledger readback failure remains `enabled-awaiting-proof`; source support for this readback does not itself prove a persistent external n8n instance is live.

The founder-content readiness is a separate publication-oriented boundary. It may report `not-configured`, `ready-for-probe`, `enabled-misconfigured`, `invalid-provider-configuration`, or `enabled-awaiting-proof`, including whether Buffer is ready for one controlled probe. Those states do not establish publication truth, and its `liveVerified` remains false until a separate controlled provider probe and provider readback succeed.
The founder-authenticated conveyor status may report `not-configured`, `ready-for-probe`, `enabled-misconfigured`, `invalid-provider-configuration`, `enabled-awaiting-proof`, or `enabled-live-verified`, including whether Buffer is ready for one controlled probe. The canonical conveyor reaches `enabled-live-verified` only when a retained activation-probe receipt matches the deployed exact `GIT_SHA`. If the runtime SHA changes, that receipt remains valid historical evidence but no longer authorizes a present-tense live claim; stale-head, missing runtime SHA, or unavailable receipt readback must remain non-live. Conveyor live readiness still does not prove Buffer scheduling, LinkedIn publication, or any terminal provider outcome.

A platform-native draft is not proof that the provider adapter is live. n8n acceptance is not publication truth. Provider readback remains terminal external-state evidence.

Investor email is a separate authority class and must never auto-send without the applicable standing policy **and recipient-specific qualification**.

## Production authority and Cloudflare topology

Production does **not** deploy merely because `main` moved or because a Cloudflare build succeeded.

The repository's canonical topology is:

```text
foundercontrolroom.org
  -> Cloudflare Pages project: founder-control-room
  -> static/browser assets from Pages
  -> dynamic API traffic through the Pages `FCR_API` Service Binding in source

api.foundercontrolroom.org
  -> canonical Worker: founder-control-room
```

The retired `founder-control-room2` identity must not be recreated.

The canonical Worker also owns FCR's outbound Cloudflare Email Service capability through the project-scoped `FCR_EMAIL` binding. Its sender identity is pinned in source/config to `welcome@api.foundercontrolroom.org`; callers cannot supply another project's `from` address, and other portfolio projects do not inherit this capability by default. Checked repository configuration is not proof that Cloudflare has onboarded the sender domain, that the deployed Worker exposes the binding, or that a message was delivered.

Current Pages source fails closed when `FCR_API` is unavailable and verifies the bound service identity on dynamic responses. **Source dependence on that binding does not prove the live Pages project currently has the correct provider binding.** Provider configuration and exact runtime behavior require current Cloudflare readback and deployed-path proof.

The read-only Cloudflare audit keeps its primary Worker Git authority receipt independent from optional hostname enrichment. The core authority readback requires the dedicated read-only Workers Builds user token; DNS inventory and Request Trace credentials are optional enrichment. Missing credentials leave hostname/trace evidence `UNKNOWN`, and attempted enrichment failures may remain visible in their bounded evidence lane, but neither case may downgrade or upgrade the snapshotted core Worker Git authority `ok`/`error` verdict. If the core receipt is absent or failed, enrichment cannot manufacture success. The audit remains exact-current-main-bound and cannot authorize Cloudflare mutation.

`wrangler.worker.toml` executes `scripts/verify-worker-build-authority.mjs` before canonical Worker builds. Native Cloudflare Workers Builds must bind their provider commit to the checked-out Git source SHA and may use only non-promoting `wrangler versions upload`; a native `wrangler deploy` fails closed. Manual GitHub `Deploy` / `FCR Worker Reconcile` remains the only source-recognized production-promotion context, and its checked-out SHA must match the exact GitHub workflow SHA. This repository membrane does not prove or mutate the live Cloudflare Builds settings.

Native Cloudflare Worker/Pages build receipts are provider build/deploy evidence for the exact artifact they name. They do not prove the guarded production release path, database migration, auth behavior, browser behavior, fleet-wide runtime identity, or publication outcome.

Production release evidence remains incomplete until the applicable authorized lane proves, for one exact current-main SHA:

- current deployment authority;
- required production configuration and bindings;
- provider mutation success for the authorized scope;
- migration evidence only when database mutation is actually in scope;
- canonical Worker identity;
- `/health` and `/version` identity;
- Pages/API routing and service identity;
- required browser/runtime proof; and
- rollback ownership.

The production-specific Truth Lease does not manufacture any of those facts. It composes already-authoritative observations only after Cloudflare Worker/Pages identities, Playwright tested/runtime identity, Supabase production state, independent review, and the repository head all bind to the same exact candidate. At deploy, publish, completion-claim, or another consequential use boundary, those dependencies must be freshly re-observed; any missing, stale, changed, or mismatched dependency makes the production claim unusable until proof is rebuilt.

### Historical production provenance

Earlier production attempts and their exact SHAs/run IDs remain useful incident evidence, including attempts that passed exact-head checkout but failed configuration before deployment/runtime proof. They are **historical provenance**, not a permanent statement of the current production blocker.

Before naming a current production blocker, re-read current GitHub, Cloudflare, and runtime evidence.

## State → Evidence → Claim

Founder Control Room treats completion as an evidence-bearing state.

For any material claim identify:

1. **State** — what actually changed;
2. **Evidence** — what proves it;
3. **Authority** — which system or actor produced that evidence;
4. **Temporal validity** — whether the evidence is still current for this use; and
5. **Claim coverage** — which boundaries the evidence proves and which remain unknown.

Keep repository, CI, provider, database, browser, device, account, publication, analytics, and runtime witnesses separate.

`VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, `STALE`, `SUPERSEDED`, and `HISTORICAL` are not interchangeable labels.

## Founder Switchboard

The Founder Switchboard is the visual control surface for audited portfolio capabilities.

It deliberately separates four questions that are often collapsed into one misleading green state:

```text
BUILT -> CONFIGURED -> ACTIVE -> PROVEN
```

A capability can exist in source without being configured, configured without being active, or active without having enough evidence to call it proven.

Switchboard controls are authority-aware:

- **enforced** controls can have a real server-side effect inside already-granted authority;
- **observe-only** controls record desired/provider intent without pretending the repository can mutate the external provider; and
- **locked-off** controls keep high-consequence actions outside the active authority membrane until code/evidence changes the lock through review.

The Switchboard does not create deployment, database, credential, billing, publication, destructive-action, or rollback authority.

## Why this exists

GitHub is a source/review/workflow provider. Cloudflare is a deployment/runtime provider. Supabase is a database/auth provider. n8n and Zapier are orchestration providers. HubSpot is a CRM provider. None of them should silently become the founder's control constitution.

Founder Control Room keeps the useful properties:

- versioned source;
- exact refs and diffs;
- review and CI evidence;
- approval boundaries;
- rollback;
- audit trails;
- temporal truth;
- provider readback; and
- founder-ready truth receipts.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture.

## AI operating contracts

- [`GLOBAL_AI.md`](GLOBAL_AI.md) — provider-neutral founder contract
- [`AGENTS.md`](AGENTS.md) — repository entry contract
- [`CHATGPT.md`](CHATGPT.md) — ChatGPT operating contract
- [`CLAUDE.md`](CLAUDE.md) — Claude / Claude Code overlay
- [`PERPLEXITY.md`](PERPLEXITY.md) — Perplexity overlay
- [`.ai/skills/juss-flow-launch-loop/SKILL.md`](.ai/skills/juss-flow-launch-loop/SKILL.md) — bounded implementation/review/merge loop
- [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md) — current repository integration authority
- [`docs/TRUTH_DECAY_AUDIT.md`](docs/TRUTH_DECAY_AUDIT.md) — truth-aging / FutureYou-ME failure contract
- [`docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`](docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md) — public truth and Sauce Guard boundary
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — provider handoffs
- [`docs/CLOUDFLARE_REASONING.md`](docs/CLOUDFLARE_REASONING.md) — Cloudflare reasoning/recovery contract

Provider overlays may become stricter, but they do not become competing constitutions or expand their own authority.

## Current capability layers

### Repository and mission control

Founder Control Room can model projects, proposals, missions, verification runs, exact refs, evidence, approval state, and guarded repository integration while keeping repository-provider concerns behind an interface.

### Guarded terminal

The terminal executes only registered commands against an exact verified checkout. It does not accept arbitrary shell strings, caller-supplied executables, redirections, pipes, or unreviewed environment mutation.

A terminal run is verification evidence only for the scope that actually executed.

### Cloudflare reasoning and recovery

Read-only reasoning can assess desired commit, provider evidence, release markers, health, credential/configuration failures, evidence freshness, and deployment authority. Recovery/source workflows remain bounded by their exact provider permissions and do not prove live configuration until readback succeeds.

### MCP and capability governance

The canonical capability declaration is `.control/capability.json`. Repository declarations are intent/configuration, not proof that a live external integration is installed, authenticated, healthy, or authorized for mutation.

### Constitutional skill routing

Project skills are selected under repository authority, privacy, proof, runtime-discovery, commercial, provider, messaging, temporal-truth, and mutation constraints. A skill cannot expand its own authority ceiling.

### Federated truth receipts

The implementation can assess freshness-aware repository truth receipts and surface bounded founder recommendations. Browser proof for a scoped behavior is not a claim that every upstream provider or production surface is healthy.

### Public skill-testing evidence loop

The repository contains an instrumented, privacy-safe field-testing loop for public skills, including structured public-safe receipts, named round/version identity, KPI calculations, and aggregate reporting that does not expose raw submission content.

That proves repository instrumentation exists. It does not by itself prove a public campaign ran, testers submitted data, distribution occurred, or a new skill version earned promotion.

## Data boundary

Founder Control Room uses its **own** Supabase project, separate from Se'kret Bip's database, trust boundary, and service-role credentials.

The Control Room consumes curated operational evidence. It must not become a broad back door into Se'kret Bip private user data.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Public-safe configuration may live in `.env.example`; secret values do not belong in source, logs, retained artifacts, browser bundles, or public posts.

## Founder authentication

Founder-only routes require verified session/auth state plus the founder allowlist. The browser UI and API remain separate from arbitrary shell execution.

## Guarded founder terminal

The terminal is enabled only when repository/environment policy permits it and all applicable checks pass, including founder authentication, allowed origin constraints, reviewed workspace root, registered command identity, exact mission/repository commit, checkout equality, and allowed risk for the current mission state.

Approved branch/merge actions use reservation/idempotency controls before provider mutation so ambiguous provider success cannot be silently replayed.

## Authority model

| Action | Authority |
|---|---|
| Read project/evidence | Founder-authenticated or explicitly public-safe read |
| Run bounded verification | Applicable founder/repository authority |
| Create branch | Separate repository write authority |
| Merge through FCR | Exact-head machine proof + deterministic independent review + authenticated exact-candidate founder-final approval + repository authority |
| Merge through live GitHub surface | Separate live GitHub ruleset/provider authority and readback |
| Deploy / mutate production | Separate exact production authority |
| Database migration | Separate migration/database authority |
| Credentials/secrets | Separate credential authority |
| Publication | Exact route-specific Current You authority + FCR-owned exact one-shot approval claim + provider outcome proof |
| Investor email | Applicable standing policy + recipient-specific qualification + send authority |
| Billing / destructive action | Separate exact authority |
| Rollback | Separate rollback authority |

No approval silently carries forward to another authority class.

## Documentation rule

Current `main`, executable implementation, exact-head verification, current founder intent, and authoritative provider/runtime receipts outrank stale Markdown.

Markdown must be repaired when it materially drifts from verified truth. Do **not** change implementation merely to make stale prose true. Historical documents may remain historical as long as they cannot masquerade as present-state authority.

The `Documentation Truth` verifier makes this rule load-bearing for truth-sensitive changes and rechecks the merged transition on `main`.

## License

Copyright © 2024–2026 Juss Ray. All rights reserved. Proprietary software — see [LICENSE](LICENSE).