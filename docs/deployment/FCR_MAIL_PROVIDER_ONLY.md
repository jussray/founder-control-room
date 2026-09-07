# `fcr_mail` Provider-Only Worker Boundary

## Status

`fcr_mail` is a real Cloudflare Worker observed in provider state, but Founder Control Room does not currently own matching runtime source for that Worker.

That makes it **provider-real / source-orphaned**, not nonexistent and not a canonical repository-managed runtime.

The repository must not invent Worker code, routes, service bindings, assets, or a replacement `wrangler.jsonc` merely to make a connected Cloudflare build green.

## Native Workers Builds safety

Until `fcr_mail` is separately migrated into reviewed source or explicitly retired, its connected Git build is verification-only.

Use this deploy command in the `fcr_mail` Workers Builds configuration:

```text
node scripts/verify-fcr-mail-provider-only.mjs
```

Do not use plain:

```text
npx wrangler deploy
npx wrangler versions upload
```

for this provider-only Worker. Without an owned Wrangler runtime configuration, those commands can trigger Wrangler automatic configuration, infer `public/` as static assets, and attempt to reconcile dashboard state from generated local settings.

The verification-only command emits a sanitized receipt bound to the Cloudflare build UUID, branch, and exact Git SHA. It performs no Worker upload, production promotion, route change, service-binding change, secret mutation, DNS mutation, or asset publication.

## Separate canonical FCR surfaces

This boundary does not rename or replace the canonical repository-managed Cloudflare surfaces:

- `founder-control-room` API Worker via `wrangler.worker.toml`;
- `founder-control-room-review-email` via `wrangler.email.toml`;
- Founder Control Room Pages via `npm run build:pages` and `dist-pages`.

`fcr_mail` must not silently inherit the API Worker, review-email Worker, or Pages deployment contract.

## Migration / retirement gate

Before deciding to KEEP, MIGRATE, or RETIRE `fcr_mail`, reacquire fresh Cloudflare provider evidence for:

- active routes and hostnames;
- service bindings and their targets;
- traffic and error activity;
- currently deployed Worker identity/code provenance where available;
- secrets/bindings by name only, never secret values;
- dependencies from other Workers or Pages projects.

Provider readback is evidence only. It does not itself authorize route edits, binding edits, deployment, deletion, DNS changes, or secret changes.

## Rollback

This repository repair is non-promoting. Reverting it removes only the verification-only policy/script/documentation. It does not mutate the live `fcr_mail` Worker.
