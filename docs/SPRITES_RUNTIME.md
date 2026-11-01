# FCR-governed Sprite execution: project canon

This is an **FCR-owned capability**, not a ChatGPT-only manual process. For every
eligible FCR investigation, prefer an existing authorized Sprite over a new host,
branch, PR, duplicate AI agent, or unconstrained terminal. Never claim an
external assistant's Sprite tool session is equivalent to FCR's own connectivity.

## Live names and ownership

- `fcr-governed-exec`: existing, private Sprite for bounded FCR repo observations.
- `fcr-production-proof`: existing, private Sprite reserved for production-oriented
  **read-only** proof after explicit authorization; not an execution fallback.
- Authority belongs to FCR's mission/terminal policy, not to a Sprite, agent,
  fingerprint, cookie, chat session, or HTTP-200 response.
- A project may use an equivalent independently authorized Sprite, but must keep
  its repo, branch/head, run ID, receipts, credentials, and policies separate.

## Committed integration

The optional `SpriteReadOnlyRunner` is selected on the server by
`CONTROL_ROOM_READ_ONLY_RUNNER=sprites` only with the existing founder-authenticated,
disabled-by-default guarded terminal boundary. Default is `local`; unknown modes
fail closed. The adapter uses the existing `fcr-governed-exec` management API,
and accepts only `git.head`, `git.status`, and `git.diff-stat` at an exact
40-character SHA for `jussray/founder-control-room`. Its Sprite-side entrypoint
is `scripts/sprites/read-only-terminal-stdio.cjs`, installed at the documented
private runner path. No free-form shell or repository-selected command.

For verification work (unit, integration, browser/Playwright, diagnosis), FCR
also owns a separate, opt-in CLI: `npm run sprite:verify -- <ref> <exact-sha>
<verify.access|verify.pages-proxy>`, implemented in
`scripts/sprites/dispatch-proof.mjs`. It invokes the fixed private
`fcr-governed-proof-stdio.cjs` script installed on the Sprite. The verifier
clones the single authoritative FCR repository into a fresh disposable
checkout, checks the requested SHA, and runs only preapproved checks. Browser
proof uses local Chromium and an in-memory Pages binding, **never** a claim
about live production. The receipt binds request, head, suite, fingerprint,
timestamps and explicit non-authorization; it is not a CI or deployment
receipt. The tests themselves may execute untrusted source, so this suite
must be run only in a separately isolated Sprite with no credentials exposed
to the checked-out repository. The CLI is for an already-authorized server
or founder-controlled workflow, not a public endpoint.

The legacy terminal adapter intentionally remains **read-only**. Source edits,
builds, repair, any deployment, or moving another branch remain separately
gated; a successful Sprite proof cannot approve itself.

## Activation and identity gates

1. Confirm Sprite identity, organization, private URL status, and network policy
   against provider readback. Keep the public URL disabled.
2. Provide the provider access token only through a dedicated server-side secret
   (`SPRITES_FCR_EXEC_TOKEN`); do not embed, log, or pass it into the Sprite.
3. Bind a dedicated approved mission, exact SHA, allowlisted command, and
   append-only `terminal_runs` record before dispatch.
4. Verify an actual authenticated FCR-to-Sprite request and exact receipt, not
   just local mocks, then confirm no secrets appear in logs/artifacts.
5. Only then opt in for read-only observation. Build, repair, browser automation,
   GitHub branch update, merge, deployment, or provider mutation remain separate,
   individually approved capabilities, never inherited from Sprite connectivity.

If any gate is unknown, classify the connection **BLOCKED**, do not retry a
possibly executing action blindly, and leave the old local behavior unchanged.
Do not overwrite existing Sprite workspace changes or destroy checkpoints.

## Repeatable /goalfix contract

Observe authoritative repo/main/PR and linked domain/Worker evidence; diagnose
the smallest failure; use the existing isolated Sprite; propose a reversible
patch only on the authorized existing branch; verify source + Playwright if UI
changes; preserve exact-head CI and reviewer approval as independent gates.
No green receipt, auto-merge, release, or production claim without evidence.

Rollback: unset `CONTROL_ROOM_READ_ONLY_RUNNER` to keep local default, or revert
the focused Sprite adapter commit. Restoring or destroying a Sprite checkpoint
requires separate explicit approval.
