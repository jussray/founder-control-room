# ULTRATHINK — Portfolio Cookie Architecture

## Decision

Do not add cookies uniformly. Use cookies only where a browser-facing server owns a real session, can validate it on every request, can revoke or refresh it, and can prevent CDN caching and CSRF.

## Portfolio result

| Repository | Browser state decision | Authority |
|---|---|---|
| Founder Control Room | First-party `fcr_session` cookie | Supabase Auth session + private founder allowlist |
| Se’kret Bip | No cookies | Expo SecureStore on native; declared SPA storage on web |
| L99 StoryEngine | No cookies | Event bus, provenance engine, and explicit runtime stores |
| Chief AI Machine | No cookies | No secure server identity boundary exists yet |
| Juss Beautiful Hair public | No first-party cookies | Stateless storefront; Stripe owns hosted-checkout state on Stripe origins |
| Untold Stories | First-party Hydrogen session cookie | Shopify Hydrogen server session |
| Juss Beautiful Hair private | No first-party cookies | Cloudflare Access owns `CF_Authorization`; origin validates `Cf-Access-Jwt-Assertion` |

## Universal contract

Every repository now has or is receiving a machine-readable `.security/cookies.json` contract with:

- deny-undeclared default policy;
- declared cookie writers;
- purpose, owner, provider, lifetime, flags, deletion, cache, and CSRF boundaries;
- declared non-cookie state where cookies would be the wrong mechanism;
- explicit external provider cookies;
- prohibited state and data classes;
- a verifier that fails on undeclared first-party cookie writers.

## Security invariants

1. Sensitive cookies are server-owned and HttpOnly.
2. Production session cookies are Secure.
3. SameSite is Strict or Lax; None requires a separately reviewed cross-site requirement.
4. Any response that writes or refreshes sensitive cookies is private and no-store.
5. Cookie-authenticated mutations require CSRF protection.
6. Native apps use device secure storage, not browser cookies.
7. Static SPAs do not receive cosmetic auth cookies without a validating backend.
8. Provider-owned cookies are documented but not copied, parsed, mirrored, or reissued by portfolio origins.
9. No journals, voice, media, safety, customer, order, vendor, payment, credential, provenance, or canon content belongs in cookies.
10. Consent is required before any future non-essential analytics or advertising cookie.

## Truth state

This change establishes source contracts and draft implementations. It does not deploy, alter Cloudflare Access policy, change Supabase Auth settings, create production sessions, merge pull requests, or authorize tracking.
