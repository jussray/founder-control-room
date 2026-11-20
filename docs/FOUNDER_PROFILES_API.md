# FCR founder profiles / Google Sheets lead API

**Status: branch-only source; NOT merged, migrated, deployed, or live authenticated.**
No new Worker, API-key issuer, approval mechanism, or public anonymous data surface.

## Endpoints
Existing \`GET /health\` remains unchanged. The versioned \`GET /api/v1/health\` returns liveness only.
\`GET /api/v1/founder-profiles\`; \`GET /api/v1/founder-profiles/:id\`;
\`POST /api/v1/founder-profiles\`; \`PUT/PATCH /api/v1/founder-profiles/:id\`; \`DELETE /api/v1/founder-profiles/:id\` (soft delete);
\`POST /api/v1/leads\` (consent must be true).

Each non-health request requires a validated RS256 Cloudflare Access assertion
(Cf-Access-Jwt-Assertion) with exact issuer/application AUD AND an X-API-Key
issued by the existing FCR Connection Vault, project=founder-control-room,
environment=production, explicit scope \`founder_profiles:read\`,
\`founder_profiles:write\` or \`leads:write\`, unexpired and not revoked.
Founder identity is derived from a signed Access JWT email mapped to a
\`founder_users\` row with non-null immutable user_id, never request parameters.
Usage-attempt evidence must persist before a read or write.

## Required activation settings (provider-held, never pasted into chat)
- FCR_PROFILES_ACCESS_ISSUER: https://YOURTEAM.cloudflareaccess.com
- FCR_PROFILES_ACCESS_AUD: exact Cloudflare Access application audience tag
- FCR_LEADS_SHEET_ID: private Google spreadsheet id
- FCR_LEADS_GOOGLE_SERVICE_ACCOUNT_JSON: Sheets-only service account credentials

Google sheet tab: \`Leads\` with headers
\`received_at_utc, name, email, interest, source, consent\`.
Share only that spreadsheet with the service account email.
Append uses Google Sheets values.append with RAW input; no formula execution,
no marketing follow-up and no raw lead data in API receipts.
Provider 503 is not proof that Google did not append; never automatically retry
after a network timeout without independent row readback.

## Release gate
Audit source and migration against main; run focused typecheck, tests, lint,
full exact-head CI and Playwright. Validate 401 missing/invalid Access, 401
missing/bad key, 403 wrong scope/founder, 404 cross-owner, CRUD and soft delete,
real Google Sheets row readback (no raw PII in receipts), private RLS/grants,
actual Cloudflare Access application policy/AUD, and exact deployed Worker SHA.
Cloudflare Access policy must restrict /api/v1 to approved founder identities.
No anonymous public lead capture is activated on this Access-protected route.

Rollback before merge: discard branch. After merge: revert focused commit and
disable relevant API-key scopes/Access application. Profile schema changes need
a separately approved data retention plan, never an automatic destructive drop.
