# Redteam I / II — Prompt Workflow Router

## Premise attack

- Risk: a prompt catalog becomes ceremonial complexity. Mitigation: deterministic small stacks, not every mode on every task.
- Risk: harsh prompts manufacture criticism. Mitigation: Investor Redteam and 10truth require evidence and falsification.
- Risk: mode names become hidden privilege escalation. Mitigation: system-owned mode registry + selector cannot grant execution authority.

## Implementation attack

- Demonstrated gap: route module can exist while production server never mounts it. Mitigation: explicit failing server-mount gate and no-fake-live stop gate.
- Risk: unit tests become fake green while deployed SHA differs. Mitigation: `/version` exact SHA is required by Playwright runtime proof.
- Risk: external text triggers modes. Mitigation: existing portable control-input trust boundary remains canonical.
- Risk: unsupported intent silently maps to something dangerous. Mitigation: fail closed with `unsupported builder prompt intent`.
- Risk: auth alone is confused with action approval. Mitigation: route returns `executionAuthorized: false` and `authorityChanged: false`.

Highest-value remaining fix: mount the route in `src/http/server.ts`, then execute the focused proof chain.
