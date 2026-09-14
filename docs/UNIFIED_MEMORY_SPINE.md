# Unified Memory Spine

## Current-state contract

Founder Control Room provides a **sanitized normalization membrane** across memory-shaped systems in the founder portfolio. It does not replace each product's native storage, and it does not turn a repository identity, memory record, hash, timestamp, or continuity fingerprint into execution authority.

The canonical implementation is `src/memory/unifiedMemory.ts`.

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

A future authenticated adapter may only promote decision-support eligibility after it proves source identity outside the payload body and revalidates current project/runtime authority at the use boundary. The checked-in portfolio index is bootstrap identity data, not live provider or database authority.

Every normalized memory record in this contract carries `executionAuthority: false`. Memory continuity therefore cannot grant merge, deploy, provider, database, publication, payment, or destructive-action authority.

## Portfolio identity boundary

`src/config/portfolio.ts` deliberately separates authority-bearing and continuity-only identity:

- `PORTFOLIO_PROJECTS` remains active-only because existing consumers historically treat it as an authority-bearing allowlist.
- `EXTERNAL_PROJECTS` is read-only identity/continuity metadata.
- `getPortfolioProject()` can return only active projects.
- `getKnownProject()` may resolve active or external identity for provenance and continuity, but must never be used as an execution allowlist.
- quarantined repositories remain outside both indexes.

External identity presence alone cannot promote a project into active portfolio authority.

## Privacy boundary

Metadata-only sources, including Se'kret Bip at this boundary, cannot send summary content into FCR. Retained category keys and provenance references must use bounded opaque identifier formats. Free-form prose is rejected from provenance metadata so private journal/conversation text cannot bypass the summary restriction through another field.

Source-specific repository identity and native-kind policy are exact-match constraints. Malformed hashes, SHAs, timestamps, duplicate metadata, and invalid provenance fail closed into the rejected set instead of aborting the complete view.

## Freshness, revocation, and conflicts

Freshness is evaluated against observation time and optional expiry. Future-dated and revoked observations are not continuity-usable. Stale observations may remain continuity context but cannot become current decision truth.

Revocation ordering uses its effective `revokedAt` time when that is later than the original observation, so a later-effective revocation cannot be discarded behind an older active snapshot.

Set-like category and provenance metadata are canonicalized before fingerprinting and conflict comparison. Equivalent observations with different input ordering therefore remain equivalent instead of creating false contradictions.

Same-effective-time observations that remain logically contradictory fail closed as conflicts and no variant is selected.

## Decision-support freshness

`memoryRecordsForDecisionSupport()` rechecks freshness, expiry, revocation, source verification, project classification, and trust at the time of use. Cached or persisted view flags cannot keep an expired observation current forever.

The raw normalizer currently emits no decision-support-usable records. A future authenticated adapter must remain separate from this raw import path and must not derive authentication from caller-controlled observation fields.

## Fingerprints and receipts

`continuityFingerprint` is SHA-256 based and is only a provenance/continuity convenience. It is non-authorizing. A matching fingerprint does not prove current provider state, current project registration, founder approval, runtime identity, or permission to execute.

Any future adapter, ingestion route, or execution consumer that crosses from continuity into consequential decisions must bind to the repository's existing truth, founder-authority, and at-use revalidation contracts rather than treating this memory layer as a replacement authority system.
