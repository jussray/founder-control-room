# PR #46 Guarded Refresh Mission

## Founder approval

Approved by founder in ChatGPT on 2026-07-19 for Founder Control Room PR #46 only.

## Scope

- Preserve the original `agent/founder-onboarding` branch.
- Do not force-push.
- Do not deploy.
- Do not apply migrations.
- Do not change secrets, auth providers, DNS, billing, or external communications.
- Create or use the safe refresh branch `agent/founder-onboarding-main-refresh`.
- Reconstruct PR #46 onto current `main`.
- Resolve only the known overlap: `src/worker/cf-entry.ts` and `wrangler.toml`.
- Preserve current `main` Cloudflare handler composition, runtime validation, reconciler composition, and AI-skill terminal evidence.
- Retain onboarding's founder authentication bindings.

## Required exact-head gates

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- guarded terminal/AI skill checks
- migration lint
- founder onboarding contract
- cookie contract

## Current tool-session blocker

This ChatGPT session can read and write through the GitHub connector, but its local container cannot resolve `github.com`, so it cannot clone, rebase, install dependencies, or run local npm gates directly. The refresh branch must run the gates through GitHub Actions or Founder Control Room guarded terminal after reconstruction.

## Conflict surfaces named by PR #46

- `src/worker/cf-entry.ts`
- `wrangler.toml`

## Mission rule

This record authorizes refresh/reconstruction work only. It does not authorize merge, deployment, migrations, force-push, credentials, auth-provider changes, DNS, billing, external communications, or destructive writes.
