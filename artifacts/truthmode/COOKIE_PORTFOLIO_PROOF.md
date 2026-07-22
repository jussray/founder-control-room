# Truthmode — Cookie Portfolio Proof

## Contract inventory

```text
repositories covered: 7
first-party cookies declared: 3
sensitive first-party session cookies: 2
provider-owned cookie boundaries: Cloudflare Access, Stripe Checkout, Shopify
critical reconstructed invariants: 13 / 13 passed
```

First-party cookies:

1. `fcr_session` — Founder Control Room, sensitive server session.
2. `sidebar_state` — public hair, non-sensitive UI preference.
3. `__Host-untold_session` — Untold Stories, sensitive Hydrogen server session.

Cookie-free repositories:

- Se’kret Bip;
- L99 StoryEngine;
- Chief AI Machine;
- JBH Private origin code.

JBH Private relies on provider-owned Cloudflare Access `CF_Authorization`; the origin validates `Cf-Access-Jwt-Assertion` and does not read or reissue the cookie.

## Reconstructed proof executed in this session

An independent contract harness validated:

- Founder cookie is HttpOnly, SameSite=Strict, Secure for production or HTTPS deployments, and private/no-store;
- Founder cookie-authenticated mutations require exact origin;
- L99 no longer writes its API key into `document.cookie` and uses an explicit request header;
- public hair declares only the seven-day `sidebar_state` preference;
- Untold uses `__Host-untold_session` on HTTPS, HttpOnly, SameSite=Lax, and no-store session commits;
- JBH validates the Access assertion header and does not inspect `CF_Authorization`;
- every guarded-terminal project slug is unique and maps to a cookie verification command.

Result:

```text
13 checks passed
0 checks failed
```

## Live Supabase observation

Founder Control Room's live `projects` table contains active verification rows for:

- `founder-control-room`;
- `sekret-bip`;
- `l99`;
- `chief-ai-machine`;
- `juss-beautiful-hair`;
- `untold-stories`.

`juss-beautiful-hair-private` is not present in the live table. Its command is source-registered but cannot run through the mission route until the reviewed guarded-terminal reconciliation migration is applied and verified. No ad hoc production insert was performed.

## GitHub mirror evidence

New dependency-free cookie mirror workflows were created. On Se’kret Bip, Chief AI, public hair, Untold Stories, and JBH Private, each exact-head cookie job completed as failure with `steps: null`. The L99 promotion job showed the same zero-step state and no downloadable log.

Classification: **runner startup / infrastructure failure**.

This is not a code verdict and cannot satisfy exact-head proof.

## Evidence limitations

- The reconstructed harness is not byte-for-byte repository execution.
- GitHub Actions did not execute checkout or verifier steps.
- Founder Control Room is not deployed or enabled as a terminal runner.
- No production provider configuration, cookie, user session, schema, deployment, or migration was changed.

## Gate

Keep every PR draft and unmerged until the exact final heads run their repo-local verifiers with real steps and logs. Apply the guarded-terminal reconciliation migration only through its existing approval gate, then use Founder Control Room to produce immutable exact-head evidence and mirror the result to GitHub.
