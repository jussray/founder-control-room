# Portfolio Cookie OS

Portfolio Cookie OS defines which browser cookies may exist across the seven active repositories, who owns them, why they exist, and what proof is required before adding another.

## Decision rule

A cookie is allowed only when all of these are true:

1. a browser must send state automatically to a server;
2. the server owns and validates that state;
3. a safer non-cookie mechanism does not fit the runtime;
4. its security, cache, privacy, expiry, rollback, and deletion behavior are explicit;
5. it is strictly necessary rather than analytics, advertising, fingerprinting, or convenience state.

Theme, locale, dismissed UI, drafts, and similar client-only preferences belong in memory or browser storage unless the server genuinely needs them. Native Expo sessions belong in secure native storage, not cookies.

## Portfolio posture

| Repository | Cookie posture | Authority |
|---|---|---|
| Founder Control Room | One custom founder session cookie | Express/Cloudflare backend + Supabase Auth + `founder_users` |
| Se’kret Bip | No first-party cookies | Expo SecureStore on native; explicit rich-client storage on web |
| L99 StoryEngine | No cookies | Runtime provenance/event system |
| Chief AI Machine | No cookies | Current static SPA; no verified auth backend |
| Juss Beautiful Hair public | Zero first-party cookies | Stateless Cloudflare checkout boundary + Stripe hosted checkout |
| Untold Stories | Platform-managed cookies only | Shopify Hydrogen/Oxygen |
| Juss Beautiful Hair private | Zero cookies until a real loopback auth backend exists | Local-only Vite admin |

## Founder session

Production uses `__Host-fcr_session`; localhost uses `fcr_session` because `Secure` cookies cannot be set over plain HTTP. The cookie is HttpOnly, SameSite=Lax, Path=/, Secure in production, and capped at 30 days. Every authenticated request revalidates the Supabase user and the private founder allowlist. Cookie-authenticated mutations must pass an explicit same-origin gate.

Responses that set, refresh, or clear the session send `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Expires: 0`. Cloudflare must never cache a response containing founder-specific content or `Set-Cookie`.

## Platform-managed cookies

Shopify may set strictly necessary cart, checkout, localization, or customer-account cookies. Those remain Shopify-owned. The Untold Stories repository may configure supported platform behavior, but it must not create a parallel cart or customer session authority.

Stripe Checkout may set cookies on Stripe domains after the user leaves the public hair storefront. The public repository does not own those cookies and must not proxy, copy, or inspect them.

## Consent

No portfolio repository currently enables nonessential first-party cookies. Therefore a consent cookie or banner would be performative rather than protective. If analytics, advertising, replay, personalization, or cross-site measurement is proposed later, it requires a separate privacy review, founder approval, regional consent behavior, retention limits, and an updated manifest before code is added.

## Verification

Run in Founder Control Room:

```bash
npm run verify:cookies
```

Every repository also carries `.control-room/cookie-policy.json`. A future Control Room ingestion job may compare those files against `config/portfolio-cookie-registry.json`; until then, each draft PR preserves the exact policy beside the runtime it governs.
