# Unified Memory Spine

## Current-state contract

Founder Control Room provides a **sanitized normalization membrane** across memory-shaped systems in the founder portfolio. It does not replace each product's native storage, and it does not turn a repository identity, memory record, hash, timestamp, continuity fingerprint, authentication witness, or project-authority witness into execution authority.

The canonical raw implementation is `src/memory/unifiedMemory.ts`. The authenticated decision-support boundary is `src/memory/authenticatedUnifiedMemory.ts`.

## Storage and ownership

Native products remain the source owners for their own memory. FCR accepts bounded observations into a cross-system read model only after source-specific repository, native-kind, privacy, timestamp, provenance, and freshness validation.

The shared vocabulary is:

- `working`
- `episodic`
- `semantic`
- `decision`
- `evidence`
- `goal`
- `narrative`
- `audit`

Normalization is a compatibility layer, not a migration of product storage into one database.

## Authority boundary

Raw `NativeMemoryObservation` payloads **cannot authenticate themselves**. The raw normalizer does not accept a `sourceVerification` claim from the payload and emits `sourceVerification: untrusted-import` with `decisionSupportUsable: false`.

Authenticated ingress does not rewrite that provenance. `authenticateUnifiedMemoryObservation()` first runs the raw normalizer, then asks a separately supplied trust root to authenticate the sanitized record's exact source identity and resolve current project authority outside the caller-controlled payload. A successful result is a separate `fcr-authenticated-unified-memory@v1` envelope. The embedded raw record remains `untrusted-import` and remains non-authorizing.

The first authenticated boundary is deliberately conservative: current decision support requires a verified, fresh raw record with an exact source SHA; a fresh exact source-authentication witness; an active canonical portfolio project; and a fresh current project-authority witness. External continuity-only projects cannot be promoted through this path.

Every raw record and authenticated envelope carries `executionAuthority: false`. Memory continuity or decision support therefore cannot grant merge, deploy, provider, database, publication, payment, purchasing, credential, or destructive-action authority.

## Authenticated ingress trust root

`AuthenticatedUnifiedMemoryTrustRoot` is the trust boundary, not a payload field. Its implementations must obtain evidence independently from the memory body, for example from an authenticated server transport plus current project/runtime authority observation.

The adapter requires two independently supplied facts:

1. an `fcr-memory-source-auth@v1` witness bound to exact source system, target project, source repository, exact source SHA, observation window, and opaque evidence reference; and
2. an `fcr-memory-project-authority@v1` witness bound to the exact active project slug, canonical project repository, observation window, and opaque evidence reference.

Witnesses older than the bounded authentication window, expired witnesses, future-dated witnesses beyond clock tolerance, malformed evidence references, wrong repositories, wrong projects, wrong source systems, and wrong source SHAs fail closed. A trust-root exception also fails closed rather than becoming implicit approval.

The adapter intentionally does not include a provider implementation, secret, token, database write, HTTP route, or external mutation. Those belong in separately reviewed server-side integrations that implement this trust-root interface.

## At-use revalidation

`authenticatedMemoryForDecisionSupport()` does not trust a cached authenticated envelope forever. At every decision-support use boundary it rechecks raw-record freshness and calls the trust root again for current source authentication and current project authority.

If source identity changes, project registration disappears, either witness goes stale or expires, the raw observation ages out, the exact source SHA no longer binds, or the trust root is unavailable, the record is withheld from current decision support.

This is stronger than treating an earlier authentication receipt as permanent truth. The envelope is evidence about a bounded observation window, not a renewable authority lease.

## Portfolio identity boundary

`src/config/portfolio.ts` deliberately separates authority-bearing and continuity-only identity:

- `PORTFOLIO_PROJECTS` remains active-only because existing consumers historically treat it as an authority-bearing allowlist.
- `EXTERNAL_PROJECTS` is read-only identity/continuity metadata.
- `getPortfolioProject()` can return only active projects.
- `getKnownProject()` may resolve active or external identity for provenance and continuity, but must never be used as an execution allowlist.
- quarantined repositories remain outside both indexes.

External identity presence alone cannot promote a project into active portfolio authority. The authenticated adapter also requires fresh runtime/project-authority evidence; the checked-in active list is bootstrap identity, not sufficient present-tense project authority by itself.

## Privacy boundary

Metadata-only sources, including Se'kret Bip at this boundary, cannot send summary content into FCR. Retained category keys and provenance references must use bounded opaque identifier formats. Free-form prose is rejected from provenance metadata so private journal/conversation text cannot bypass the summary restriction through another field.

Authentication does not relax source-specific privacy policy. A payload rejected by raw normalization never reaches authenticated promotion, and a metadata-only record stays metadata-only inside an authenticated envelope.

Source-specific repository identity and native-kind policy are exact-match constraints. Malformed hashes, SHAs, timestamps, duplicate metadata, and invalid provenance fail closed into the rejected set instead of aborting the complete view.

## Freshness, revocation, and conflicts

Freshness is evaluated against observation time and optional expiry. Future-dated and revoked observations are not continuity-usable. Stale observations may remain continuity context but cannot become current decision truth.

Revocation ordering uses its effective `revokedAt` time when that is later than the original observation, so a later-effective revocation cannot be discarded behind an older active snapshot.

Set-like category and provenance metadata are canonicalized before fingerprinting and conflict comparison. Equivalent observations with different input ordering therefore remain equivalent instead of creating false contradictions.

Same-effective-time observations that remain logically contradictory fail closed as conflicts and no variant is selected.

## Decision-support freshness

`memoryRecordsForDecisionSupport()` continues to protect the raw unified-memory view and therefore returns no raw imported record as authenticated decision support. Raw imports remain continuity-only.

Authenticated decision support uses the separate envelope path in `src/memory/authenticatedUnifiedMemory.ts`, where current source authentication and project authority are re-observed at use time. The authenticated envelope does not mutate the raw record's `sourceVerification`, `decisionSupportUsable`, continuity fingerprint, or execution-authority fields.

## Fingerprints and receipts

`continuityFingerprint` is SHA-256 based and is only a provenance/continuity convenience. It is non-authorizing. A matching fingerprint does not prove current provider state, current project registration, founder approval, runtime identity, or permission to execute.

Source-authentication and project-authority evidence references are also non-authorizing. They let operators bind an envelope to independently observed facts without turning the reference string itself into proof.

Any future ingestion route or consequential execution consumer must bind to the repository's existing truth, founder-authority, and at-use revalidation contracts rather than treating this memory layer as a replacement authority system.
