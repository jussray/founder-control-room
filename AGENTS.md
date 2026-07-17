# Founder Control Room Agent Instructions

Read these before changing code, configuration, schemas, providers, verification contracts, commercial plans, launch surfaces, or documentation:

- [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md) first
- [`founder-control-room-operator`](.agents/skills/founder-control-room-operator/SKILL.md) for the repository-scoped 5W1H operating contract
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
