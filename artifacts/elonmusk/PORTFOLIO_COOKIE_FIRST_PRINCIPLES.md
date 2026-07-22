# Elon Musk Execution — Portfolio Cookies from First Principles

## Fundamental requirement

A cookie exists because a browser must automatically attach a small state value to matching HTTP requests. Nothing else requires a cookie.

## Delete the assumptions

- A frontend preference does not require server state.
- A native application does not require browser cookies.
- A static admin page cannot authenticate itself with a cookie it created.
- A checkout request does not require a cookie when an explicit, validated idempotency key already exists.
- A platform storefront does not need a second session system beside Shopify.
- A consent banner is not useful when no nonessential cookie exists.

## Smallest viable architecture

1. Keep one custom logical cookie session: Founder Control Room's server-owned session, using environment-appropriate names.
2. Let Shopify own Shopify-required cookies.
3. Treat Cloudflare and Stripe edge cookies as provider-managed and unreadable to product logic.
4. Keep Se’kret Bip native tokens in SecureStore.
5. Keep all other repositories cookie-free.
6. Reject every new cookie until its server owner, purpose, expiry, security attributes, cache behavior, and deletion path are demonstrated.

## Bottleneck removed

The portfolio no longer needs to rediscover cookie security repo by repo. The manifest is the choke point. A proposed cookie without a manifest change is structurally unauthorized.
