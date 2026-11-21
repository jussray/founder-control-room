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
proof gate, which re-verifies `policy_snapshot.expectedHeadSha`; executes a
real merge (real `POST .../merges` call); and the fake repository's actual
default branch contains the merged content afterward. Plus: an Agent
Council round, a cost entry, and an MCP connector with an authority level
and a health check — all through real route handlers.

It also proves the **guarded terminal** (`src/terminal/`) for real: a
second project (`founder-control-room`) is registered, its mission's
sandbox branch is created for real against a *second* fake repo whose
initial commit is seeded to this actual checkout's real
`git rev-parse HEAD` — not a fake sha — so that when the mission's
`expectedHeadSha` gets pinned through the ordinary create_branch flow, it's
pinned to a real, independently-verifiable value. The harness then drives
the real terminal UI to run `git.head` (`git rev-parse HEAD`, read-risk)
against `CONTROL_ROOM_WORKSPACE_ROOT`, which is this real repo's own real
parent directory — a real `git` child process spawns for real
(`src/terminal/runner.ts`), and its real stdout (the real HEAD sha) comes
back through the real UI. No shell command is faked anywhere in this path;
only the branch's provenance (how `expectedHeadSha` got pinned) goes
through the same fake-GitHub mechanism used everywhere else in this
harness.

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
7. **`policy_snapshot.expectedHeadSha` was only ever written at merge-gate
   convergence — never at `create_branch`, when a mission's sandbox and its
   commit are actually established.** Two real consequences, not one:
   - `MissionController`'s own drift check (`wrongHead`) compares incoming
     evidence against this pin, but during the entire `sandboxed`/`in_review`
     phase the pin was always `null` — the check was permanently vacuous,
     never actually verifying anything until after the mission was already
     approved.
   - The guarded terminal (`POST /terminal/:slug/run`) hard-requires this
     pin to exist while the mission is still `sandboxed`/`in_review` — a
     status range `expectedHeadSha` could never reach under the old code.
     No mission, ever, could satisfy the terminal's precondition for a
     read or verify-risk command.

   Fixed by pinning `expectedHeadSha` to the branch's real resolved head the
   moment `create_branch` executes (`src/http/routes/approvals.ts`). Fixing
   only that, though, surfaced an eighth bug in the same area:
8. **Re-pinning only at branch creation broke evidence attribution for any
   commit after the first.** `CheckRunController` only attaches an incoming
   CI webhook's evidence to a mission when the webhook's `head_sha` matches
   the *current* pin (a deliberate, correct anti-spoofing check — it's what
   stops evidence for an unrelated commit from being credited to this
   mission). Since nothing updated the pin when the founder committed a
   further edit via `POST /:missionId/patch`, that edit's own CI evidence
   silently got `mission_id: null` and never reached `MissionController` at
   all — this harness's own step [6d] regressed the instant bug #7 was
   fixed, which is exactly how this was caught. Fixed by re-pinning
   `expectedHeadSha` to the new commit inside `/:missionId/patch` too.
9. **The guarded terminal's run result was erased before it could ever be
   seen.** `guarded()` (`public/control-room/app.js`) unconditionally
   re-renders the entire app shell after every action, including a
   terminal run — but the run's result was written straight into the DOM
   inside the submit handler, not into `state`. The very next line
   (`guarded`'s own post-action `render()`) rebuilt the terminal tab from
   scratch and threw it away. A human clicking "Run" would never see their
   own command's output; Playwright's polling caught it as an empty
   `#terminal-run-result` no matter how long it waited. Fixed by tracking
   `state.terminal.selectedCommandId` and `state.terminal.lastRun` and
   rendering the result from state, the same way every other panel in this
   app already has to.

Also surfaced, and worth knowing even though it isn't a bug: **the frontend
has no live refresh.** A mission that transitions status asynchronously
(via the background reconciler reacting to a webhook) will never appear
updated in the browser until something re-fetches — there's no polling or
websocket. The harness's `waitForMissionStatusByPolling()` works around
this the way a founder would have to: click Refresh, reopen the mission.

## What this does NOT prove

Anything requiring a real Supabase or Cloudflare account (production auth,
deployment, migrations), and the guarded terminal's *write*-risk and
*verify*-risk command paths (only a read-risk command — `git.head` — is
exercised here; write-risk additionally requires `confirmWrite: true` and a
stricter `sandboxed`-only status window, and verify-risk commands like
`npm test` would need real dependencies installed, which this harness
doesn't attempt). Real founder credentials and a real production
environment need the founder's own account access — those cannot be faked
without pretending to have authority nobody granted.

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
