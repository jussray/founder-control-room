# Founder Control Room

---

## The real story

I couldn't afford a DevOps team, a QA engineer, a release manager, or a CTO.

So I built one.

This is the command center I run Se'kret Bip from — a provider-independent control plane with approval gates, change proposals, mission verification, and a guarded terminal that only executes exact, pre-approved commands against a confirmed repo HEAD.

Every action requires explicit founder approval. No step carries forward to the next. Built by a single mom of 8 in Pittsburgh, at $0, because the alternative was shipping blind.

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
- [`CLAUDE.md`](CLAUDE.md) — Claude / Claude Code repository instructions
- [`AGENTS.md`](AGENTS.md) — Codex, ChatGPT, and repository-agent instructions
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — OpenAI, Anthropic, Perplexity, GitHub, Supabase, and tool handoffs

The shared founder stack is:

```text
/garyvee lindymode redteam l99 redteam ooda
```

The first redteam attacks the premise. The second attacks the selected plan. Provider instructions may become stricter for this repository, but they may not weaken founder approval, privacy, security, provenance, rollback, or truthfulness.

## Current phase

**Phase 1 — GitHub-compatible, not GitHub-dependent.**

We implement the `RepositoryProvider` interface first against GitHub (since
Bip already lives there), so nothing else in the Control Room needs to know
where a repository actually lives. Later providers (`InternalGitProvider`,
`ForgejoProvider`, `LocalGitProvider`) can be swapped in without touching
callers.

## Tracked external app setup

- [`Story Engine`](docs/external-apps/STORY_ENGINE_META.md) is the Meta developer app container for Se'kret Bip Facebook/Instagram social integration setup.
- [`Playground`](docs/external-apps/PLAYGROUND_MODEL_API.md) is the Meta Model API / Muse Spark developer surface for direct model-response experiments.
- Control Room tracks both as external dependencies and evidence items only. It must not store Meta App Secret, Model API keys, long-lived access tokens, webhook verify tokens, Page tokens, Instagram credentials, raw prompts, raw model outputs, or any teen/private content.
- Current status: placeholder/configuration planning only. No production social API route, publishing workflow, webhook ingestion, account connection flow, provider routing, or model-response runtime is verified.
- Required gate before implementation: explicit founder approval, privacy boundary, least-privilege permission list or provider capability boundary, server-only secret storage, token/key rotation plan, webhook verification if used, reduced-data prompt policy if model APIs are used, and production evidence that does not expose private teen data.

## Structure

```text
src/
  providers/
    RepositoryProvider.ts   # provider-agnostic interface
    GitHubProvider.ts        # first implementation (Octokit-based)
  terminal/
    registry.ts              # project-specific executable + argument allowlist
    runner.ts                # shell-free, exact-head process runner
  types/
    changeProposal.ts        # Change Proposal (PR-equivalent) types
    mission.ts               # Mission / verification-run types
  lib/
    supabaseClient.ts         # Control Room's own Supabase project (NOT Bip's), service-role key
    supabaseAuthClient.ts     # same project, publishable/anon key — auth-only calls
  http/
    server.ts                 # Express app
    middleware/
      requireFounder.ts       # verifies session JWT + founder_users allowlist
    routes/
      auth.ts                 # POST /auth/magic-link, GET /auth/callback
      projects.ts             # GET /projects/:slug (founder-only)
      approvals.ts            # reservation-first, exact-head approved actions
      terminal.ts             # guarded mission verification terminal
  index.ts                    # bootstraps the HTTP server
supabase/
  migrations/
    0001_init.sql
    0002_enable_rls_and_founder_policy.sql
    0003_harden_functions.sql
    20260717195000_guarded_terminal_and_schema_reconciliation.sql
scripts/
  verify-guarded-terminal-contract.mjs
artifacts/
  billgates/CONTROL_ROOM_TERMINAL_FIX.md
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

## Founder sign-in (magic link)

```bash
# 1. Request a magic link (only sends if the email is in founder_users)
curl -X POST http://localhost:8787/auth/magic-link \
  -H 'content-type: application/json' \
  -d '{"email":"mcgill.raylene@gmail.com"}'

# 2. Click the link in the email. It redirects to:
#    http://localhost:8787/auth/callback?token_hash=...&type=magiclink
#    which responds with { access_token, refresh_token, founder: { email } }

# 3. Use the access_token as a Bearer token on founder-only routes
curl http://localhost:8787/projects/sekret-bip \
  -H 'authorization: Bearer <access_token>'
```

`GET /projects/:slug`:
- requires a valid founder session checked against `founder_users`;
- reads the project's registry row;
- fetches live repository state through its `RepositoryProvider`;
- logs the read as an audited event.

There's no Control Room web frontend yet, so `/auth/callback` returns the session
as JSON. The guarded terminal is an authenticated API surface, not an interactive
browser shell.

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
| Integrate into main | Separate founder approval + exact-head machine proof + reservation |
