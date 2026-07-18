# Terminal AI Skill Evidence

## Decision

Founder Control Room must record repository AI-governance verification as a distinct exact-head evidence kind before a storefront mission can advance. GitHub workflow success alone is useful mirror evidence, but it cannot substitute for the Control Room mission ledger when the Control Room is the operating authority.

The guarded terminal therefore receives one allowlisted `verify.ai-skills` command per managed repository. Each command executes the repository-owned static contract and records `artifact_provenance` evidence bound to the mission and exact commit SHA.

## OODA

### Observe

- the terminal registry already verifies typecheck, lint, tests, builds, security boundaries, and Playwright;
- all four repositories contain versioned repository/operator, `/sales`, and `/devil` skills plus machine-readable contract scripts;
- mission required checks are evidence kinds, not workflow job names;
- no terminal command produced `artifact_provenance`, so a mission could not independently require AI-skill proof.

### Orient

Commercial governance is neither a typecheck nor a generic security scan. Combining it with MCP or browser evidence would let one passing check conceal a missing `/sales` or `/devil` contract. The durable boundary is one separate evidence kind produced by each repository's own verifier.

### Decide

Add:

- `founder-control-room:verify.ai-skills` using `npm run verify:ai-skills`;
- `juss-beautiful-hair-private:verify.ai-skills` using `npm run verify:ai-skills`;
- `juss-beautiful-hair:verify.ai-skills` using `npm run verify:ai-skill-contract`;
- `untold-stories:verify.ai-skills` using `npm run verify:ai-skill-contract`.

All four produce `artifact_provenance` evidence. Founder Control Room also gains an explicit `verify.terminal-contract` command producing `security_scan` evidence.

### Act

Update the allowlisted registry and strengthen the static guarded-terminal contract so a future edit fails CI if any managed repository loses its AI-skill command, evidence classification, or script mapping.

## Red Team I: premise

A governance Markdown file is not proof merely because it exists. The repository entry point, required skills, artifacts, disqualifiers, authorization boundaries, and unsafe-text exclusions must be executed by a deterministic verifier at the exact candidate SHA.

## Lindy screen

The implementation uses existing package scripts, the existing command registry, ordinary npm execution with `shell:false`, and the existing evidence taxonomy. It introduces no new service, provider, database table, or remote execution surface.

## L99 authority model

`artifact_provenance` proves only that the repository's AI-governance contract passed at an exact SHA. It does not authorize:

- outreach or external communication;
- pricing, discounts, purchasing, spending, checkout, or refunds;
- customer, vendor, secret, or sensitive-data access;
- merge, deployment, migration, rollback, or domain changes;
- terminal enablement or remote terminal access.

A sales plan is not authorization. A passing `/devil` review is not authorization. A passing AI-skill command is not founder approval.

## Red Team II: selected plan

Failure modes considered:

1. mapping AI-skill proof to `security_scan`, allowing MCP evidence to satisfy it;
2. using one script name across repositories even though their manifests differ;
3. permitting caller-supplied shell strings or arguments;
4. running a verifier from the wrong working directory;
5. recording proof for a stale or different SHA;
6. allowing truncated output to pass;
7. treating GitHub workflow evidence as transferable Control Room evidence.

Controls:

- distinct `artifact_provenance` evidence kind;
- repository-specific fixed executable and argument arrays;
- existing exact-head mission binding and checkout HEAD verification;
- existing path confinement, output caps, timeout, audit-before-execution, and truncation-to-warning behavior;
- static contract count checks for all four commands and both repository script variants.

## Rollback

Revert the registry and static-contract commit. Existing evidence rows remain immutable historical records and must not be deleted. Missions requiring `artifact_provenance` stay blocked until an equivalent reviewed command is restored.

## Definition of done

- exact-head typecheck, lint, tests, terminal/AI contracts, migration lint, and production build execute and pass;
- the change merges using expected-head protection;
- storefront missions explicitly require `artifact_provenance`;
- actual evidence is created only by a reviewed local Control Room workspace at the exact PR head;
- terminal remains loopback-only and disabled by default;
- no commercial, deployment, merge, or destructive authority is widened.
