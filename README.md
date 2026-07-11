# Founder Control Room

Standalone, provider-independent Control Room for managing Se'kret Bip and future
projects — repository-agnostic, GitHub-optional, founder-approval-gated.

## Why this exists

GitHub is a host and workflow platform built on top of Git. This project keeps
the *useful properties* (versioned source control, branches, diffs, review,
CI evidence, rollback, audit trail) without requiring GitHub specifically —
and without living inside the Bip app repo it manages.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and the
phased no-GitHub migration plan.

## Current phase

**Phase 1 — GitHub-compatible, not GitHub-dependent.**

We implement the `RepositoryProvider` interface first against GitHub (since
Bip already lives there), so nothing else in the Control Room needs to know
where a repository actually lives. Later providers (`InternalGitProvider`,
`ForgejoProvider`, `LocalGitProvider`) can be swapped in without touching
callers.

## Structure

```
src/
  providers/
    RepositoryProvider.ts   # provider-agnostic interface
    GitHubProvider.ts        # first implementation (Octokit-based)
  types/
    changeProposal.ts        # Change Proposal (PR-equivalent) types
    mission.ts                # Mission / verification-run types
  lib/
    supabaseClient.ts         # Control Room's own Supabase project (NOT Bip's), service-role key
    supabaseAuthClient.ts     # same project, publishable/anon key — auth-only calls
  http/
    server.ts                 # Express app: mounts /auth and /projects
    middleware/
      requireFounder.ts        # verifies session JWT + founder_users allowlist
    routes/
      auth.ts                  # POST /auth/magic-link, GET /auth/callback
      projects.ts               # GET /projects/:slug (founder-only)
  index.ts                     # bootstraps the HTTP server
supabase/
  migrations/
    0001_init.sql              # founder Control Room schema
    0002_enable_rls_and_founder_policy.sql  # RLS on all tables + founder_users + is_founder()
    0003_harden_functions.sql   # search_path pin + tighter execute grants on is_founder()
docs/
  ARCHITECTURE.md              # full design doc + L99 authority model
```

## Data boundary

This project talks to its **own** Supabase project — separate from
Se'kret Bip's database, trust boundary, and service-role key. The Control
Room receives curated, sanitized operational events from Bip; it never
queries Bip's database directly with broad credentials.

## Setup

```bash
npm install
cp .env.example .env   # fill in GITHUB_TOKEN and SUPABASE_SERVICE_ROLE_KEY (secrets — not committed)
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
- requires a valid founder session (checked against `founder_users`, not just any
  logged-in Supabase user)
- reads the project's own registry row from the `projects` table
- fetches live repo state through whatever `RepositoryProvider` that project's
  `repo_provider` maps to (GitHub today, via `GITHUB_TOKEN`)
- logs the read to `project_events` as an audited `project_read` event

There's no Control Room frontend yet, so `/auth/callback` returns the session as
JSON instead of redirecting into a UI — swap that once one exists.

## L99 authority model (summary)

| Action | Approval |
|---|---|
| Read project | Allowed during discussion |
| Create sandbox workspace | Founder approval required |
| Create internal branch | Founder approval required |
| Integrate into main | Separate founder approval required |
| Deploy | Separate founder approval required |
| Rollback | Separate founder approval required |

No approval carries forward to the next step.
