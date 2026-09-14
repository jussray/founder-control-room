# Delegated Codex Chat + Claude Merge / Deploy Authority

## Founder decision

Effective 2026-09-12, Juss grants standing **merge/deploy capability** inside `jussray/founder-control-room` to exactly two named policy principals:

- `codex-chat`: `merge_authority=true`, `deploy_authority=true`
- `claude`: `merge_authority=true`, `deploy_authority=true`

This PR is deliberately **policy-only**. It does not activate provider mutation.

```text
standing capability
≠ standing execution approval
≠ authenticated principal identity
≠ provider mutation authority
≠ verified outcome
```

Current FCR law remains founder-final. Every consequential merge or production deploy must consume a fresh, auditable founder decision bound to the exact action target, repository, base SHA, and head SHA. Base/head movement invalidates that approval.

The source evaluator in this PR may classify whether an observed request is eligible to enter a future trusted resolver, but it always returns:

```text
executionAuthorized = false
completionClaimAllowed = false
activationRequired = true
```

A model string, chat identity, GitHub actor name, workflow input, remembered conversation, proof cookie, caller assertion, `attestationVerified: true`, `independentReviewPassed: true`, or `merge_authority=true` / `deploy_authority=true` marker cannot authorize a merge or deploy.

## Why activation is separate

Red Team review found that a direct evaluator fed by caller booleans would be vulnerable to identity spoofing, fabricated independent review, stale or unrelated candidate refs, omitted restricted capabilities, missing deploy preflight, author self-review, and caller-asserted outcome verification.

The policy layer therefore stops before execution. Live activation must compose existing trusted FCR kernels rather than accepting caller claims.

The required activation path is:

```text
server-owned Codex/Claude principal resolution
→ RepositoryProvider live PR/base/head/author/diff readback
→ provider-backed independent-review gate
→ validated founder decision receipt bound to the exact action request
→ server-derived execution-path capability classification
→ current provider preflight receipt
→ durable idempotency reservation
→ provider mutation
→ execution receipt
→ independent post-action outcome verification
```

Until that complete path exists and is separately proven, #797 does not authorize provider mutation.

## Trusted activation requirements

### Principal identity

The activation layer must resolve the acting principal from server-owned adapter/attestation state. Caller-provided identity strings, adapter refs, or verification booleans are observations only and cannot become authority.

### Candidate truth

For merge, the activation layer must use `RepositoryProvider` to read the exact PR context, current base SHA, current head SHA, candidate author, complete diff, and exact-head verification signals. Caller-supplied SHAs cannot establish freshness.

### Independent review

Activation must reuse the existing `evaluateIndependentReviewGate(...)` path. That gate binds repository, PR, base/head, diff hash, policy hash, provider-backed witness, and provider-observed author identity, and rejects author self-review. The lightweight policy preflight in this PR is not a substitute.

### Founder-final authority

Activation must consume the existing founder-decision/permission receipt kernel, not a caller boolean. The receipt must be founder-authored, fresh, canonical, exact-request-bound, and tied to the authenticated founder context.

### Restricted capability classification

The activation layer must derive consequence/capability scope from the exact server-owned execution path. A requester cannot self-report an empty restricted-capability list to bypass migration, secret, auth/RLS, billing, publication, DNS/provider ownership, or destructive-action boundaries.

### Deploy preflight

`deploy_authority=true` does not make the current bundled Deploy workflow safe for delegated execution. Delegated deployment remains inactive until a non-migrating production execution path exists and a fresh provider preflight receipt proves the exact current-main target and provider state.

### Outcome truth

This policy layer can never produce a verified completion claim. Provider acceptance remains execution evidence only. VERIFIED production requires a fresh, independently observed outcome receipt tied to the exact deployment/runtime identity.

## Red Team I — obvious bypasses

The policy preflight rejects malformed or stale observations, including:

1. unsupported runtime actions;
2. unknown principals or caller-asserted identity mode;
3. wrong repository or malformed action target;
4. malformed or stale SHAs/evidence;
5. stale candidate/main relationship;
6. missing observed checks/review/rollback;
7. unresolved blockers;
8. fresh founder approval missing or bound to another action/target/repository/base/head;
9. missing, consumed, or mismatched mutation reservation;
10. pending/unknown migration state for deploy.

These checks reduce noise before the trusted resolver, but none of them authorizes execution.

## Red Team II — deeper authority attacks

The activation design must resist:

- copied chat text pretending to be principal identity or founder approval;
- arbitrary reviewer strings or booleans pretending to be independent review;
- candidate-author self-review;
- caller-supplied current-main/head strings standing in for provider readback;
- cross-repository scope bleed;
- changing PR number, deploy environment, base SHA, or head SHA after approval/reservation;
- reusing a prior green packet after main/head/diff/provider/review/founder-approval movement;
- omitting restricted-capability labels from a dangerous execution path;
- using deploy authority to smuggle pending migrations through the bundled founder Deploy workflow;
- treating provider acceptance, Wrangler success, Pages success, a green workflow badge, or a caller boolean as verified production outcome.

## Mutation identity and replay

Each future merge or deploy execution must own one durable idempotency reservation before provider mutation. The reservation must bind the exact action, target, base SHA, and head SHA, and consumed reservations must be dead.

The existing merge execution path already reserves `approval_executions` before provider integration. Any delegated activation path must reuse that boundary or an equivalently durable server-owned one rather than calling the provider directly.

## Scope ceiling

This v1 policy applies only to `jussray/founder-control-room`. Expanding to another repository or another agent principal requires another explicit founder decision and registry update.

This policy does not override `docs/FOUNDER_MERGE_AUTHORITY.md`, the canonical production deploy authority membrane, PR Continuity, or trust-root bootstrap rules. Where a broader current-main governance contract is stricter, the stricter contract wins.

The machine-readable source is `security/delegated-agent-authority.json`; the policy preflight is `src/authority/delegatedAgentAuthority.ts`.
