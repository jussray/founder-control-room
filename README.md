# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

---

## The real story

I couldn't afford a DevOps team, a QA engineer, a release manager, or a CTO.

So I built one.

This is the command center I run Se'kret Bip from — a provider-independent control plane with approval gates, change proposals, mission verification, and a guarded terminal that only executes exact, pre-approved commands against a confirmed repo HEAD.

Every material action requires the applicable founder authority, evidence, and rollback boundary. Repository merges may use the standing evidence-based authority in `docs/FOUNDER_MERGE_AUTHORITY.md`; deployment, migration, auth/RLS, credentials, billing, publication, destructive changes, and other separately gated actions still require their own exact authority. No step silently carries forward to the next. Built by a single mom of 8 in Pittsburgh, at $0, because the alternative was shipping blind.

---

Standalone, provider-independent Control Room for managing Se'kret Bip and future
projects — repository-agnostic, GitHub-optional, founder-approval-gated.

## Why this exists

GitHub is a host and workflow platform built on top of Git. This project keeps
the *useful properties* (versioned source control, branches, diffs, review,
CI evidence, rollback, audit trail) without requiring GitHub specifically —
and without living inside the Bip app repo it manages.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and the
phased no-GitHub migration plan.

## AI operating contracts

- [`GLOBAL_AI.md`](GLOBAL_AI.md) — provider-neutral founder contract
- [`AGENTS.md`](AGENTS.md) — repository entry contract for Codex, ChatGPT, and repository agents
- [`CHATGPT.md`](CHATGPT.md) — ChatGPT repository operating contract
- [`CLAUDE.md`](CLAUDE.md) — Claude / Claude Code repository operating contract
- [`PERPLEXITY.md`](PERPLEXITY.md) — Perplexity / Perplexity MCP repository operating contract
- [`docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`](docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md) — canonical Founder Control Room + Chief AI product and architecture contract
- [`docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`](docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md) — Claude execution overlay for the canonical master build
- [`docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`](docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md) — Perplexity MCP research + bounded-execution overlay for the canonical master build
- [`docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`](docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md) — Product Design parallel-build contract for product/UX work
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — OpenAI, Anthropic, Perplexity, GitHub, Supabase, and tool handoffs
- [`docs/CLOUDFLARE_REASONING.md`](docs/CLOUDFLARE_REASONING.md) — deterministic Cloudflare OODA/L99 recovery contract

Provider overlays may become stricter, but they do not become competing product constitutions. The canonical master build spec remains the product/architecture source of truth, while repository and task-specific authority, privacy, verification, Product Design, fact-check, and rollback contracts remain additive gates.

## Strategy and research

- [`docs/industry-signals/ai-tooling-under-the-radar-2026.md`](docs/industry-signals/ai-tooling-under-the-radar-2026.md) — canonical ten-trend AI-tooling research brief
- [`docs/strategy/PORTFOLIO_SIGNALS_2026.md`](docs/strategy/PORTFOLIO_SIGNALS_2026.md) — repo-by-repo portfolio map spanning Beauty, AI Tooling, Mobile Dev, and agentic commerce

The shared founder stack is:

```text
/garyvee lindymode redteam l99 redteam ooda
```

The first redteam attacks the premise. The second attacks the selected plan. Provider instructions may become stricter for this repository, but they may not weaken founder approval, privacy, security, provenance, rollback, or truthfulness.

## Cloudflare reasoning

The Control Room now exposes a read-only provider reasoning contract:

```text
:cloudflare reason <project>
```

```http
GET  /cloudflare/contract
POST /cloudflare/:slug/reason   # founder session required
```

It evaluates desired commit, Worker deployment, Pages deployment or release marker, runtime health, credential errors, evidence freshness, and deployment authority. It returns Reality, Redteam I, Lindy, L99, Redteam II, OODA, and Bill Gates views.

It cannot deploy, change DNS, rotate secrets, merge, or roll back. Those remain separate founder gates. A reasoning engine with production write access would merely be a command-line séance with billing consequences.

## Current phase

**Phase 1 — GitHub-compatible, not GitHub-dependent.**

We implement the `RepositoryProvider` interface first against GitHub (since
Bip already lives there), so nothing else in the Control Room needs to know
where a repository actually lives. Later providers (`InternalGitProvider`,
`ForgejoProvider`, `LocalGitProvider`) can be swapped in without touching
callers.

### MCP Hub Phase 1

Founder Control Room now includes a zero-budget, read-only MCP policy layer for
active portfolio projects. It declares GitHub, Playwright, Figma, and Supabase
Development capability slots; every server remains disabled until its endpoint
is configured locally.

The Hub provides founder-only server discovery, capability inspection, policy
preview, and read-only invocation. It records redacted hashes and structural
evidence rather than raw tool payloads. Repository writes, database mutations,
publishing, integration, deployment, and rollback remain separately approval-
gated.

See [`docs/MCP_HUB_PHASE_1.md`](docs/MCP_HUB_PHASE_1.md).

## Structure

```text
src/
  config/
    portfolio.ts             # active portfolio and quarantine registry
  providers/
    RepositoryProvider.ts    # provider-agnostic interface
    GitHubProvider.ts         # first implementation (Octokit-based)
    RepositoryProviderFactory.ts # central provider normalization/construction
  terminal/
    registry.ts              # project-specific executable + argument allowlist
    runner.ts                # shell-free, exact-head process runner
  reasoning/
    cloudflare/              # deterministic provider evidence + OODA reasoning
  mcp/
    defaultRegistry.ts        # credential-free server declarations
    registry.ts               # server resolution and public views
    policy.ts                 # project/tool/risk/cost enforcement
    client.ts                 # constrained remote HTTP client
    hub.ts                    # capability cache, invocation, evidence
    safety.ts                 # stable hashes and secret-key rejection
  types/
    changeProposal.ts         # Change Proposal (PR-equivalent) types
    mission.ts                # Mission / verification-run types
  lib/
    supabaseClient.ts         # Control Room's own Supabase project (NOT Bip's), service-role key
    supabaseAuthClient.ts     # same project, publishable/anon key — auth-only calls
  http/
    server.ts                 # Express app: mounts founder-only routes (auth, projects, approvals, Cloudflare reasoning, MCP)
    middleware/
      requireFounder.ts       # verifies session JWT + founder_users allowlist
    routes/
      auth.ts                 # POST /auth/magic-link, GET /auth/callback
      projects.ts             # GET /projects/:slug (founder-only)
      approvals.ts            # reservation-first, exact-head approved actions
      terminal.ts             # guarded mission verification terminal
      cloudflareReasoning.ts  # provider reasoning contract + founder-protected reports
      mcp.ts                  # MCP discovery, preview, and invocation
  index.ts                    # bootstraps the HTTP server
supabase/
  migrations/
    0001_init.sql
    0002_enable_rls_and_founder_policy.sql
    0003_harden_functions.sql
    20260715_mcp_hub_phase1.sql # MCP declarations, policy, evidence
    20260717195000_guarded_terminal_and_schema_reconciliation.sql
scripts/
  verify-guarded-terminal-contract.mjs
  verify-local-workspace.mjs
artifacts/
  billgates/CONTROL_ROOM_TERMINAL_FIX.md
docs/
  LOCAL_WORKSPACE.md
  ARCHITECTURE.md              # full design doc + L99 authority model
  CLOUDFLARE_REASONING.md      # Cloudflare evidence, recovery, and approval contract
  MCP_HUB_PHASE_1.md           # least-authority MCP contract
```

The timestamped reconciliation migration upgrades the live legacy
`change_proposals` and `releases` tables in place, creates the action-idempotency
ledger and terminal audit table, and registers the private hair control repository.
It must not be applied until the exact Control Room PR head passes all required gates.

## Data boundary

This project talks to its **own** Supabase project — separate from
Se'kret Bip's database, trust boundary, and service-role key. The Control
Room receives curated, sanitized operational events from Bip; it never
queries Bip's database directly with broad credentials.

## Setup

```bash
npm install
cp .env.example .env   # fill in GITHUB_TOKEN and SUPABASE_SERVICE_ROLE_KEY
npm run dev            # starts the API on :8787 (or $PORT)
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are already filled in `.env.example` —
they're public-safe values for this project (ref `oojzfmmywbvficgybaxd`), not secrets.

**One manual dashboard step required before magic links work:** in the Supabase
dashboard for this project, go to Authentication → URL Configuration → Redirect
URLs, and add `http://localhost:8787/**` (and your real deployed URL once you have
one). Supabase silently drops `emailRedirectTo` if it isn't on this allowlist.

## Production deployment

Production does not deploy on a push or merge. The manual
`.github/workflows/deploy.yml` workflow requires both the exact current `main`
SHA and an auditable `deployment_approval_id`. Its authority job checks that required Supabase, Cloudflare, Worker, and
smoke-test configuration values are present before any migration can run.
Later migration, Worker, and smoke-test stages perform the actual provider and
runtime validation before release evidence is complete. Only then may it preview
and push migrations, install the
required encrypted Worker secrets, deploy the exact approved SHA, and run the
health, version, guardrail, and reconciliation checks.

The production workflow writes Founder Signal auto-distribution as disabled by
default and requires `/version` to read back a nested
`founderSignalAutomationGrant` object with
`{"configured": true, "enabled": false}`. Repository configuration is not live
runtime proof; the retained deployment and smoke evidence remains authoritative.

## Founder sign-in (magic link)

```bash
# 1. Request a magic link (only sends if the email is in founder_users)
curl -X POST http://localhost:8787/auth/magic-link \
  -H 'content-type: application/json' \
  -d '{"email":"mcgill.raylene@gmail.com"}'

# 2. Click the link in the email. The fragment callback bridge posts the
#    credentials to /auth/session, writes the HttpOnly session cookie, and
#    returns to /. A token_hash callback instead verifies the token and
#    redirects to /control-room/.

# 3. API clients may exchange verified access and refresh tokens through
#    POST /auth/session, then use the resulting session or a Bearer token on
#    founder-only routes.
curl http://localhost:8787/projects/sekret-bip \
  -H 'authorization: Bearer <access_token>'
```

`GET /projects/:slug`:
- requires a valid founder session checked against `founder_users`;
- reads the project's registry row;
- fetches live repository state through its `RepositoryProvider`;
- logs the read as an audited event.

`public/control-room/` is the static, mobile-first founder UI. In production,
Cloudflare's Worker assets binding serves it at `/control-room/`; local Node runs
may serve the same directory when static mode is enabled. `/auth/callback` serves
the same-origin implicit-flow bridge when credentials arrive in the URL fragment.
That bridge posts them to `/auth/session`, writes the HttpOnly founder cookie,
and returns to /. With a `token_hash`, the server verifies the token, writes the
cookie, and redirects to `/control-room/` with a fragment for the SPA. The
guarded terminal remains an authenticated
API surface, not an interactive browser shell.

## Guarded founder terminal

The terminal is disabled unless all of these are true:

- `CONTROL_ROOM_TERMINAL_ENABLED=true`;
- the request carries a valid founder session;
- the request comes from loopback, unless remote access was separately enabled;
- `CONTROL_ROOM_WORKSPACE_ROOT` contains the reviewed project checkout;
- the command ID is present in the project-specific registry;
- the requested commit matches the mission policy snapshot;
- the checkout's current HEAD still equals that exact commit;
- the command risk is allowed in the mission's current state.

It never accepts shell strings, caller-provided executables, caller-provided
arguments, pipes, redirects, or caller-provided environment variables.

A local workspace is required when private GitHub-hosted runners cannot execute.
Use [`docs/LOCAL_WORKSPACE.md`](docs/LOCAL_WORKSPACE.md) and run:

```bash
CONTROL_ROOM_WORKSPACE_ROOT=/absolute/path/to/workspace npm run verify:local-workspace
```

A passing local-workspace preflight is not mission evidence. It only proves the
private sibling checkouts are clean, exact-head, and safe enough for guarded
loopback terminal execution.

```bash
# List approved commands
curl http://localhost:8787/terminal/untold-stories/commands \
  -H 'authorization: Bearer <access_token>'

# Run one exact-head mission check
curl -X POST http://localhost:8787/terminal/untold-stories/run \
  -H 'authorization: Bearer <access_token>' \
  -H 'content-type: application/json' \
  -d '{
    "missionId":"<mission-uuid>",
    "commandId":"verify.playwright",
    "expectedCommitSha":"<40-character-head-sha>"
  }'
```

Each run records the founder, project, mission, approved command, exact commit,
start/end time, exit status, bounded redacted output, and evidence kind. One run
per project may be active at a time. Truncated output is retained as warning
evidence but cannot satisfy a proof gate.

Approved branch or merge actions are reserved in `approval_executions` before the
provider call. A pending reservation blocks automatic replay when the provider may
have succeeded but ledger finalization was interrupted. Merge separately requires
a fresh proof gate, complete exact-head machine evidence, and a final immutable-ref
check immediately before integration.

## L99 authority model (summary)

| Action | Approval |
|---|---|
| Read project or approved command list | Founder-authenticated read |
| Run a mission verification command | Explicit founder request |
| Install dependencies or browsers | Explicit write-risk confirmation |
| Create sandbox workspace | Separate founder approval |
| Create internal branch | Separate founder approval + reservation |
| Integrate into main | Standing evidence-based merge authority + exact-head machine proof + reservation |
| Deploy | Separate founder approval |
| Rollback | Separate founder approval |

No approval carries forward to a separately gated next step. Standing merge authority does not authorize deployment, migration, auth/RLS, credentials, publication, billing, destructive actions, or rollback.

## License

Copyright © 2024–2026 Juss Ray. All rights reserved. Proprietary software — see [LICENSE](LICENSE).