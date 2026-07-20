# Portfolio Design OS

Portfolio Design OS is Founder Control Room's read-only registry for design-system capability, Figma registration, implementation proof, Code Connect coverage, and design-to-code drift.

It exists to prevent one dangerous shortcut:

> A polished design must never be interpreted as proof that the corresponding code, exact Git head, database state, deployment, or user flow exists.

## API

All routes require the existing founder authentication and allowlist middleware.

- `GET /design-os` returns the validated portfolio summary, all repository records, and global truth boundaries.
- `GET /design-os/:slug` returns one repository record.
- Unknown slugs return `404 DESIGN_OS_PROJECT_NOT_FOUND`; they never fall back to another project.

The API has no write methods. It does not publish Figma libraries, create Code Connect mappings, change repository files, merge pull requests, deploy code, apply migrations, or approve work.

## Independent readiness axes

Each repository records four independent dimensions:

1. **Design state** — unregistered, registered, draft, review-ready, or approved.
2. **Implementation state** — not started, in progress, locally verified, exact-content verified, exact-head verified, or deployed-observed.
3. **Code Connect state** — not eligible, not configured, partial, or complete, plus the actual mapping count.
4. **Drift state** — unknown, aligned, drift detected, or stale.

No axis automatically advances another.

## Registry invariants

The registry fails closed when:

- slugs or repository identifiers are duplicated;
- a registered/draft/reviewed design lacks a Figma file;
- an unregistered design claims a Figma file;
- the Figma URL does not contain its file key;
- Code Connect completion has zero mappings;
- an unmapped state reports mappings;
- exact-head verification lacks a SHA-bound proof reference;
- deployed observation lacks deployment evidence;
- a capability PR URL points to the wrong repository;
- any truth boundary is weakened.

## Current baseline

- Seven active repositories are registered in the capability registry.
- Founder Control Room has one registered Figma file: `QevLkXHXSzXfEsqsZltGRJ`.
- Six repositories do not yet have a portfolio-registered Figma file.
- Zero repositories are currently marked design-ready.
- Zero repositories have complete Code Connect coverage.
- Zero repositories are marked exact-head verified or deployed-observed by Design OS.

These zeros are intentional. The registry reports evidence, not ambition.

## Data boundary

Only public-safe, synthetic, sanitized, or redacted design metadata belongs in this registry or its Figma files. Raw teen/family content, journals, voice/media, customer/order records, vendor or sourcing records, credentials, tokens, webhook payloads, service-role material, and unpublished private operating data are excluded.

## Verification

Run:

```bash
npm run verify:design-os
```

The command performs:

- a dependency-free static contract inspection;
- registry invariant tests;
- founder API response tests with the auth middleware mocked only inside the test process;
- fail-closed unknown-project verification.

Exact-head CI must still execute before integration. Local or reconstructed-content evidence does not become GitHub-hosted proof.
