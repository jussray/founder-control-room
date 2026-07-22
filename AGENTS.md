# Founder Control Room Agent Instructions

Read these before changing code, configuration, schemas, providers, verification contracts, commercial plans, launch surfaces, or documentation:

- [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md) first
- [`GLOBAL_AI.md`](./GLOBAL_AI.md)
- [`Founder Merge Authority`](./docs/FOUNDER_MERGE_AUTHORITY.md)
- [`skills/portfolio-control-plane/SKILL.md`](./skills/portfolio-control-plane/SKILL.md)
- [`skills/typescript-audit/SKILL.md`](./skills/typescript-audit/SKILL.md) before TypeScript, TSX, JavaScript, Node, Worker, build, PR, draft PR, or mergeability edits
- [`skills/typescript-root-cause-debugger/SKILL.md`](./skills/typescript-root-cause-debugger/SKILL.md) for ranked root-cause debugging before patch proposals
- [`skills/typescript-minimal-patch/SKILL.md`](./skills/typescript-minimal-patch/SKILL.md) when writing the smallest safe TypeScript repair
- [`skills/typescript-behavior-tests/SKILL.md`](./skills/typescript-behavior-tests/SKILL.md) when writing, replacing, or retiring Jest/Vitest behavior tests
- [`skills/typescript-strict-review/SKILL.md`](./skills/typescript-strict-review/SKILL.md) before merge-ready or ready-for-review claims on TypeScript changes
- [`skills/product-design-gate/SKILL.md`](./skills/product-design-gate/SKILL.md) before Product Design audits, prototypes, visual QA, or design evidence claims
- [`skills/sales/SKILL.md`](./skills/sales/SKILL.md) for qualification, offers, proof, conversion quality, retention, and revenue operations
- [`skills/devil/SKILL.md`](./skills/devil/SKILL.md) for the premise attack and selected-plan attack

For Se'kret Bip splash, founding-preview, waiting-list, sponsor, or social launch work, also read [`docs/private/JUSS_PRIVATE_OPERATING_PLAN.md`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).

For messaging, lead generation, sales automation, unified inbox, consent, outreach,
email, SMS, calls, webchat, Instagram, Facebook, WhatsApp, Telegram, Viber, or
channel-adapter work, also read:

- [`.ai/skills/unified-growth-inbox/SKILL.md`](.ai/skills/unified-growth-inbox/SKILL.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_PLAN.md`](docs/private/UNIFIED_GROWTH_INBOX_PLAN.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md`](docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md)
- [`config/unified-growth-inbox.channels.json`](config/unified-growth-inbox.channels.json)
- [`src/types/growthInbox.ts`](src/types/growthInbox.ts)

The default growth-inbox mode is `draft_only`. No live outreach, calling, campaign,
credential creation, paid provider enablement, deployment, or pricing/discount action
is authorized merely because the skill or contract exists.

Use the exact founder stack:

```text
/elonmusk /garyvee lindymode redteam l99 redteam ooda /truthmode
```

For commercial work add:

```text
/sales /devil
```

`/sales` constructs the strongest truthful exchange. `/devil` attacks both the premise and selected plan. Neither authorizes outreach, pricing, discounts, spending, publication, checkout, deployment, migration, or database mutation. Repository merges may proceed under the standing conditions in `docs/FOUNDER_MERGE_AUTHORITY.md`.

## Required loop

1. Inspect repository, branch, provider state, auth boundaries, migrations, tests, commercial evidence, launch evidence, Cloudflare evidence, runtime truth, open PRs, and draft PRs.
2. Complete 5W1H and identify the next authority gate.
3. Attack the premise before designing the solution or offer.
4. Apply the Lindy screen and map authority, provenance, project boundaries, state, evidence, economics, event history, failure modes, release truth, and rollback through L99.
5. Attack the selected plan before implementation or execution.
6. Make the smallest coherent, reversible change and verify it, including behavior tests and Playwright when a user-facing web/runtime path changes.
7. Re-observe through OODA and report proof plus the next founder approval gate.

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

Never commit `.codex/.env`, `OPENAI_API_KEY`, `MODEL_API_KEY`, service-role keys, provider tokens, or any other secret. Model choice does not override this file, `GLOBAL_AI.md`, repository skills, verification gates, Founder Merge Authority, or explicit founder approval gates.

## OpenAI Platform and Zapier key handoff

For Founder Signal Engine automation, Codex and ChatGPT agents must treat Zapier as an operable workflow cockpit when the current environment exposes a Zapier, automation, browser-control, MCP, or equivalent connector. OpenAI Platform remains the key/model layer.

Canonical Zapier key intent:

```text
OpenAI Platform key name: zapier-founder-signal-engine
Purpose: allow Zapier to call OpenAI for Founder Signal Engine 5W1H analysis, draft generation, routing decisions, and review-task content.
Target: Ray's OpenAI Platform organization/project selected through the OpenAI Platform connector.
```

Agent steering rule for Day 2:

```text
Goal: make the Day 2 workflow actually run.
Path: GitHub evidence -> Zapier -> OpenAI 5W1H -> Buffer draft/queue -> HubSpot deal-associated task/note -> Founder Control Room evidence.
Default behavior: try to steer or repair Zapier through available tools before asking Ray to do it manually.
Fallback behavior: only give Ray exact Zapier UI steps after confirming no Zapier/control connector is available in the current environment.
```

Agent rules:

- First discover whether the current environment has a Zapier, automation, browser-control, MCP, OpenAI Developers, or equivalent connector that can inspect Zap history, edit Zap steps, test actions, or update app connections.
- If such a connector exists, use it to inspect the Day 2 Zap, verify the GitHub trigger, repair branch/PR trigger scope, test the OpenAI step, map Buffer draft/queue output, and associate HubSpot tasks/notes with the `Founder Signal Engine` deal.
- Do not stop at “I cannot access Zapier” until tool discovery confirms there is no usable Zapier/control path in the current environment.
- Use the OpenAI Platform connector to identify the correct organization/project, start secure key setup, or rotate a Zapier-specific key.
- Never ask Ray to paste the raw key into GitHub, HubSpot, Founder Control Room, issue comments, PR bodies, repo files, screenshots, logs, or chat-visible documentation.
- Never commit the Zapier OpenAI key or any placeholder that looks like a live secret.
- Do not reuse the local Codex `OPENAI_API_KEY` for Zapier unless Ray explicitly chooses to wire that same key outside the repository. Prefer a dedicated Zapier key.
- ChatGPT/Codex should guide Ray to paste the generated key into Zapier's OpenAI connection only when the environment cannot securely complete that Zapier connection itself.
- If Zapier fails at the OpenAI step, first verify that the Zapier OpenAI connection uses the dedicated key and that the key is active in OpenAI Platform.
- If Zapier reaches HubSpot, the HubSpot task/note must be associated with the `Founder Signal Engine` deal rather than created as a floating task.

Correct workflow boundary:

```text
GitHub evidence
-> Zapier trigger
-> OpenAI Platform key used inside Zapier
-> OpenAI 5W1H send gate
-> Buffer draft or queue item only when allowed
-> HubSpot task/note associated with Founder Signal Engine deal
-> Founder Control Room evidence record
```

Required 5W1H behavior for Zapier OpenAI calls:

```text
Who:
What:
Where:
When:
Why:
How:
Send decision: publish-draft, review-only, internal-only, or research-task
Missing proof or missing context:
```

If the 5W1H block is incomplete, Zapier must not publish or send. It should create a HubSpot research/review task associated with the Founder Signal Engine deal.

## Product Design and Supabase truth

Product Design screenshot or prototype evidence can identify visual, UX, and accessibility issues, but it does not prove Supabase Auth, RLS, Storage, Realtime, Edge Functions, schema behavior, or deployment safety.

When a product surface depends on Supabase, keep design evidence and Supabase evidence separate: design QA can pass while Supabase verification remains blocked.

## Release-truth outage classification

Founder Control Room is the first and authoritative place to record and interpret cross-repo release truth.

When GitHub Actions fails, classify the evidence before assigning blame:

- `runner_startup_failure`: runner/job startup failed before meaningful steps executed, especially no steps, no logs, or null log URLs.
- `workflow_no_jobs`: the workflow schedules no jobs or is skipped before jobs exist.
- `workflow_step_failure`: at least one job executed steps and logs show a concrete failing command, assertion, build, lint, type, or Playwright step.

Never claim a code regression when GitHub jobs have no executed steps or logs. Treat zero-step/no-log failures as infrastructure evidence. This infrastructure outage still gates release truth when repository rules require executed checks, Playwright proof, or exact-head evidence.

For every incident record, capture repository, PR, branch, head SHA, workflow, run, job evidence, classification, Cloudflare build/deploy status, runtime evidence, impact, and next gate.

Cloudflare build/deploy evidence is release truth, but it is separate from GitHub Actions. A successful Cloudflare build does not prove GitHub checks, Playwright, auth, data, privacy, or app behavior passed. A GitHub runner outage does not prove application failure. Record both without blending them.

## Canonical project routing

Only `jussray/Sekret-Bip` is the active Se'kret Bip working repository. Other Bip-named repositories are historical or investigate-only unless Founder Control Room explicitly names one for provenance capture.

Active work may proceed in Founder Control Room, `jussray/Sekret-Bip`, `jussray/l99-StoryEngine`, Chief/PromptOS, Juss Beautiful Hair repos, and clothing/storefront repos when each repo's local gates are satisfied.

## GitHub Actions Secrets

All secrets required by `.github/workflows/` are documented in [`docs/SECRETS.md`](./docs/SECRETS.md).

Before triggering a deploy, verify the full checklist in that file. Key secrets added this session:

| Secret | Used by | Purpose |
|---|---|---|
| `RECONCILE_SHARED_SECRET` | `deploy.yml / reconcile`, `POST /api/reconcile` | Authenticates inbound DriftReports. Minimum 32 random hex chars. Must be set in GitHub Secrets AND in Sekret-Bip and l99-StoryEngine for cross-service reconciliation. Generate with `openssl rand -hex 32`. |

> Never commit, log, or expose `RECONCILE_SHARED_SECRET`. Never put it in a `NEXT_PUBLIC_*` var.

## Non-negotiable boundaries

- Preserve the `RepositoryProvider` abstraction.
- Keep Control Room Supabase, credentials, and data separate from every managed project.
- Never copy private user, family, customer, vendor, media, credential, or commercially sensitive data into operational storage, prompts, sales analysis, Product Design captures, QA reports, Figma boards, prototypes, or outreach.
- Preserve founder allowlist authorization, audit events, project isolation, and separate approval gates.
- Do not expose provider tokens or service-role keys.
- Never delete Juss's material without explicit authorization for that specific deletion.
- Do not invent demand, scarcity, customer statements, eligibility, savings, performance, inventory, delivery, or authority.
- Merge when appropriate under `docs/FOUNDER_MERGE_AUTHORITY.md`. Do not deploy, roll back, alter auth/RLS, contact external parties, publish externally, change commercial terms, spend funds, or perform destructive writes without explicit founder approval for that exact action.
- Apply repository-specific skills when acting on managed projects; portfolio rules never replace local product, privacy, verification, sales, brand/IP, Supabase, Product Design, or rollback contracts.

## Evidence report

List files changed, behavior changed, tests run, Playwright result or inapplicability, failures or skips, security impact, provider impact, Supabase impact, Product Design evidence status, commercial assumptions, disqualifiers, brand/IP impact, Cloudflare/Control Room proof when applicable, rollback, unresolved risk, and next gate.