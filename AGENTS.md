# Founder Control Room Agent Instructions

## Required repository skill

Read `.agents/skills/founder-control-room-operator/SKILL.md` before nontrivial work. Use its 5W1H contract as active reasoning: establish who, what, where, when, why, and how; inspect missing answers; and ask only when an unknown materially changes the safe action or authority.


Read [`GLOBAL_AI.md`](./GLOBAL_AI.md) before changing code, configuration, schemas, providers, or documentation.

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

## Figma build and implementation

For every Figma, dashboard design, design-system, design-to-code, Code Connect, prototype, or visual QA task, also read `.agents/skills/figma-build-implement/SKILL.md` and `.figma/repository-profile.json`.

Figma is a founder specification and review surface. It cannot create mission truth, evidence provenance, provider truth, approval authority, migration state, integration proof, deployment proof, or rollback authority. Use only synthetic or sanitized operational data.

## Evidence report

List files changed, behavior changed, tests run, failures or skips, security impact, provider impact, rollback, unresolved risk, and next gate.