# Redteam II — Attack the Selected Figma Plan

## Selected plan

One canonical portfolio contract, seven repository-local skills, seven machine-readable profiles, explicit activation in every `AGENTS.md`, and conditional Code Connect.

## Attacks and controls

### Duplicated skill text can drift
Control: the shared protocol is canonical in Founder Control Room; local files contain only the common minimum plus repository-specific runtime and data rules.

### Profiles can become stale
Control: every skill requires current repository inspection before use. Profiles identify the expected boundary, not immutable architecture truth.

### Agents can ignore the skill
Control: each repository's `AGENTS.md` explicitly activates the skill and profile for Figma/design work.

### A JSON profile can be treated as implementation truth
Control: profiles declare runtime and proof boundaries but require code/runtime inspection. They do not list completed features.

### Code Connect can create false confidence
Control: mapping is forbidden until published components, exact node URLs, eligible plan access, verified props, exhaustive variants, and reviewed config exist.

### Private data can leak through realistic fixtures
Control: every profile enumerates prohibited data and requires synthetic/redacted examples.

### Design can outrun code
Control: completion requires implementation status and drift reporting. `design_ready` and `implemented_local` are separate states.

### Existing PR stacks can conflict
Control: each branch is stacked on the repo's existing 5W1H/AI-contract branch rather than overwriting `AGENTS.md` from `main`.

## Residual risks

- Skills are unmerged draft work until their base branches and exact-head gates are resolved.
- No Figma library has been published by this change.
- No Code Connect mapping has been created or proven.
- Existing design files may still require token/component reconciliation.
- Hosted GitHub Actions may remain unable to provision runners.