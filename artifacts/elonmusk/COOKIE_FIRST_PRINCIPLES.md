# Elon Musk — Cookie First Principles

## Reduce the system

A cookie is a browser-supplied request header controlled by response serialization rules. It is not authentication, authorization, encryption, consent, persistence, or truth by itself.

Before adding one, answer:

1. What server validates the value, or is it explicitly non-authoritative UI state?
2. What authority does it prove?
3. How is it revoked or expired?
4. Why must the browser attach it automatically?
5. What prevents CSRF when it carries authority?
6. What prevents CDN caching and cross-user leakage when a server writes it?
7. Why is native secure storage, server state, URL state, memory, or local browser state insufficient?
8. What exact data is forbidden from entering it?

If these questions have no concrete answers, do not add the cookie.

## Delete unnecessary machinery

- Delete the idea that every frontend needs a cookie.
- Delete browser-bundled passwords masquerading as access control.
- Delete duplicate app cookies when Cloudflare Access already owns the session.
- Delete API keys copied into client-readable cookies.
- Delete client-readable auth tokens where a server-only session is sufficient.
- Delete first-party identity or checkout cookies when checkout is delegated to a hosted provider.
- Delete hidden cookie writers by scanning source and failing closed.

## Smallest coherent architecture

- Founder Control Room: one server-owned founder session cookie.
- Untold Stories: one server-owned Hydrogen session cookie.
- JBH Private: one provider-owned Cloudflare Access cookie, validated through the assertion header.
- Public hair: one non-sensitive sidebar preference cookie, forbidden from carrying authority, cart, checkout, customer, or analytics state.
- Se’kret Bip, L99, and Chief AI: zero cookies until a verified need exists.

## Non-action

This artifact does not authorize deployment, provider configuration, consent collection, analytics, login creation, or migration of browser-local customer records.
