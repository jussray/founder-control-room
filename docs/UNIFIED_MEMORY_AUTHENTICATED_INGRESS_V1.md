# Unified Memory Authenticated Ingress V1

## Scope

This candidate adds the first authenticated decision-support boundary for the Unified Memory Spine without adding a live provider adapter or any execution authority.

The raw memory record remains permanently classified as `untrusted-import`. Authentication is represented only by a separate bounded envelope produced after two trust-root reads that the caller-controlled memory payload cannot supply: exact source authentication and current active-project authority.

## Required proof

A valid envelope requires a verified and fresh raw record, exact source SHA, fresh source-authentication witness, active canonical portfolio project, fresh project-authority witness, bounded opaque evidence references, and exact source/project/repository binding.

At the use boundary, `authenticatedMemoryForDecisionSupport()` repeats source authentication and project-authority resolution. Cached envelopes therefore expire when source identity, project registration, witness freshness, or raw-memory freshness changes.

## Authority ceiling

Both the raw record and authenticated envelope carry `executionAuthority: false`.

This implementation does not add an HTTP route, database write, credential, provider implementation, provider mutation, merge authority, deploy authority, publication authority, payment authority, purchasing authority, or destructive-action authority.

External continuity-only projects remain ineligible for authenticated decision support.

## Rollback

Before integration, close the candidate PR. After integration, revert the authenticated-ingress module, its tests, and these documentation updates. No external provider or database rollback is required because this boundary performs no external mutation.
