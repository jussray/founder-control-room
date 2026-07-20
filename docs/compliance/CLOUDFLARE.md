# Cloudflare Configuration & Compliance

> **Founder Control Room** — Cloudflare Proof Document  
> Last updated: 2026-07-19

## 1. Workers & Pages Deployment
- Deployment is managed via `wrangler.toml`.
- Workers are deployed to Cloudflare's edge network; no origin server is exposed publicly.
- Pages project is connected to the `main` branch; production deploys require CI green + founder approval.

## 2. Security Headers
All responses include the following headers (enforced in Workers middleware):
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{nonce}'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 3. WAF & DDoS Protection
- Cloudflare WAF managed ruleset is active (OWASP Core Rule Set).
- Rate limiting: 100 req/min per IP on `/api/*` endpoints.
- DDoS protection: HTTP DDoS managed ruleset (auto-enabled).
- Bot Fight Mode: enabled for all zones.

## 4. KV & R2
- KV namespaces: `SESSIONS_KV` (session cache), `FEATURE_FLAGS_KV` (runtime config).
- R2 bucket: `fcr-backups` (private, no public access, lifecycle: delete after 90 days).
- KV TTLs are set per-key; no unbounded entries.

## 5. Access Control
- Cloudflare Access protects the `/admin` and `/api/founder` routes (email OTP + service token required).
- Zero-Trust policies: only authorized email domain is allowed.
- All API tokens follow least-privilege; token scopes are documented in `.env.example`.

## 6. DNS & SSL
- DNSSEC enabled on the zone.
- SSL/TLS mode: **Full (Strict)** — origin certificate pinned via Cloudflare Origin CA.
- HSTS preload submitted.

## 7. Observability
- Workers Analytics and Cloudflare Logpush are enabled for audit trails.
- Alerts configured for: error rate > 5%, CPU time > 50ms p95, security event spikes.
