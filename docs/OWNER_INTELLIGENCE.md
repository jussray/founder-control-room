## November 3, 2026 — CSP-safe public identity data

The browser Playwright proof rejected the proposed homepage inline JSON-LD with `CSP-forbidden inline script present`. The content is now preserved in the static public `/site-identity.json` resource, advertised via a typed `<link rel="alternate">`, with search-user-agent crawler allowances. The main HTML **must contain no inline scripts**. A linked JSON-LD file is not equivalent to Google's recognized inline structured-data integration; do not assert a rich-result enhancement or Google indexing without independently observed Search Console evidence. Canonical URL, Open Graph, social metadata and bounded public sitemap remain operational source assets. Never loosen CSP just to claim SEO.

# Reconciliation notice — November 3, 2026

**Canonical system:** The independently merged FCR main branch already implements Google Search Console snapshot sampling and AI Gateway advisory review in the authenticated Truth Console, under `/dashboard/truth/intelligence/seo` and `/dashboard/truth/intelligence/review`. The canonical UI tabs are `truth-seo` and `truth-ai-review`.

**Conflict-resolution decision:** Preserve prior PR #988 authoring artifacts and their unit tests for provenance, but do not mount a second `/owner-insights` live API. The original `search-evidence.html` panel becomes a compatibility navigation alias. In this reconciliation, harden the canonical main implementation with explicit model consent, no-log/no-cache headers, validation, and regression assertions. No former user files or evidence receipts are deleted. The `src/owner-intelligence` library and `src/http/routes/ownerInsights.ts` remain source-only, not live, and must not be claimed as operational.

**Provider truth:** Cloudflare worker settings returned absent `FCR_GSC_OAUTH_JSON` and `FCR_EVIDENCE_GATEWAY_TOKEN` on November 3. Google and model provider live use are BLOCKED. Authentication/consent code and all tests are implementation evidence only, not runtime proof. Main/PR base merges and founder release approvals must be separately verified.

**Historical notes below** describe the earlier proposed standalone candidate, now superseded as the production entry point.

---

# Owner Intelligence: Search Console and AI Gateway evidence review

Status: **source candidate; NOT deployed or live-verified**. Implemented on existing FCR PR #988 as a disjoint read-only feature set and audited against existing `/dashboard/truth`, `/goalfix`, `/cloudflare`, sitemap/crawler and portfolio-sync routes; no existing authority surface is replaced. CI and exact-head rollout evidence must be recorded separately.

## Search Console: published public site

- Authenticated FCR route: `GET /owner-insights/search-console`, blocked without founder cookie/Bearer + `founder_users` allowlist.
- Published property: `https://www.foundercontrolroom.org/` (URL-prefix) or `sc-domain:foundercontrolroom.org` (Domain). Set **`GSC_SITE_PROPERTY`** to the exact existing Search Console property. It is a public selector, not a credential.
- Set **`GSC_SERVICE_ACCOUNT_JSON`** as a *private Cloudflare Worker secret*, containing the Google service-account key JSON. The Google service-account email must be granted appropriate access to that actual Search Console property. The backend signs a bounded OAuth JWT, exchanges it only at `https://oauth2.googleapis.com/token`, and requests only `https://www.googleapis.com/auth/webmasters.readonly`.
- Provider calls: Google Search Console `sitemaps.list` plus **five bounded canonical URL inspections**. No submission, update, crawl-trigger or mutation API is used. Google sitemap `errors/warnings/isPending/lastDownloaded` are displayed as received. Google URL Inspection `verdict`, coverage, crawl timestamp and unknown/quota errors are reported per URL.
- **No aggregate indexed-page count claim.** URL Inspection returns per-URL status, not sitewide Google Page Indexing report totals. Five checked URLs are a sample. Missing or denied credentials show BLOCKED, not invented zero.
- No tokens, JWTs, private keys, project claims, or inspect responses are persisted. HTTPS origins are pinned and responses are no-store; no arbitrary user-provided inspection URL is fetched.

## AI Gateway: founder project claim evidence

- Authenticated route: `POST /owner-insights/claims/review`. Check that the submitted slug is a registered FCR project. Until separate verified project membership exists, only the authenticated founder allowlist may use it; **do not interpret this as multi-tenant project-owner support**.
- Inputs are bounded: 10–4,500-char claim; up to eight evidence items each with bounded source/observation; explicit affirmative consent to send them through the model. The UI tells users not to enter secrets or unnecessary personal data. Requests are not stored by FCR.
- Configure Cloudflare Worker secrets/vars: **`FCR_AI_GATEWAY_ACCOUNT_ID`** (public account identifier), **`FCR_AI_GATEWAY_TOKEN`** (secret with least-privilege Workers AI Read for REST inference, account-scope limitations reviewed), optional `FCR_AI_GATEWAY_ID` (default `default`), optional `FCR_AI_GATEWAY_MODEL` (defaults to `@cf/moonshotai/kimi-k2.6`).
- Calls only `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions` with `cf-aig-gateway-id`. Provider timeouts, quotas, malformed model JSON, and unknown next gates return a BLOCKED error rather than fabricated output or local fallback.
- The output contains `gaps`, `attackQuestions`, `nextGate` and `rationale`, explicitly `ADVISORY_ONLY`, `verified:false`, `releaseAuthorized:false`, `mutationsPerformed:false`. The model cannot inspect private evidence on its own or grant a launch/merge/deploy.
- **Gateway account observation on 2026-11-02:** Cloudflare returned an empty gateway list for FCR's account. No new gateway, token, billing plan or provider key was created. Source implementation is **not proof of live inference**; a future founder-authorized provider setup is required.
- The request sets `cf-aig-collect-log: false` and `cf-aig-skip-cache: true` to avoid provider-side request/response logging and caching for user evidence. Verify actual gateway policy and provider behavior independently; headers are not proof that upstream retention is zero. Sensitive material may still be subject to provider retention, so obtain informed consent and verify administrator retention rules. Obtain consent, disable unsafe retention, and establish terms before production use.

## SEO, AEO and GEO safeguards

- Public `/` now provides metadata for canonical search, social preview and minimal `Organization` + `WebSite` JSON-LD; claims are constrained to verified public names and URLs. Sitemap homepage `lastmod` reflects the source change, not invented indexing outcomes.
- Existing `robots.txt`, `sitemap.xml`, `llms.txt`, `crawlers.json`, page content signals, and explicit AI-training denial remain unchanged. Do not weaken privacy controls for more crawl exposure.
- The new owner panel is explicitly `noindex,nofollow` and hosted under `/control-room/`, outside the public sitemap and allowed crawler paths. AEO/SEO enhancements are **discoverability metadata only**, never a promise of search ranking, AI citation, or page indexing.

## Production acceptance gates

1. Target exact-head CI: TypeScript/typecheck, unit tests, source/browser proof, Pages packaging, and existing security/privacy gates.
2. Authorized Google setup: verify that Google lists the exact property, service identity is permitted, sitemap results come back, and the five inspected URLs return truthful states. Retain redacted timestamps, not credentials.
3. Authorized Cloudflare setup: verify a billing-approved gateway/model and token with strict access, safe logging, rate limits and budget. Run one permitted sample review; prove malformed/missing input remains blocked and no provider output triggers mutation.
4. Browser security: unauthenticated routes return 401; authorized founder can open the panel and inspect results; missing provider credentials show BLOCKED with no token leakage; mobile keyboard/screen reader behavior works; private endpoints are no-store.
5. Founder release approval binds PR, base SHA, head SHA, and exact production deployment. Required Worker bindings, routing, API `/version`, public Pages `/version`, and rollback remain independently verified. No merge or production promotion from this source proposal.

References: Google Search Console API sitemaps.list and URL Inspection; Cloudflare AI Gateway REST API docs (October 2026). Store keys only in provider-admin secret facilities.
