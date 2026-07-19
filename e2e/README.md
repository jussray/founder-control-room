# End-to-end proof harness

`npm run test:e2e` boots the **real compiled server** (`dist/index.js`,
unmodified route/controller code, real Express middleware, real static
frontend at `public/control-room/`) and drives it with a **real headless
Chromium** via Playwright. Two external providers are substituted at the
network/process boundary with faithful in-memory fakes — nothing at the
route/controller/browser level is mocked:

- **Supabase**: a Node ESM loader (`loader.mjs`) redirects
  `src/lib/supabaseClient.ts` / `supabaseAuthClient.ts` to
  `fakeSupabaseClient.mjs` / `fakeSupabaseAuthClient.mjs` — an in-memory
  PostgREST-shaped query builder plus the RPCs the real reconciler uses
  (`try_acquire_controller_lease`, `claim_outbox_work`, etc.), so the real
  background scheduler (2s outbox poll) actually runs.
- **GitHub**: `fakeGitHubServer.mjs` is a real local HTTP server
  implementing exactly the Octokit REST calls `GitHubProvider` makes
  (verified against that file, not guessed) — repo info, branches, git
  blobs/trees/commits/refs, contents, merges — backed by a tiny in-memory
  git-shaped model. `GitHubProvider` gets pointed at it via
  `GITHUB_API_BASE_URL`, an Octokit constructor option that's additive and
  never set in production.

## What this proves

Through the real served UI: the founder signs in via the real magic-link →
`/auth/callback` redirect handshake; registers a project with a real repo
identifier; creates a mission with required checks and an assigned
multitool builder/reviewer agent; creates its sandbox branch (real
branch-create call); edits a file and commits it (real
blob/tree/commit/updateRef calls); a real signed CI webhook
(`X-Hub-Signature-256`) advances the mission to `in_review` through the
real background reconciler (webhook → `CheckRunController` → evidence →
`MissionController` → status transition, no shortcuts); runs the merge
proof gate, which pins `policy_snapshot.expectedHeadSha`; executes a real
merge (real `POST .../merges` call); and the fake repository's actual
default branch contains the merged content afterward. Plus: an Agent
Council round, a cost entry, and an MCP connector with an authority level
and a health check — all through real route handlers.

## Real bugs this harness caught (in the order it caught them)

1. **`el()` truncated multi-panel templates.** It returned only
   `template.content.firstElementChild`, silently dropping every other
   top-level sibling. Broke the Projects, Missions, PromptOS, and Terminal
   tabs — e.g. clicking a mission card threw because `#mission-detail` was
   never actually in the DOM. No vitest/supertest test could catch this;
   none of them render into a real DOM. Fixed by returning the parsed
   `DocumentFragment` instead.
2. **Blank form fields defeated backend defaults.** The create-branch form
   sent `branchName: ''` instead of omitting it, and the backend's
   `?? 'main'` / `?? mission/<id>` fallback only triggers on `undefined` —
   an empty string isn't nullish. Would have created a branch/ref with an
   empty name. Fixed with a `withoutBlanks()` filter before every optional
   field is sent.
3. **The proof-gate form hardcoded `filesChanged`/`checksRun` to `[]`.**
   The gate unconditionally rejects empty evidence of either kind — merge
   could never pass through the shipped UI, period. Fixed by adding real
   input fields for both.
4. **Nothing in the entire codebase ever wrote
   `missions.policy_snapshot.expectedHeadSha`**, which the merge-execution
   route unconditionally requires to match before merging anything. This
   predates this session — every mission ever created by any part of this
   system was structurally unable to complete a merge. Fixed by resolving
   and pinning the branch's exact head SHA when the merge proof gate
   converges (`POST /:missionId/run-proof-gate`).
5. **The proof-gate and execute-merge forms were nested inside the wrong
   status conditions.** The `create_branch` gate must run *before* the
   branch exists (mission still `proposed`), but the form was hidden until
   *after* branch creation — unreachable. The merge form was nested inside
   `sandboxed`/`in_review` only, but disappeared the moment the mission
   reached `approved` — hidden exactly when it was needed. Fixed by
   splitting `canRunProofGate` (proposed/sandboxed/in_review) from
   `editable` (sandboxed/in_review, file editing) from the merge form's own
   `status === 'approved'` condition.
6. **Missions had no way to set `required_checks`.** Without at least one
   required check kind, `MissionController` refuses to evaluate evidence at
   all — a mission created through the shipped UI could never leave
   `sandboxed`. Fixed by exposing `requiredChecks` on
   `POST /projects/:slug/missions`.

Also surfaced, and worth knowing even though it isn't a bug: **the frontend
has no live refresh.** A mission that transitions status asynchronously
(via the background reconciler reacting to a webhook) will never appear
updated in the browser until something re-fetches — there's no polling or
websocket. The harness's `waitForMissionStatusByPolling()` works around
this the way a founder would have to: click Refresh, reopen the mission.

## What this does NOT prove

The guarded terminal (executes real shell commands against a real
checked-out workspace — different infrastructure than an HTTP API fake),
and anything requiring a real Supabase or Cloudflare account (production
auth, deployment, migrations). Those need the founder's own
credentials/infrastructure and cannot be faked without pretending to have
authority nobody granted.

## Running it

```bash
npm run test:e2e
```

Requires the pre-installed Chromium at `/opt/pw-browsers` (already present
in this environment) and a writable `e2e/.auth-bridge.json` (gitignored,
recreated each run) — the file the fake auth client uses to hand its
in-flight token_hash to the driver process, simulating "click the link in
your inbox" without a real mailbox.

A rare intermittent retry may print `"gateId select got reset by a late
re-render before submit — retrying the whole fill"` — this app re-renders
its entire shell on every action, and a DOM click handler's async chain
isn't awaited by Playwright's `page.click()`, so a prior click's straggling
render can occasionally land mid-fill of a later form. The harness retries
the whole fill+submit as one unit rather than chasing the individual race;
it has not been observed to need more than one retry.
