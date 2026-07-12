# Founder Control Room Guardrails

These guardrails are implemented in `src/guardrails.ts`, exposed through the public-safe `/guardrails` status page, and verified with Playwright.

| ID | Requirement | Enforcement |
|---|---|---|
| `FCR-AUTH-001` | Founder-only project reads require a valid session and founder allowlist authorization. | Existing `requireFounder` middleware; Playwright verifies unauthenticated project access is denied. |
| `FCR-BOUNDARY-001` | Control Room must use its own Supabase project and never borrow Bip service-role credentials. | Configuration and architecture boundary; status page declares separate ownership without exposing values. |
| `FCR-DATA-001` | Raw teen journals, voice, media, companion memory, and private parent content must not enter Control Room operational storage. | Public guardrail snapshot lists minimized event categories only; Playwright scans the status surface for forbidden private payload fields. |
| `FCR-APPROVAL-001` | Sandbox, branch, merge, deploy, and rollback are separate approval gates. | Guardrail registry exposes separate action states; no endpoint grants implied carry-forward approval. |
| `FCR-PROVIDER-001` | Repository and AI providers remain replaceable adapters. | `RepositoryProvider` boundary and provider-neutral guardrail snapshot. |
| `FCR-SECRET-001` | Provider tokens, service-role keys, founder sessions, and private project data never appear in public responses. | Public status page exposes IDs and summaries only; Playwright scans responses for secret markers. |
| `FCR-AUDIT-001` | Material provider actions and project reads must be auditable. | Existing project event logging; guardrail registry marks audit evidence as required. |

## Public status surface

`GET /guardrails` is intentionally public and contains only non-sensitive vision and enforcement metadata. It must never include environment values, founder email, tokens, project secrets, private event payloads, or repository credentials.

## Verification

```bash
npm install
npx playwright install chromium
npm run test:guardrails
```

The Playwright suite verifies the public status surface, health endpoint, secret minimization, and unauthenticated denial of project access. It does not substitute for Supabase RLS, provider contract, or end-to-end authenticated tests.
