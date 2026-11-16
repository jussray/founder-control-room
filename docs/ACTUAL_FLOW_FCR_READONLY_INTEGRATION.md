# ACTUAL-FLOW V5.2 — FCR read-only verification candidate

**Status: SOURCE CANDIDATE ONLY.** This branch does not add a live FCR endpoint, publish data, install agents, configure Cloudflare, provision keys, or verify runtime outcomes.

This change adds scripts/actual-flow-fcr-verify.mjs as a standalone, offline verification-only reader of the existing proposed ACTUAL-FLOW FCR evidence wire format:
- canonical JSON bundle with exact manifest fields and base64 original source bytes;
- SHA-256 of those bytes, independently pinned issuer, origin, Ed25519 public key and key ID;
- bounded capture time, resource identity, audience and supported engagement source schema;
- Ed25519 signature over domain-prefixed canonical manifest bytes.

The verification result is only SIGNATURE_VERIFIED_WITH_PINNED_KEY. **It is not proof of source-origin custody, approval, deployment, browser behavior, runtime health, action completion, or full ACTUAL-FLOW agent integration.** The independently authenticated FCR key pin is essential. The script intentionally has no network, filesystem, browser, cookie, cloud or mutation access.

## Local reproducible test

    node --test test/actual-flow-fcr-verify.test.mjs

Tests generate synthetic disposable Ed25519 keys, never production credentials. Tests cover valid signed source bytes, tampered bytes, missing pin, issuer substitution, resource mismatch, noncanonical serialized bundle, expired proof, altered signature and schema extension.

## Governance / control-plane contract

- FCR is the founder authority. ACTUAL-FLOW is an evidence-verification subsystem, not a separate permission issuer.
- Only the owner-controlled FCR service may ever create signatures and authorize release.
- No public evidence-serving route is enabled by this candidate.
- Private evidence, teen and family content, internal source, user sessions, access tokens and provider secrets must never be copied into public R2 or this repository.
- Fingerprints are exact SHA-256 evidence digests, **not** probabilistic browser/device tracking.
- Browser continuity, if used later, must be first-party, consent-based and EVIDENCE_ONLY, never merge/deploy/approval authority.
- PROOFMODE, TRUTHWEAVER, TRUTHMODE/CONFESS, Red-Team Twin, LindyMode Twin, L99, OODA and authorized Playwright are capabilities of the separately developed reference design, **not** asserted as integrated into FCR.
- Keep SOURCE IMPLEMENTED, CONFIGURED, ACTIVE and PROVEN separate. Requires independent exact-head tests, owner-governed key custody, authorized endpoint, provider readback and runtime proof before stronger statements.

## Next gate

Review the GitHub draft PR, confirm the FCR owner-managed signing and public/private evidence classification model, and provide exact scoped founder authorization before any merge, route, bucket or deployment action.
