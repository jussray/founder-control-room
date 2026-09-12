# Delegated Codex Chat + Claude Merge / Deploy Authority

## Founder decision

Effective 2026-09-12, Juss grants standing delegated authority inside `jussray/founder-control-room` to exactly two registered principals:

- `codex-chat`: `merge_authority=true`, `deploy_authority=true`
- `claude`: `merge_authority=true`, `deploy_authority=true`

This is a bounded execution grant, not a name-based bypass. A model string, chat identity, GitHub actor name, workflow input, remembered conversation, proof cookie, or caller assertion cannot satisfy principal identity. FCR must resolve the principal through a registered adapter attestation before the grant can be evaluated.

## Red Team I — obvious bypasses

The grant fails closed when any of these are missing or stale:

1. exact repository, base SHA, head SHA, and current `main` identity;
2. exact-head machine proof required by the repository;
3. fresh evidence inside the policy window;
4. trusted independent review with its own verified attestation;
5. zero unresolved blocking findings;
6. rollback or safe forward-fix;
7. for deploy, exact `head == current main` and an already-aligned migration state.

A principal may not self-review its own material patch and then consume its own review as independent evidence. `codex-chat`, `claude`, and the trusted deterministic witness are the only v1 review identities accepted by this policy, and the review attestation must itself be verified.

## Red Team II — deeper authority attacks

The grant must resist:

- stale-head or stale-base replay;
- copied chat text pretending to be adapter identity;
- arbitrary reviewer strings pretending to be independent review;
- cross-repository scope bleed;
- reusing a prior green packet after `main`, head, diff, provider, or review state changes;
- using merge authority as database, secret, auth/RLS, billing, publication, DNS/provider-ownership, deletion, or migration authority;
- using deploy authority to smuggle pending migrations through the existing bundled founder Deploy workflow;
- treating provider acceptance, a Wrangler success, Pages success, or a green workflow badge as verified production outcome;
- allowing the same acting principal to manufacture the independent review that unlocks its own consequential action.

## Migration boundary

`deploy_authority=true` does **not** delegate database-migration authority.

The existing founder `Deploy` workflow currently includes Supabase migration reconciliation/push. A delegated agent must not use that bundled path when migrations are pending or unknown. Delegated deployment is eligible only when the remote migration ledger is already aligned and the actual execution path performs no migration mutation.

If migrations are pending, the action stops at `migration_authority_not_delegated` and returns to the separate founder/database authority gate.

## Outcome truth

Merge/deploy authorization governs whether the transition may execute. It does not rewrite the Truth Plane.

```text
authority granted
→ merge/deploy executes
→ provider acceptance = execution evidence
→ independent runtime/outcome evidence
→ only then may completion be VERIFIED
```

A successful deploy with missing runtime identity, failed health, stale evidence, or unknown user-visible outcome remains execution-accepted / outcome-unverified.

## Scope ceiling

This v1 grant applies only to `jussray/founder-control-room`. Expanding to another repository or another agent principal requires another explicit founder decision and a corresponding registry update.

The machine-readable source is `security/delegated-agent-authority.json`; the executable evaluator is `src/authority/delegatedAgentAuthority.ts`.
