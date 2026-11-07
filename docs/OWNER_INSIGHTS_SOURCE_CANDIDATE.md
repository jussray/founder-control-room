# Founder Owner Insights — source candidate (not live proof)

## Boundaries

- Search Console target: `sc-domain:jussco.company`, inspect only the six canonical public URLs currently listed by this feature.
- `GET /owner-insights/search-console` requires the existing Supabase-authenticated founder allowlist and its opaque browser cookie or explicit bearer authorization. It uses a *provider-held* `GSC_SERVICE_ACCOUNT_JSON` service account credential, signs a read-only Google OAuth assertion, lists submitted sitemaps and inspects each declared URL. Missing credential => HTTP 503; upstream error => HTTP 502; per-page failures => explicit unknown. The API cannot return a property-wide indexed total.
- Grant the service account only **Search Console read access** to the verified `sc-domain:jussco.company` property. Configure the JSON as an encrypted secret on FCR's Cloudflare Worker through founder-authorized credential setup. Never commit the JSON.
- `POST /owner-insights/challenge` requires founder authentication, same-origin CSRF protection for browser requests, bounded evidence, and explicit per-request model-sharing consent. It calls Workers AI through Cloudflare AI Gateway with cache skipped and provider logging disabled. It returns challenge questions, gaps and a suggested **manual** gate; no verification, approval, persistence, checkout or deployment authority.
- The Cloudflare `AI` binding is optional at application boot to preserve fail-closed availability until independently verified. The public static HTML has no access to private data; every datum is read from the protected API.
- This initial implementation is **founder-only**. It must not be described as available to all tenant/project owners until per-project membership/RLS, billing entitlements, rate limits, retention controls and end-to-end adversarial tests are independently verified.
- Existing root Cloudflare Pages remains authoritative for public Juss & Co content. This feature does not edit its sitemap/robots, request indexing or assert SEO outcomes.

## Release gates

Red → green focused unit/integration tests; full FCR typecheck and integration; read-only GSC property authorization; sandbox AI Gateway inference with untrusted prompt injection; authenticated/unauthenticated Pages-to-Worker browser verification; Cloudflare exact-head deployment readback; founder-controlled rollout and rollback. Do not merge/deploy without current head SHA, green named checks, and explicit authorization.
