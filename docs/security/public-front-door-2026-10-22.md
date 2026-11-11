# Founder Control Room public entrance and private paths (Cloudflare evidence)

Date: October 22, 2026. This document distinguishes **current observed provider state** from durable source code. See the machine-readable intent contract at `.control-room/public-front-door-boundary.json`. Run offline contract tests with `node --test tests/public-front-door-boundary.test.mjs`.

## Provider configuration and implementation
A self-hosted Cloudflare Access application named **FCR protected owner paths — public front door remains open** was created using the already configured FCR email-allow policy; this did not publish any account list, identities, credentials, API keys, or new storage.

It explicitly protects `foundercontrolroom.org/control-room`, `/control-room/*`, `/admin`, `/admin/*`, `/api/founder`, `/api/founder/*`. These path-specific restrictions override the existing broader FCR public homepage exception. The homepage and public founder profile remain anonymously accessible. We did **not** disable, overwrite, or delete the existing FCR hostname Access application, its other destinations, or existing public pages.

**Browser validation from an anonymous Cloudflare browser:** FCR `/` renders the Founder Control Room site; `/juss-rayy/` still renders the public profile; `/control-room/`, `/control-room/genesis.html`, `/admin`, `/admin/`, `/api/founder` and `/api/founder/status` present the Cloudflare Access sign-in page.

This is limited anonymous-route proof, not a claim that owner sign-in succeeded or that every API/database route is fully authorized. The `/*` public exception still exists on the base FCR hostname Access policy: audit every new feature path and apply appropriate specific Access protections AND origin-side authentication. Cloudflare login alone does not implement application authorization.

## Additional host protections: prevent alternate-origin exposure

The first apex-domain fix was not sufficient: anonymous tests found the Control Room workspace shell accessible on alternate app, checkout, and default Pages hostnames, including previews.

Two more Cloudflare Access applications reuse the existing FCR email-allow policy:

- FCR protected alternate app and checkout paths: protects the same six owner paths on app.foundercontrolroom.org and checkout.foundercontrolroom.org.
- FCR Pages default and preview owner paths: protects the same six owner paths on founder-control-room.pages.dev and *.founder-control-room.pages.dev.

The six scope patterns are /control-room, /control-room/*, /admin, /admin/*, /api/founder, and /api/founder/*.

Anonymous Cloudflare Browser Rendering confirmed the public homepages remain visible while owner paths show Cloudflare Access sign-in on both alternate domains, the Pages default hostname, and tested deployment-specific and branch preview URLs. Newly created Access configurations briefly returned Access error pages during propagation; later tests returned regular sign-in pages.

Do not remove the existing FCR Pages project, DNS records, Worker scripts or public landing pages. The base FCR hostname still has a broad /* public override; its specifically protected owner paths have more-specific access rules. Every future private route requires separate provider and origin authorization tests. Cloudflare Access is defense-in-depth, not a substitute for application authorization.

## Product identity boundaries
SOL is an independent product at `jussray/solcontinuity`; its public frontend is served by `solcontinuity-public-site`. PromptOS is independent at `jussray/promptos`; its public frontend is `promptos-public-front-door`. Chief and Think Tank likewise have separate public-front-door Workers. No one app's public entry can inherit another app's private authority.

## Security tests / rollback
- Anonymous public root and public founder profile should remain visible.
- Anonymous requests to the three protected path groups must require Access.
- Authenticated owner should be able to reach only its authorized data; verify authenticated and role/tenant separation separately.
- Privileged APIs must independently authorize requests at origin; identity spoofing or cross-project access must not succeed.
- Rollback this new narrow Access app only after regression review, never by disabling other Worker/Access protections.
- Before deployment changes, verify provider policy, route, and current repo state again; a repo snapshot is not current Cloudflare truth.

Canonical issue: https://github.com/jussray/founder-control-room/issues/1001.

## Oct 22 peer-ref CI remediation: separate from Access implementation

Exact-head Playwright E2E failed at 'Verify live StoryEngine peer ref still pinned'; previous Workflow expected StoryEngine SHA 26b1c34ae7c97c5d1b66a23d6345b3965cfcdc1f but GitHub StoryEngine main was independently observed as 1669d920f28bc81ddd04fea6d0bdb5ee41c29ec9. GitHub compare classified that new SHA as a forward, 3-commit successor with no behind commits.

The CI workflow pin has been updated to this exact successor for a fresh FCR-to-StoryEngine witness. This selects the new evidence subject only: previous peer federation proof remains historical. Run the entire exact-head workflow against the new pin, and do not call the integration green unless that new workflow passes. External StoryEngine release authority does not transfer.

