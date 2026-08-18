# Founder Control Room Agent Instructions

Read these before changing code, configuration, schemas, providers, verification contracts, commercial plans, launch surfaces, or documentation:

- [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md) first
- [`Founder Intelligence Agent Entry Point`](./AGENTS_FOUNDER_INTELLIGENCE.md) for the portfolio constitution, remembrance loop, and inheritance registry
- [`founder-control-room-operator`](.agents/skills/founder-control-room-operator/SKILL.md) for the repository-scoped 5W1H operating contract
- [`GLOBAL_AI.md`](./GLOBAL_AI.md)
- [`.ai/skills/juss-flow-launch-loop/SKILL.md`](./.ai/skills/juss-flow-launch-loop/SKILL.md)
- [`Founder Merge Authority`](./docs/FOUNDER_MERGE_AUTHORITY.md)
- [`Truth Decay Audit`](./docs/TRUTH_DECAY_AUDIT.md)
- [`Public Communication Truth Contract`](./docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md)
- [`skills/portfolio-control-plane/SKILL.md`](./skills/portfolio-control-plane/SKILL.md)
- [`skills/typescript-audit/SKILL.md`](./skills/typescript-audit/SKILL.md) before TypeScript, TSX, JavaScript, Node, Worker, build, PR, draft PR, or mergeability edits
- [`skills/typescript-root-cause-debugger/SKILL.md`](./skills/typescript-root-cause-debugger/SKILL.md) for ranked root-cause debugging before patch proposals
- [`skills/typescript-minimal-patch/SKILL.md`](./skills/typescript-minimal-patch/SKILL.md) when writing the smallest safe TypeScript repair
- [`skills/typescript-behavior-tests/SKILL.md`](./skills/typescript-behavior-tests/SKILL.md) when writing, replacing, or retiring Jest/Vitest behavior tests
- [`skills/typescript-strict-review/SKILL.md`](./skills/typescript-strict-review/SKILL.md) before merge-ready or ready-for-review claims on TypeScript changes
- [`skills/product-design-gate/SKILL.md`](./skills/product-design-gate/SKILL.md) before Product Design audits, prototypes, visual QA, or design evidence claims
- [`.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md`](./.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md) before ChatGPT or another agent without a native Zapier connector invokes the Founder Signal Engine bridge
- [`skills/sales/SKILL.md`](./skills/sales/SKILL.md) for qualification, offers, proof, conversion quality, retention, and revenue operations
- [`skills/devil/SKILL.md`](./skills/devil/SKILL.md) for the premise attack and selected-plan attack

For Se'kret Bip splash, founding-preview, waiting-list, sponsor, or social launch work, also read [`docs/private/JUSS_PRIVATE_OPERATING_PLAN.md`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).

For messaging, lead generation, sales automation, unified inbox, consent, outreach, email, SMS, calls, webchat, Instagram, Facebook, WhatsApp, Telegram, Viber, or channel-adapter work, also read:

- [`.ai/skills/unified-growth-inbox/SKILL.md`](.ai/skills/unified-growth-inbox/SKILL.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_PLAN.md`](docs/private/UNIFIED_GROWTH_INBOX_PLAN.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md`](docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md)
- [`config/unified-growth-inbox.channels.json`](config/unified-growth-inbox.channels.json)
- [`src/types/growthInbox.ts`](src/types/growthInbox.ts)

The default growth-inbox mode is `draft_only`. No live outreach, calling, campaign, credential creation, paid provider enablement, deployment, pricing/discount action, or publication is authorized merely because a skill or connector exists.

## Founder stack compatibility and expanded reasoning

The existing routing shorthand remains supported:

```text
/elonmusk /garyvee lindymode redteam l99 redteam ooda /truthmode
```

For commercial work add:

```text
/sales /devil
```

`/sales` constructs the strongest truthful exchange. `/devil` attacks both the premise and selected plan. Neither authorizes outreach, pricing, discounts, spending, publication, checkout, deployment, migration, or database mutation.

The expanded implementation semantics are governed by `GLOBAL_AI.md` and the Juss Flow launch loop:

```text
ULTRATHINK
+ Product Design
+ Data Analytics
+ Redteam I
+ Lindy
+ L99
+ OODA
+ Hormozi
+ Bill Gates
+ Elon Musk
+ Redteam II
+ Documentation Truth
```

Reasoning may run in parallel. Mutation authority stays serialized.

## Required loop

1. Inspect current repository, branch, `main`, provider state, auth boundaries, migrations, tests, Product Design evidence, analytics evidence, launch evidence, Cloudflare/runtime truth, open PRs, draft PRs, and current-state docs.
2. Complete 5W1H and identify the next authority/freshness gate.
3. Redteam I: attack the premise before designing the solution or offer.
4. Apply Product Design + Data Analytics + Lindy + L99. Map authority, provenance, project boundaries, state, evidence, economics, temporal validity, event history, failure modes, release truth, Sauce Guard, and rollback.
5. Re-orient through OODA using current evidence, not remembered state.
6. Apply Hormozi: increase useful outcome/proof while reducing delay, founder effort, cognitive load, and maintenance burden without inventing demand or traction.
7. Run the Bill Gates pass: identify the bottleneck, highest-leverage correction, reusable standard, and what must not be scaled yet.
8. Run the Elon Musk pass: question requirements, delete unnecessary complexity, simplify the remaining system, shorten the proof loop, and automate last without deleting safety/authority/evidence boundaries.
9. Make the smallest coherent reversible change.
10. Redteam II: attack the selected implementation for false greens, stale truth, privilege expansion, sauce leakage, duplicate authority, provider drift, stale-branch overwrite, and rollback gaps.
11. Verify with behavior tests, exact-head repository checks, Playwright when user-facing paths change, and Documentation Truth when current-state truth changes.
12. Before merge, re-read current `main`, exact candidate head, review state, and applicable provider state.
13. After merge, re-read resulting `main`, post-merge Documentation Truth, provider/runtime evidence, stale/superseded docs/PRs, and the next launch bottleneck.

## Implementation rule

The reasoning loop continues while code is being written. It is not a decorative preamble pasted above a diff after the important mistakes already happened.

For material implementation, maintain:

```text
Goal → Reality → ULTRATHINK → Product Design + Data Analytics → Redteam I → Lindy → L99 → OODA → Hormozi → Bill Gates → Elon Musk → Implement → Proof → Redteam II → Documentation Truth → Rollback → Next gate
```

Compilation, unit tests, CI, Documentation Truth, provider readback, deployment, runtime, publication, analytics, and human outcomes are separate evidence layers. Never convert one into a claim about all the others.

## Truth Lease / FutureYou-ME safety

A fact may have been true when observed and unsafe when reused later. A hash proves identity, not continued reality.

At consequential merge, deploy, schedule, publish, provider, completion-claim, and launch boundaries:

- identify the claim and load-bearing dependencies;
- re-observe authoritative current evidence;
- classify `CURRENT`, `HISTORICAL`, `STALE`, `SUPERSEDED/INVALIDATED`, or `UNKNOWN`;
- use present-tense operational language only while current;
- preserve older evidence as provenance instead of deleting it;
- never let Current You preference override contradictory repository/provider/runtime evidence; and
- never let FutureYou/model guidance become evidence or approval.

Use the generic Truth Lease where no stronger domain-specific temporal gate already exists.

## Documentation Truth

README files, AI contracts, runbooks, PR descriptions, issues, and current-state docs can influence future actions. They are part of the truth surface.

For truth-sensitive architecture, authority, provider, capability, publishing, workflow, deployment, or launch changes:

- update `README.md` and applicable current-state docs in the same bounded change;
- mark contradictory older material historical/superseded/stale or point it to the new authority;
- run `Documentation Truth` on the exact PR head;
- require it inside CI / Required Gate;
- run it again on merged `main`; and
- re-observe provider/runtime truth before reusing present-tense claims.

Do not hard-code a durable “current main SHA,” refresh date, provider result, or PR state into prose and assume it renews itself.

## Codex provider baseline

When a repo-running Codex agent needs model-provider configuration, keep it machine-local and use OpenAI/Codex as the default coding engine:

```toml
model = "gpt-5.3-codex"
model_provider = "openai"
model_reasoning_effort = "high"
model_reasoning_summary = "auto"
model_supports_reasoning_summaries = true
model_auto_compact_token_limit = 900000
```

Store the API key outside the repository, for example in `~/.codex/.env`:

```dotenv
OPENAI_API_KEY=replace_with_local_secret
```

Never commit `.codex/.env`, `OPENAI_API_KEY`, `MODEL_API_KEY`, service-role keys, provider tokens, or another secret. Model choice does not override repository contracts or approval gates.

## OpenAI Platform, Zapier, n8n, and Founder Signal Engine

For Founder Signal Engine automation, Codex and ChatGPT agents must **treat Zapier as an operable workflow cockpit only** when the current environment exposes a direct Zapier/control connector or the approved OpenAI Developers invocation bridge. Zapier's GitHub app is a deterministic read/write metadata layer, not a GitHub Actions workflow-runtime or administration layer. OpenAI Platform remains a key/model layer, not publication authority.

Canonical Zapier key intent:

```text
OpenAI Platform key name: zapier-founder-signal-engine
Status: existing provider-held key reference; do not recreate, rotate, or duplicate without explicit founder approval.
Purpose: allow an authorized workflow to call OpenAI for Founder Signal Engine analysis/draft/routing work.
```

Current product architecture is provider-neutral:

```text
verified product/repository evidence
-> FCR truth + founder authority
-> Chief / ME / FutureYou proposal
-> Sauce Guard + temporal truth
-> exact Current You authority for the executable route
-> channel router
   -> first-party LinkedIn where configured and proven
   -> provider-neutral n8n for bounded multistep social adapters
   -> Zapier / Buffer where they still add connector, scheduling, or fallback value
-> provider readback
-> FCR outcome receipt
-> observation-only analytics
```

Keep `contract-capable`, `configured/allowlisted`, `adapter-proven`, and `provider-outcome-proven` separate.

### Adapter/tool rules preserved for compatibility

- First discover whether the current environment has a native Zapier, automation, browser-control, MCP, or equivalent connector that can inspect Zap history, edit Zap steps, test actions, or update app connections.
- When a native connector exists, use it only within its declared workflow scope. For GitHub metadata evidence, prefer `Find Repository` -> `Get File Contents` -> `Find Issue` or `Find Pull Request` -> `Find Branch` when required.
- **Never treat Zapier's GitHub app as authority to inspect GitHub Actions jobs or logs**, download artifacts, rerun workflows, merge, deploy, delete branches, change rulesets, or modify credentials.
- For Actions failure triage without an Actions-capable connector, use `Gmail failure evidence -> ChatGPT structured summary -> deterministic GitHub metadata lookup -> bounded issue/comment -> Founder Control Room evidence`.
- When ChatGPT or another approved agent has no native Zapier connector, read [`.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md`](./.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md) and use **OpenAI Developers** only through the approved bridge/action scope.
- “Call the key” means invoke a secure provider-held key reference. It never means reading, copying, displaying, logging, or pasting the raw secret.
- Do not start secure key setup, rotate the Zapier-specific key, or create a duplicate merely because direct Zapier tooling is absent.
- A bridge may perform only capabilities it explicitly exposes. Invocation access does not grant Zapier administration, credential, billing, or unrelated mutation authority.
- **Require a real Zapier run ID** or retain the exact provider error when a claim depends on Zapier execution.
- Never ask Juss to paste raw keys into GitHub, HubSpot, Founder Control Room, issues, PR bodies, repository files, screenshots, logs, or chat-visible docs.
- Never commit the Zapier OpenAI key or a placeholder that resembles a live secret.
- Do not reuse a local Codex `OPENAI_API_KEY` for Zapier unless Juss explicitly authorizes that separate provider configuration.
- If Zapier reaches HubSpot, the HubSpot task or note must be associated with the appropriate audited Founder Signal Engine record rather than created as floating evidence.
- **Sensitive teen, family, journal, voice, media, or wellness repositories** remain outside broad marketing ingestion unless a separately reviewed privacy-safe contract authorizes bounded public-safe evidence.
- `jussray/founder-control-room` may receive bounded issues, comments, drafts, and review tasks from this path, but it **must not auto-merge or auto-deploy through Zapier**.

### Historical Day 3 provenance

The following exact event is retained as historical provenance, not current execution authority:

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

That record may explain an earlier Day 3 workflow. It must not be reused as current GitHub, Zapier, Buffer, HubSpot, publication, or Founder Control Room state without fresh evidence.

Historical adapter instructions and task budgets may remain useful implementation provenance, but they cannot override the current FCR → exact Current You → direct/provider-neutral n8n/bounded Zapier → provider-readback architecture.

If a 5W1H block is incomplete, do not publish or send. Create only the bounded research/review artifact currently authorized by the applicable provider contract.

## Founder-owned publishing / Sauce Guard

The product should be able to post verified progress about Juss's products from Founder Control Room without exposing the private recipe.

Public-safe story may include what changed, what problem was solved, what was learned, why it matters, approved public proof, and a truthful next gate.

Keep private prompts, raw diffs, credentials, private provider payloads, private metrics, customer/private data, unreleased roadmap detail, internal evidence references, security-sensitive details, and proprietary mechanics behind Sauce Guard.

A standing eligibility policy does not automatically become execution authority. Publication follows the current executable route-specific Current You and provider-readback contracts in `docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`.

Investor email remains separate and requires the applicable standing policy plus recipient-specific qualification before any send authority can be considered.

## Product Design and Supabase truth

Product Design screenshot/prototype evidence can identify visual, UX, and accessibility issues, but it does not prove Supabase Auth, RLS, Storage, Realtime, Edge Functions, schema behavior, or deployment safety.

When a product surface depends on Supabase, keep **design evidence and Supabase evidence separate**: design QA can pass while Supabase verification remains blocked.

Product Design should make capability, configuration, authority, temporal truth, provider state, outcome, and next gate distinct.

Data Analytics is observation-only. It may measure safe counts, rates, comparable windows, stale-claim blocks, revalidation outcomes, documentation drift, provider readback, and correction latency. It may not renew truth or approve action.

## FCR independent review and live GitHub

Founder Control Room in-app merges have a current independent-review membrane. For FCR, reviewer trust is server-owned at evaluation through `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS`.

Author self-review, stale-head review, generic comments, and app/bot substitution do not satisfy a qualifying non-author semantic-review requirement.

The FCR in-app review membrane and live GitHub repository rulesets are separate provider surfaces. Source code does not prove live required approvals, stale-review dismissal, last-push approval, review-thread resolution, strict status checks, or bypass actor/mode configuration. Fresh GitHub provider readback is required for those claims.

## Release-truth outage classification

Founder Control Room is the first place to record and interpret cross-repo release truth.

When GitHub Actions fails, classify the evidence before assigning blame:

- `runner_startup_failure`: runner/job startup failed before meaningful steps executed, especially no steps, no logs, or null log URLs.
- `workflow_no_jobs`: workflow schedules no jobs or is skipped before jobs exist.
- `workflow_step_failure`: at least one job executed steps and logs show a concrete failing command, assertion, build, lint, type, contract, or Playwright step.

Never claim a code regression when jobs have no executed steps/logs. Cloudflare build/deploy evidence and GitHub Actions evidence remain separate.

## Canonical project routing

Only `jussray/Sekret-Bip` is the active Se'kret Bip working repository. Other Bip-named repositories are historical or investigate-only unless Founder Control Room explicitly names one for provenance capture.

Active work may proceed in Founder Control Room, `jussray/Sekret-Bip`, `jussray/StoryEngine`, Chief/PromptOS, Juss Beautiful Hair repos, and clothing/storefront repos when each repo's local gates are satisfied.

## GitHub Actions secrets

All secrets required by `.github/workflows/` are documented in [`docs/SECRETS.md`](./docs/SECRETS.md).

Never commit, log, expose, or publish secret values. Secret-name presence proves wiring only; provider validity/permission remains separate.

## Non-negotiable boundaries

- Preserve `RepositoryProvider` abstraction.
- Keep Control Room Supabase, credentials, and data separate from every managed project.
- Never copy private user, family, customer, vendor, media, credential, or commercially sensitive data into operational storage, prompts, sales analysis, Product Design captures, QA reports, prototypes, analytics, or outreach.
- Preserve founder allowlist authorization, audit events, project isolation, independent review where required, and **separate approval gates**.
- Do not expose provider tokens or service-role keys.
- Never delete Juss's material/history without explicit authority for that specific deletion.
- Do not invent demand, scarcity, customer statements, eligibility, savings, performance, inventory, delivery, authority, review state, publication, or provider success.
- Merge only under `docs/FOUNDER_MERGE_AUTHORITY.md` and the current exact-head/review/provider gates.
- Do not deploy, roll back, alter auth/RLS, contact external parties, publish, change commercial terms, spend funds, mutate provider bindings/rulesets, or perform destructive writes without separate exact authority.
- Repository-specific skills never replace local product, privacy, verification, sales, brand/IP, Supabase, Product Design, temporal truth, Documentation Truth, or rollback contracts.

## Figma build and implementation

For Figma, dashboard design, design-system, design-to-code, Code Connect, prototype, or visual QA work, also read `.agents/skills/figma-build-implement/SKILL.md` and `.figma/repository-profile.json`.

Figma is a founder specification/review surface. It cannot create mission truth, evidence provenance, provider truth, approval authority, migration state, integration proof, deployment proof, or rollback authority. Use only synthetic/sanitized operational data.

## Evidence report

List goal, reality, ULTRATHINK decomposition, Product Design state, Data Analytics/truth state, premise risk, Lindy choice, L99 boundaries, OODA decision, Hormozi value pass, Bill Gates bottleneck/leverage, Elon Musk requirement/deletion/simplification/feedback/automation findings, selected-plan Redteam, files changed, behavior changed, checks run, Playwright result/inapplicability, Documentation Truth, security/provider/Supabase impact, commercial assumptions, rollback, truth age/superseded state, unresolved risk, and next gate.

## Fact-check and portable founder approvals

- Read [`skills/fact-check-every-claim/SKILL.md`](./skills/fact-check-every-claim/SKILL.md) before externally using factual claims, numbers, quotations, dates, or action guidance.
- Read [`docs/PORTABLE_FOUNDER_APPROVALS.md`](./docs/PORTABLE_FOUNDER_APPROVALS.md) before treating approval from another approved founder console as mutation authority.
