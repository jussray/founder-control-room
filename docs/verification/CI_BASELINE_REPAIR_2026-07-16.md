# Founder Control Room baseline repair state — 2026-07-16

## OODA decision

The repository had two independent failure classes:

1. **source and workflow defects under repository control**;
2. **private GitHub Actions jobs terminating before runner provisioning**.

This branch repairs the first class and preserves the second as an explicit external blocker. It must remain draft until dependency and executable proof gates are satisfied.

## Runtime corrections included

- declare the security middleware packages imported by the active server;
- make controller leases exclusive by deleting expired claims and using a unique-key insert instead of an ignored-conflict upsert;
- separate provider-event failure updates from the retry-count RPC and surface both database errors;
- parse the already signature-verified raw GitHub webhook body as JSON;
- reject malformed JSON and contain project-resolution failures;
- harden reconciliation database functions with fixed `search_path` and service-role-only execution grants.

## CI corrections included

- run MCP boundary verification as part of the mandatory typecheck path;
- keep Typecheck, Lint, Test, and Migration lint as repository-owned signals;
- make Qodo and SonarQube detect their credentials and skip cleanly when unconfigured;
- pin the SonarQube action rather than following a mutable branch;
- use Node 24 consistently.

## Dependency-lock blocker

`package.json` now declares middleware dependencies that were already imported by source. The committed `package-lock.json` on `main` does not yet contain those new top-level dependencies.

A synchronized lockfile was generated separately from the updated package manifest, but it has not been committed through this branch. Until the reviewed lockfile is present:

- do not merge this branch;
- do not switch CI to `npm ci`;
- do not claim deterministic dependency proof;
- do not deploy the repaired runtime.

## Private runner blocker

Issue `#22` tracks the GitHub Actions control-plane condition.

An explicit rerun of CI run `29553106151` again produced completed/failed jobs with `steps: null` for Type check, Lint, Test, and Migration lint. No checkout, setup, install, repository command, or job log existed.

This is not green evidence and it is not a source-code diagnosis.

## Required promotion gates

This repair may leave draft status only after all of the following are true on one exact commit:

1. synchronized `package-lock.json` committed;
2. `npm ci` succeeds from the lockfile;
3. `npm run verify:mcp` passes;
4. `npm run typecheck` passes;
5. `npm run lint` passes with zero warnings;
6. `npm test` passes;
7. migration lint executes and produces reviewable output;
8. the workflow jobs contain real provisioned steps and downloadable logs.

## Red-team boundary

This branch does not merge the 91-commit federation draft, deploy a Worker, apply a migration, change Supabase production state, grant repository mutation authority, access secrets, or convert proposal-only missions into approved work. No approval carries forward.
