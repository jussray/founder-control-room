# Founder Control Room Agent Instructions

Read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md) first, then read
[`GLOBAL_AI.md`](./GLOBAL_AI.md) before changing code, configuration, schemas,
providers, or documentation.

For Se’kret Bip splash, founding-preview, waiting-list, sponsor, or social launch
work, also read [`docs/private/JUSS_PRIVATE_OPERATING_PLAN.md`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).

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
- Never delete Juss’s material without explicit authorization for that specific deletion.
- Do not merge, deploy, roll back, alter auth/RLS, publish externally, or perform destructive writes without explicit founder approval.

## Evidence report

List files changed, behavior changed, tests run, failures or skips, security impact,
provider impact, brand/IP impact, rollback, unresolved risk, and next gate.
