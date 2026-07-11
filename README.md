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
    supabaseClient.ts         # Control Room's own Supabase project (NOT Bip's)
supabase/
  migrations/
    0001_init.sql              # founder Control Room schema
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
cp .env.example .env   # fill in GITHUB_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

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
