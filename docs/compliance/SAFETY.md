# Safety Policy

> **Founder Control Room** — Safety Proof Document  
> Last updated: 2026-07-19

## 1. Scope
This document describes the safety controls applied to all data, processes, and agents within the Founder Control Room (FCR). It satisfies App Store, Google Play, and enterprise security review requirements.

## 2. Input Validation & Sanitization
- All user-supplied inputs are validated via Zod schemas before processing (`src/lib/validation/`).
- SQL inputs pass exclusively through Supabase parameterized queries — no raw string interpolation.
- Cloudflare Workers apply `wrangler`-managed CSP headers; see `wrangler.toml` `[headers]` section.

## 3. Authentication & Authorization
- Auth is handled by Supabase Auth (JWT, PKCE flow). Session tokens are short-lived (1 hour) with refresh-token rotation enabled.
- Row-Level Security (RLS) is enforced on all tables; no anonymous reads are permitted on sensitive tables. See `supabase/migrations/` for RLS policy definitions.
- Founder access is gated by the `founder_access` column and verified server-side in every API route.

## 4. Secrets Management
- No secrets are committed to the repository. All credentials are stored as Cloudflare Workers Secrets and Supabase Vault.
- `.env` files are listed in `.gitignore`; `.env.example` and `.env.local.example` contain only placeholder values.
- GitHub Actions secrets (`SUPABASE_*`, `CLOUDFLARE_*`) are masked in CI logs.

## 5. Dependency Security
- `npm audit` runs on every pull request via `.github/workflows/`.
- Dependabot is enabled for automated dependency updates.
- SonarQube static analysis is configured in `sonar-project.properties`.

## 6. Incident Response
- Critical security issues should be reported via the process in `.security/SECURITY.md`.
- Severity-1 incidents trigger automated alerts to the founder via Cloudflare Alerting webhooks.

## 7. Audit Logging
- All mutating API calls are logged to the `audit_logs` Supabase table with actor, action, timestamp, and IP.
- Logs are retained for 90 days and are founder-readable only.
