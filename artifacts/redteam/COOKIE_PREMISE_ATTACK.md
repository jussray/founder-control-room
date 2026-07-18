# Redteam — Cookie Premise Attack

## Premise under attack

> Every repository should receive cookies for the frontend or backend reasons it needs.

## Failure modes in the premise

1. Cookies are browser-specific and do not fit native Expo security storage.
2. A static SPA cannot make an HttpOnly cookie useful without a server that validates and refreshes it.
3. Adding an app cookie beside Cloudflare Access creates two identity authorities and ambiguous logout/revocation.
4. A hosted checkout provider's cookies do not justify a first-party storefront cookie.
5. Cookies attached automatically to mutations create CSRF risk.
6. CDN caching of responses containing `Set-Cookie` can become cross-user session leakage.
7. Client-readable passwords or tokens are not repaired merely by storing an `authenticated=true` cookie.
8. Cookie consent surface expands unnecessarily when the default changes from zero to many.

## Selected architecture attack

- Founder Control Room fails if cookie mutations lack exact-origin checks.
- Untold Stories fails if session commits are cached or if production uses a non-host-only cookie.
- JBH Private fails if the origin trusts `CF_Authorization` directly instead of validating the Access assertion.
- Se’kret Bip fails if native SecureStore is replaced by web semantics.
- L99 fails if cookie state becomes a second operational truth source.
- Chief AI fails if a cookie makes a prototype appear securely multi-user.
- Public hair fails if first-party state starts collecting customer or payment behavior without consent.

## Surviving plan

Use deny-undeclared cookie manifests, repository-specific implementations, exact cache and CSRF rules, provider boundaries, and zero-cookie defaults where no server-owned session exists.
