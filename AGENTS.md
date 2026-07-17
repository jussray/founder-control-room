# Founder Control Room Agent Instructions

Read [`GLOBAL_AI.md`](./GLOBAL_AI.md) and [`skills/portfolio-control-plane/SKILL.md`](./skills/portfolio-control-plane/SKILL.md) before changing code, configuration, schemas, providers, verification contracts, or documentation.

Use the exact stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

## Required loop

1. Inspect the repository, branch, provider state, auth boundaries, migrations, tests, and relevant runtime evidence.
2. Attack the premise before designing a solution.
3. Map authority, provenance, project boundaries, event history, and rollback.
4. Attack the selected plan before implementation.
5. Make the smallest coherent change and verify it.
6. Report proof and the next founder approval gate.

## Non-negotiable boundaries

- Preserve the `RepositoryProvider` abstraction.
- Keep Control Room Supabase, credentials, and data separate from Se’kret Bip.
- Never copy raw teen, journal, voice, media, or parent-visibility data into operational storage.
- Preserve founder allowlist authorization, audit events, and separate approval gates.
- Do not expose provider tokens or service-role keys.
- Do not merge, deploy, roll back, alter auth/RLS, or perform destructive writes without explicit founder approval.
- Apply repository-specific skills when acting on managed projects; portfolio rules never replace local product, privacy, verification, or rollback contracts.

## Evidence report

List files changed, behavior changed, tests run, failures or skips, security impact, provider impact, rollback, unresolved risk, and next gate.
