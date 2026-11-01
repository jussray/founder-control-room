# Canon Knowledge Policy — last-known verified evidence

**Status:** source contract / branch candidate; not a deployed registry, not a runtime or MCP capability.

## Rule

A claim genuinely verified against its exact subject and scope becomes **last-known verified canon**. The next conversation, agent, failed lookup, unavailable connector, or expired freshness lease must not turn that historical verification into an unverified event. Keep the original observation and its receipt.

A newer independently verified observation about the **same project and claim key** may **reverify** unchanged content or **supersede** changed content. An assertion, proposed edit, draft, model response, missing check, provider error, or user report alone is not a verified successor.

**Last-known verified is not current/live.** At-use claims concerning a release, merge, deployment, provider configuration, security state, customer entitlement, publication, or other consequential boundary must still pass the existing truthLease, truthDecayAudit, founder authorization, and exact-head/provider checks. An expired truth lease changes current-use eligibility, not the historical proof record.

## Source interface

src/lib/canonKnowledge.ts defines pure appendVerifiedCanon and readCanonKnowledge operations. Events contain project/key, content digest (not sensitive claim text), evidence receipt/source/verifier references, independent observed timestamp, authority, action, monotonic sequence, previous event hash, and current hash.

The append operation requires **two trusted server-side callbacks**:

1. verifyEvidence: independently validates the evidence and binds the receipt to subject, digest, authority, and observed time. Never accept verified: true from an LLM, prompt, browser payload, webhook, or the request itself as this check.
2. authorizeWrite: checks authenticated actor, exact project and claim key, and sensitivity of the change. Founder approval is required for sensitive authority/policy/production transitions, independent of this history helper.

Both gates fail closed. The reducer rejects stale/equal-time successors, subject drift, duplicate receipts, hash tampering, missing ancestors, and invalid transition types. The chain hashes protect local integrity, **not cryptographic authenticity**: trustworthy persistence requires access control, transactional append-only writes, audit logging, and (when needed) signed receipts independently verified from the authoritative provider. Do not store secrets or private customer/teen data in the events.

## Agent read/write contract

- Read canon as last verified as of <timestamp>, with its scope and evidence receipt. Do not imply a fresh live read when none occurred.
- Distinguish UNKNOWN (no established verified history), LAST_KNOWN_VERIFIED, CURRENT (fresh at-use external evidence), and CONTRADICTED/REQUIRES_INVESTIGATION (conflicting current sources).
- A newer source mismatch can block operational work while leaving the former verified observation valid *for its historical scope*.
- Promote a changed claim only after independent exact-subject evidence is checked and the corresponding scoped write is authorized.
- Keep original and successor events. Do not delete, silently overwrite, or manufacture continuity receipts.
- Share minimal evidence references with authorized agents; project-private information remains inside its approved boundary. Cross-agent sync/MCP remains a separate authenticated, permission-scoped feature, **not established by this source patch**.

## Verification and adoption

Focused unit test: node --experimental-strip-types --test tests/canonKnowledge.node.test.mjs (Node with TypeScript stripping support).

This implementation is a repository contract and library, **not** a database migration, provider-side verification service, Cloudflare deployment, or ChatGPT MCP tool. Production adoption still requires a durable append-only store, trusted verifier adapters, authentication/permission enforcement, read-only MCP exposure, corresponding integration tests, exact-head CI, provider identity readback, and separate authorized deployment. No existing runtime should substitute an untrusted callback with () => true.
