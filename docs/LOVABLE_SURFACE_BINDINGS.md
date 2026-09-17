# Lovable external surface bindings

Founder Control Room treats Lovable apps as external presentation or reasoning surfaces, never as authority-bearing portfolio projects.

The machine-readable binding is `public/.well-known/lovable-project-surfaces.json`.

## Current bindings

| Surface | Canonical repository | Role |
| --- | --- | --- |
| Truth Compass | `jussray/founder-control-room` | Founder-facing claims/evidence/reconciliation control surface |
| Exact Match Engine | `jussray/founder-control-room` | Non-authoritative reconciliation prototype |
| Truth Weaver | `jussray/chief-ai-machine` | Non-authoritative reasoning/proposal surface |

`src/config/portfolio.ts` remains the authority-bearing project allowlist. Lovable project IDs must not be added there merely to make an external UI discoverable.

## Runtime rule

A surface binding identifies the canonical repository and branch. It does not freeze or donate a repository HEAD. A consumer must resolve the current `main` SHA at use time and bind material evidence to repository + ref + exact SHA + proof reference.

The `surfaceCommit` field is a continuity marker for the external surface only. It becomes stale when that Lovable project changes and never grants project, merge, deploy, publication, provider, or execution authority.

## Failure rule

If the canonical GitHub/FCR read path is unavailable, the surface must show `UNKNOWN` or `BLOCKED`. It must not silently substitute seed data, browser-local state, stale screenshots, previous generated output, or model claims.

## Data boundaries

Truth Compass may hold durable founder-scoped presentation data, but FCR remains the project-truth and authority plane. Exact Match Engine's current browser-local seeded state is demo-only until replaced or quarantined behind an explicit demo mode. Truth Weaver may generate reasoning and proposals but never approvals or external effects.

The public manifest contains no credentials, tokens, private founder data, customer/user content, or raw evidence. It is intentionally readable cross-origin so approved external surfaces can discover their canonical source safely.
