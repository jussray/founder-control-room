# Architecture: Standalone Founder Control Room

## The long-term shape: Control Room OS, not a Bip dashboard

Don't optimize this for Bip. Optimize for the next 10 years. Bip is
Project #1 in the registry, not the center of the schema or the code.

```
Control Room OS
│
├── PromptOS
├── Repo Brain
├── Agent Council
├── Mission Engine
├── Approval Engine
├── Bench
├── Project Registry
├── Release Center
├── Analytics
├── Knowledge Graph
└── Plugin/MCP Hub
        │
        ├── Se'kret Bip
        ├── Juss Beautiful Hair
        ├── Think Tank
        ├── Future Startup #4
        └── Future Startup #5
```

**The governing question for every schema/architecture decision:** would
this still make sense if 25 products were connected? If yes, it's probably
the right long-term call. Concretely, that means:

- Every table and interface uses `projectId` — never `bipId` or a
  Bip-specific name.
- New products register into `projects` / `project_connections` instead of
  the Control Room being hardcoded for one app.
- `RepositoryProvider`, `AgentRun`, `Mission`, `ChangeProposal` — none of
  them know or care which specific product they're operating on.

## The distinction

- **Git** = version-control technology.
- **GitHub** = one commercial host and workflow platform built around Git.

Removing GitHub is sensible. Removing version history, branches, diffs,
rollback, and reproducible builds is not — that's "developing software from
memory."

## GitHub jobs → standalone replacements

| GitHub job | Standalone replacement |
|---|---|
| Repository hosting | Internal bare Git repositories (or a self-hosted forge) |
| Branches and commits | Native Git |
| Pull requests | Control Room Change Proposals |
| Code review | Council review threads |
| GitHub Actions | Isolated Control Room runners |
| Codespaces | Disposable development containers |
| Issues | Control Room missions and incidents |
| Webhooks | Internal event bus |
| Releases | Control Room release ledger |
| Deploy approvals | Founder approval engine |
| Artifacts | Object storage (e.g. R2) |
| Audit trail | Supabase mission ledger (this project's own DB) |

## Provider-independence (Phase 1 — where we are now)

```ts
interface RepositoryProvider {
  getProject(projectId: string): Promise<ProjectRepo>;
  readFile(ref: string, path: string): Promise<string>;
  createBranch(baseRef: string, name: string): Promise<void>;
  commitPatch(branch: string, patch: Patch): Promise<string>;
  compare(base: string, head: string): Promise<Diff>;
  integrate(base: string, head: string): Promise<string>;
}
```

`GitHubProvider` is the first implementation, because Bip already lives on
GitHub. Nothing else in the Control Room talks to GitHub directly — every
caller goes through `RepositoryProvider`. Future providers
(`InternalGitProvider`, `ForgejoProvider`, `LocalGitProvider`) slot in without
touching callers.

## Phased migration plan

1. **Phase 1 — GitHub-compatible, not GitHub-dependent.** Build the adapter.
   Implement `GitHubProvider`. (This repo, right now.)
2. **Phase 2 — Mirror Bip into a private internal Git.** Run read-only
   council/sandbox verification from the mirror. GitHub remains source of
   truth temporarily.
3. **Phase 3 — Make internal Git authoritative.** Internal Git becomes source
   of truth; GitHub becomes an optional mirror.
4. **Phase 4 — Remove GitHub.** Only once backups, CI, change proposals,
   deploys, rollback, and disaster recovery are all proven internally.

Do not delete GitHub first. Prove the standalone workflow first, then demote
GitHub from requirement to optional connector.

## Data boundary: two separate Supabase projects

```
Se'kret Bip Supabase                    Standalone Control Room Supabase
├── teen and parent accounts            ├── founder authentication
├── journals and private content        ├── connected projects
├── Circle and Crew data                ├── PromptOS templates + versions
├── app audit_events                    ├── council conversations
├── app release/runtime signals         ├── agent missions and runs
└── user-owned product data             ├── founder approvals
                                         ├── CI evidence
                                         ├── repo indexes
                                         ├── change proposals
                                         ├── agent costs
                                         └── Control Room issue copies/summaries
```

**Why separate, not shared:**

1. **Different trust boundaries.** Bip serves teens and parents; the Control
   Room serves the founder and privileged automation. A compromised Control
   Room integration must never gain unrestricted access to journals, voice
   notes, identities, or parent-sharing data.
2. **Founder tooling needs broader permissions** (store agent outputs, manage
   missions, receive CI events, index repositories, record approvals) that
   are unrelated to — and shouldn't be mixed into — the consumer app's RLS
   surface.
3. **Independent migrations.** A Control Room migration failure must never
   break the teen app, and vice versa.
4. **Independent failure radius.** Agent loop bugs, runaway event ingestion,
   oversized repo indexes, bad migrations, or billing trouble in the Control
   Room should never take Bip down.
5. **Future expansion.** The Control Room will eventually manage more than
   Bip (Juss Beautiful Hair, other repos, Shopify, Cloudflare projects). It
   shouldn't be structurally owned by the first project it manages.

**Data flow for existing `audit_events` / `control_room_releases` in Bip's
DB:** do not move them. Keep them as Bip's own source of truth. Send a
sanitized, allowlisted copy into this project's `project_events` table via a
signed ingestion endpoint — operational metadata only (event type, severity,
screen, provider, model, decision, latency), never raw journal content, teen
messages, voice transcripts, names, emails, or parent summaries.

**Authentication:** a separate founder auth identity in this Supabase
project — not shared session/role boundary with Bip's consumer auth, even if
it's the same person logging in.

## Replacing GitHub Actions: the runner loop

```
Mission approved
      ↓
Create disposable container
      ↓
Checkout exact commit
      ↓
Apply approved patch
      ↓
Run project verification profile
      ↓
Store logs and artifacts
      ↓
Return signed result
      ↓
Destroy container
```

The agent's claim is not evidence. The runner result is evidence.

## Replacing pull requests: Change Proposals

You don't need pull requests specifically. You need their useful properties:
a proposed change, a frozen diff, review comments, test evidence, approval,
merge history. See `src/types/changeProposal.ts`.

Actions on a Change Proposal:
- Approve integration
- Request revision
- Run another council round
- Reject and delete branch

## OODA loop without GitHub

- **Observe** — repository changes, verification results, runner logs,
  Cloudflare/Supabase health, release metrics arrive as `project_events`.
- **Orient** — Repo Brain / Redteam / council agents classify regressions,
  security issues, failed builds, model drift, privacy concerns.
- **Decide** — the Control Room proposes: debate further, prepare a sandbox
  patch, revise, integrate, deploy, or roll back. The founder authorizes the
  exact boundary.
- **Act** — internal Git and runners execute only what was approved.

## L99 authority model

| Action | Approval |
|---|---|
| Read project | Allowed during discussion |
| Create sandbox workspace | Founder approval required |
| Create internal branch | Founder approval required |
| Integrate into main | **Separate** founder approval required |
| Deploy | **Separate** founder approval required |
| Rollback | **Separate** founder approval required |

No approval carries forward to the next step.

## What gets harder without GitHub (redteam)

Removing GitHub removes a dependency but adds responsibilities: repository
backups, credential rotation, commit integrity, runner isolation, artifact
retention, audit logs, branch protection, disaster recovery, concurrent
change handling, repository corruption recovery, failed-deployment recovery,
external contributor access. GitHub quietly handles all of this today — plan
for it explicitly before Phase 4, not after.

The worst architecture is the Control Room editing a shared folder directly,
with no immutable commits, no branches, and no reproducible runner. That
isn't independence — it's one accidental overwrite from folklore.
