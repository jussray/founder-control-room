# Authenticated Unified Memory Ingress Review Boundary

This note exists only to make the first authenticated-ingress review surface explicit.

The candidate does **not** add an HTTP route, provider implementation, credential, database write, external mutation, merge authority, deploy authority, publication authority, payment authority, or destructive-action authority.

The load-bearing invariants are:

- raw `NativeMemoryObservation` input must still pass `normalizeUnifiedMemoryObservation()` first;
- the normalized raw record remains `sourceVerification: untrusted-import`, `decisionSupportUsable: false`, and `executionAuthority: false`;
- source authentication is supplied only through `AuthenticatedUnifiedMemoryTrustRoot.authenticateSource()` after normalization;
- a source witness must bind the exact normalized record through its `continuityFingerprint`, not merely its repository and source SHA;
- current project authority is supplied only through `AuthenticatedUnifiedMemoryTrustRoot.resolveCurrentProjectAuthority()`;
- source/project witnesses must be current, bounded, exact-identity observations and cannot be reconstructed from payload fields;
- authenticated record and witness snapshots must be immutable after validation;
- external continuity-only projects cannot be promoted into authenticated decision support;
- `authenticatedMemoryForDecisionSupport()` must re-run both trust-root reads at the use boundary;
- an authenticated envelope remains `executionAuthority: false`.

This file is a review aid, not a durable authority receipt and not evidence that any live provider implementation exists.
