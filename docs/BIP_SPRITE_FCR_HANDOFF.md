# FCR → Se’kret Bip governed Sprite dispatch

Authority: Founder Control Room. Execution target: existing private Sprite `sekret-bip-governed-proof`.
This is **not** a teen or guardian app capability and does not create a public agent endpoint.

## Existing runtime boundary

- Bip Sprite accepts only fixed missions `repo-truth`, `agent-contract`, and `companion-contract`.
- The Sprite is private to administrators with deny-all network rules, separate from FCR compute.
- Family records, sessions, messages, provider credentials, and arbitrary commands must not enter it.
- FCR runs only on a verified `main` workflow_dispatch by `jussray`. Other actors and refs fail closed.
- FCR validates both current main and the exact live head of Bip's existing governance branch.
- Live execution requires Production environment `SPRITES_TOKEN` plus approval variables `BIP_SPRITE_APPROVED_SHA` and `BIP_SPRITE_APPROVED_MISSION` matching the request.
- The manual `execute` checkbox must be true. Dry run does not invoke Sprites or need its credential.
- FCR checks Sprite identity and network policy, generates a unique 128-bit invocation identifier, sends a fixed command, reads the matching invocation-specific private receipt, and rechecks deny-all network. It does not trust an HTTP 200 or a previous same-SHA receipt as proof.
- The workflow writes a sanitized SHA/mission/result/fingerprint receipt before claiming success and retains it as a short-lived Actions artifact; no raw Sprite output, credential, or family data enters this artifact.
- Proof explicitly has no merge, deployment, provider-write, or user-data authority.

## Setup and activation boundary

Place `SPRITES_TOKEN` only in FCR GitHub Actions Production environment secrets, with an approved organization-scoped Sprites API token. Do not paste it in chat or files.
Bind each live run to exact `BIP_SPRITE_APPROVED_SHA` and `BIP_SPRITE_APPROVED_MISSION` Production environment variables, and require appropriate environment reviewer authorization.
Apply this candidate to FCR production only after code review, exact-head Actions and real-path verification.
The private Sprite clean isolated worktree at `/home/sprite/bip-governed-proof` must first be synchronized to the exact approved GitHub SHA by a separately authorized source-read operation, restoring deny-all network afterward. This worktree is separate from `/home/sprite/bip-source`, which may contain unrelated edits. Otherwise the runner will reject the request.
Current pull request #1054 is a candidate only: do not claim this dispatch is live or that it fixes Se’kret PR #615, Supabase migration lineage or Cloudflare CI credentials.

## Rollback

Revert only the focused FCR dispatcher changes and disable the manual workflow. The private Sprite state is checkpointed; no production service or database schema change is required.
