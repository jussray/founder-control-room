# Delegated Codex Chat + Claude Merge / Deploy Authority

## Founder decision

Effective 2026-09-12, Juss grants standing **merge/deploy capability** inside `jussray/founder-control-room` to exactly two registered principals:

- `codex-chat`: `merge_authority=true`, `deploy_authority=true`
- `claude`: `merge_authority=true`, `deploy_authority=true`

This does **not** grant standing approval to execute a specific merge or production deploy. Current FCR law remains founder-final: every consequential merge or deploy must also consume a fresh, auditable founder approval bound to the exact action target, repository, base SHA, and head SHA. Base/head movement invalidates that approval.

A model string, chat identity, GitHub actor name, workflow input, remembered conversation, proof cookie, caller assertion, or `merge_authority=true` / `deploy_authority=true` marker cannot satisfy principal identity or exact-candidate founder approval.

The bounded path is:

```text
registered Codex/Claude principal
→ exact fresh proof + trusted independent review
→ fresh exact founder approval
→ durable mutation reservation
→ provider mutation
→ execution receipt
→ independent outcome verification
```

## Red Team I — obvious bypasses

The grant fails closed when any of these are missing or stale:

1. exact repository, exact action target, base SHA, head SHA, and current `main` identity;
2. exact-head machine proof required by the repository;
3. fresh evidence inside the policy window;
4. trusted independent review with its own verified attestation;
5. zero unresolved blocking findings;
6. rollback or safe forward-fix;
7. fresh founder approval bound to the exact action/target/repository/base/head;
8. durable idempotency reservation bound to the exact action/target/base/head before provider mutation;
9. for deploy, exact `head == current main`, target environment `production`, and an already-aligned migration state.

A principal may not self-review its own material patch and then consume its own review as independent evidence. `codex-chat`, `claude`, and the trusted deterministic witness are the only v1 review identities accepted by this policy, and the review attestation must itself be verified.

## Founder-final execution boundary

Standing agent capability and exact founder approval are separate authority classes.

```text
merge_authority=true
≠ merge_approved=true

deploy_authority=true
≠ deployment_approved=true
```

For merge, founder approval must bind the exact repository, PR number, current base SHA, and current head SHA. For production deploy, founder approval must bind the exact repository, production target, and exact current-main SHA through an auditable decision reference compatible with the canonical production deploy membrane.

The delegated evaluator therefore refuses execution when founder approval is missing, stale, malformed, or bound to any other candidate. A fresh green CI packet, provider mergeability, remembered approval, `approved`, `cont`, `continue`, or a prior approval for an earlier head cannot substitute for the exact founder-final receipt.

## Red Team II — deeper authority attacks

The grant must resist:

- stale-head or stale-base replay;
- replay of the same fresh authority lease against the same provider mutation;
- copied chat text pretending to be adapter identity or founder approval;
- arbitrary reviewer strings pretending to be independent review;
- cross-repository scope bleed;
- changing a PR number, deploy environment, base SHA, or head SHA after approval or reservation;
- reusing a prior green packet after `main`, head, diff, provider, review, or founder-approval state changes;
- using merge authority as database, secret, auth/RLS, billing, publication, DNS/provider-ownership, deletion, or migration authority;
- using deploy authority to smuggle pending migrations through the existing bundled founder Deploy workflow;
- treating provider acceptance, a Wrangler success, Pages success, or a green workflow badge as verified production outcome;
- allowing the same acting principal to manufacture the independent review that unlocks its own consequential action.

## Mutation identity and replay

Standing capability is not a reusable mutation token. Each merge or deploy must first own one durable idempotency reservation. The reservation is valid only when it is still `reserved` and binds the exact action, exact target, exact base SHA, and exact head SHA. Missing, mismatched, or already-consumed reservations deny execution.

The existing merge execution path already reserves `approval_executions` before provider integration. Any delegated executor must reuse an equivalent durable reservation/consumption boundary rather than calling the provider directly.

## Migration boundary

`deploy_authority=true` does **not** delegate database-migration authority.

The existing founder `Deploy` workflow currently includes Supabase migration reconciliation/push. A delegated agent must not use that bundled path when migrations are pending or unknown. Delegated deployment is eligible only when the remote migration ledger is already aligned and the actual execution path performs no migration mutation.

If migrations are pending, the action stops at `migration_authority_not_delegated` and returns to the separate founder/database authority gate.

## Outcome truth

Merge/deploy authorization governs whether the transition may execute. It does not rewrite the Truth Plane.

```text
capability present
→ exact founder approval verified
→ durable mutation reservation
→ merge/deploy executes
→ provider acceptance = execution evidence
→ independent runtime/outcome evidence
→ only then may completion be VERIFIED
```

A successful deploy with missing runtime identity, failed health, stale evidence, or unknown user-visible outcome remains execution-accepted / outcome-unverified.

## Scope ceiling

This v1 grant applies only to `jussray/founder-control-room`. Expanding to another repository or another agent principal requires another explicit founder decision and a corresponding registry update.

This policy does not override `docs/FOUNDER_MERGE_AUTHORITY.md`, the canonical production deploy authority membrane, PR Continuity, or trust-root bootstrap rules. Where a broader current-main governance contract is stricter, the stricter contract wins.

The machine-readable source is `security/delegated-agent-authority.json`; the executable evaluator is `src/authority/delegatedAgentAuthority.ts`.
