# ULTRATHINK — Portfolio Cookie Synthesis

## System observation

The portfolio contains six materially different runtime classes: server web app, Expo native/rich client, runtime service, static SPA, Shopify Hydrogen storefront, and local-only admin. A universal cookie implementation would erase those boundaries and create false security.

## Hidden failure modes

- moving native Supabase sessions into cookies creates a browser-only model that does not fit iOS or Android;
- adding HttpOnly cookies to a rich client without server-owned rendering prevents the client from refreshing its own session;
- ambient cookie authentication adds CSRF risk to every mutation;
- cached `Set-Cookie` responses can leak one user's session to another through a CDN;
- parallel cart or account cookies split authority from Shopify;
- an admin cookie in a static Vite app is self-asserted state, not authentication;
- analytics and consent cookies create privacy work without product value when no nonessential tracking exists.

## Synthesis

Use a cookie allowlist, not a cookie toolkit. Founder Control Room owns the only custom production session cookie. Shopify owns Shopify-required cookies. Cloudflare and Stripe may own provider-edge cookies that product code cannot inspect. Every other repository remains cookie-free until a verified server identity boundary exists.

## Truth state

A cookie declaration is not proof that the deployed edge, browser, Supabase Auth configuration, or platform account matches it. Exact deployment verification remains separate.
