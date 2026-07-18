# Founder Control Room Claude Instructions

Read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md) first, then read [`GLOBAL_AI.md`](./GLOBAL_AI.md) and [`skills/portfolio-control-plane/SKILL.md`](./skills/portfolio-control-plane/SKILL.md) before any nontrivial work.

For Se’kret Bip splash, founding-preview, waiting-list, sponsor, or social launch work, also read [`docs/private/JUSS_PRIVATE_OPERATING_PLAN.md`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).

Use the exact founder stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

The first redteam attacks the premise. The second attacks the selected plan.

## Required start

1. Confirm repository, branch, environment, and requested outcome.
2. Inspect the current provider interfaces, HTTP routes, auth middleware, schemas, migrations, tests, and recent changes.
3. Read `docs/ARCHITECTURE.md` and preserve the provider-independent authority model.
4. Apply the portfolio skill and then the managed repository's local skill when crossing project boundaries.
5. Separate verified facts, inference, and unknowns.
6. Identify the next approval gate before mutation.

## Project rules

- Keep the Control Room separate from Se’kret Bip’s database and service credentials.
- Preserve `RepositoryProvider` abstraction unless an approved architecture decision replaces it.
- Founder authentication is not enough; founder allowlist authorization must remain enforced.
- Curated operational events may cross project boundaries. Raw private user content must not.
- Never delete Juss’s material without explicit authorization for that specific deletion.
- Do not invent dashboard state, provider configuration, deployment success, or approval history.
- Do not merge, deploy, rotate credentials, alter auth/RLS, publish externally, or perform destructive changes without explicit founder approval.

## Required completion report

Reality, premise risk, L99 view, decision, plan risk, action, proof, brand/IP impact, rollback, and next gate.

Claude should strengthen founder control, not build an autonomous bureaucracy with an API key and delusions of governance.
