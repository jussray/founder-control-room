# Bill Gates Artifacts — Portfolio Cookie Platform Leverage

## Platform choice

Centralize the decision contract, not the session implementation. Founder Control Room publishes one schema and seven repo postures; each repository keeps its own manifest beside the runtime.

## Leverage

- one vocabulary for custom, platform-managed, browser-storage, and forbidden state;
- one proof gate for founder-session security and seven-repository coverage;
- lower privacy and compliance surface by defaulting nonessential cookies to zero;
- lower incident blast radius because product repositories do not share a session cookie or parent domain;
- lower migration cost because Shopify and Supabase retain their supported session lifecycles;
- clearer review because a new cookie requires a manifest diff with purpose, owner, expiry, security attributes, source, and rollback.

## Economic test

A cookie is not free. It adds security review, CDN behavior, expiry bugs, privacy disclosure, browser compatibility, incident response, and support burden. The portfolio should pay that cost only where automatic browser-to-server state is necessary.

## Operating artifacts

- schema: `contracts/cookie-policy.schema.json`
- portfolio registry: `config/portfolio-cookie-registry.json`
- Founder enforcement: `.security/cookies.json`
- product policies: `.control-room/cookie-policy.json`
- verification: `npm run verify:cookies`
