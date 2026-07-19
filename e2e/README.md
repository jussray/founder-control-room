# End-to-end proof harness

`npm run test:e2e` boots the **real compiled server** (`dist/index.js`,
unmodified route/controller code, real Express middleware, real static
frontend at `public/control-room/`) and drives it with a **real headless
Chromium** via Playwright. The only substitution is at the process
boundary: a Node ESM loader (`loader.mjs`) redirects the two Supabase
client modules (`src/lib/supabaseClient.ts` and
`src/lib/supabaseAuthClient.ts`) to in-memory fakes (`fakeSupabaseClient.mjs`,
`fakeSupabaseAuthClient.mjs`) implementing the same query-builder chains
those modules expose — the same kind of substitution every vitest test in
this repo already does via module mocking, just exercised through a real
browser and a real running process instead of an in-process test runner.

## What this proves

The founder can, through the real served UI: sign in via the real
magic-link → `/auth/callback` redirect handshake, register a project,
create a mission, assign a multitool builder/reviewer agent, log an Agent
Council round and a cost entry, register an MCP connector with an
authority level, and record a connector health check — and every one of
those actions round-trips through the real route handlers.

This harness is also what caught a real bug: `el()` (the HTML-string
parser every render function uses) returned only `template.content.firstElementChild`,
silently discarding every other top-level sibling in any multi-panel
template. That broke the Projects, Missions, PromptOS, and Terminal tabs
in an actual browser — clicking a mission card threw because
`#mission-detail` was never in the DOM — while every mocked vitest/supertest
test kept passing, because none of them render into a real DOM. Fixed by
returning the parsed `DocumentFragment` instead.

## What this does NOT prove

Anything that needs a real GitHub token (file browse/edit, branch/merge
execution, terminal command runs) or a real Supabase/Cloudflare account
(production auth, deployment, migrations). Those need the founder's own
credentials and are out of scope for a harness that must not fabricate
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
