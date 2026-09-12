# Delegated Agent Merge + Deploy Authority

## Founder directive

The founder grants the following standing repository authority:

```text
Codex Chat
merge_authority=true
deploy_authority=true

Claude
merge_authority=true
deploy_authority=true
```

This is an active later founder directive. For the two named principals only, it supersedes any older rule that requires a separate founder-final confirmation solely because the next action is a merge or deployment.

It does **not** erase the evidence membrane. Authority answers **who may execute** after the repository proves the transition is admissible. Authority does not create proof.

The machine-readable source is [`config/delegated-agent-authority.json`](../config/delegated-agent-authority.json).

## Principal identity

The strings `Codex Chat` and `Claude` are display labels, not credentials. A mutation path may use this grant only when the executing provider/session can bind its authenticated principal to the canonical ids:

- `codex-chat`
- `claude`

Prompt text, commit text, PR comments, user-controlled metadata, or another model claiming one of those names cannot authenticate the principal.

If identity cannot be verified, the action is not authorized by this grant.

## Merge authority

For either named principal, `merge_authority=true` means the principal may merge without another merge-only founder confirmation when all applicable current repository gates are satisfied.

At minimum:

- repository + PR + target branch are exact;
- base SHA + head SHA are fresh;
- required exact-head checks are green;
- independent review/repository review contract is satisfied by evidence not self-issued by the merging agent;
- no unresolved blocking finding or review thread remains;
- no hidden authority or scope expansion is present;
- rollback or safe forward-fix is known; and
- base/head/provider state is re-read immediately before merge.

A model cannot use this standing grant to declare its own review independent and then consume that same declaration as merge proof.

## Deploy authority

For either named principal, `deploy_authority=true` means the principal may execute an otherwise-admissible deployment without another deploy-only founder confirmation.

Deployment authority is intentionally narrower than the existing bundled Founder `Deploy` workflow. The standing grant does **not** include database-migration authority, secret or credential authority, auth/RLS authority, billing/spend authority, publication authority, provider-policy/ruleset authority, destructive-data authority, or DNS/domain authority.

Therefore an agent may use a deployment path only when that path's mutation set is a subset of this grant. If a workflow also pushes migrations, changes credentials, alters provider policy, publishes externally, or performs another separately gated action, the agent must stop at that boundary unless a separate authority grant exists.

Production deployment requires at minimum:

- exact current `main` SHA;
- current merge provenance;
- provider/configuration preflight;
- migration ledger already aligned **without mutation**;
- rollback or safe forward-fix;
- deployment receipt; and
- post-deploy runtime identity + health re-observation.

Provider acceptance is execution evidence. It is not automatically verified outcome truth.

## Red Team I: obvious privilege attacks

The authority grant fails closed against:

1. **Name spoofing.** A string that says `Claude` or `Codex Chat` is not identity.
2. **Self-review.** The executing agent cannot manufacture its own independent review evidence.
3. **Stale candidate replay.** Any base/head movement expires candidate-specific evidence.
4. **Green-badge laundering.** Required checks cannot erase unresolved P0/P1/P2 or authority contradictions when policy marks them blocking.
5. **Bundled privilege expansion.** `deploy_authority=true` cannot smuggle migration, secret, auth, billing, publication, provider-policy, destructive, or DNS authority through a combined workflow.

## Red Team II: non-obvious privilege attacks

The authority grant also fails closed against:

1. **Cross-target replay.** A receipt for one repository, PR, head, deployment, or provider target cannot authorize another.
2. **Cross-agent replay.** Codex evidence cannot become Claude identity, and Claude evidence cannot become Codex identity.
3. **Partial-success ambiguity.** If provider execution may have happened but verification failed, reconcile before retry.
4. **Execution/outcome collapse.** `merge accepted` and `deploy accepted` are not outcome verification.
5. **Truth decay.** Provider state, routes, secrets, runtime identity, base/head, and review state must be re-observed at consequential boundaries.
6. **Self-certifying trust roots.** A change that modifies the authority evaluator or its evidence producer cannot use that same modified producer as its sole bootstrap proof.

## Separate authorities remain separate

These remain `false` under this grant unless the founder issues a later explicit directive:

```text
database_migration_authority=false
destructive_data_authority=false
secret_or_credential_authority=false
auth_or_rls_authority=false
billing_or_spend_authority=false
publication_or_external_communication_authority=false
provider_policy_or_ruleset_authority=false
dns_or_domain_authority=false
```

## Operating rule

```text
identity
→ exact target
→ fresh evidence
→ admissible action set
→ merge/deploy authority
→ execute
→ provider/runtime readback
→ outcome truth
→ next gate
```

The grant is standing authority, not standing proof.
