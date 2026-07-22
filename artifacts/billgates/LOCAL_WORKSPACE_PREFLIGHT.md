# Local Workspace Preflight Artifact

## Decision

Founder Control Room already had the guarded terminal engine and `CONTROL_ROOM_WORKSPACE_ROOT` environment hook, but it did not have a dedicated reviewed-workspace runbook or deterministic preflight. Private storefront verification needs that contract because private GitHub-hosted runners can fail before checkout.

This change adds a local-workspace verifier and runbook without copying private repository source into the public Control Room repository.

## OODA

### Observe

- `README.md` and `.env.example` mention `CONTROL_ROOM_WORKSPACE_ROOT` and expected checkout names.
- The guarded terminal runner requires exact checkout HEADs and path confinement.
- The repository lacked `docs/LOCAL_WORKSPACE.md`.
- The repository lacked `scripts/verify-local-workspace.mjs`.
- Private storefront CI has returned `steps:null`, so local verification needs a crisp setup gate.

### Orient

A local workspace is operational state, not repository content. The public Control Room repository should document and verify the required sibling layout, but it must never contain private source, credentials, customer data, vendor records, Shopify data, or unpublished stories.

### Decide

Add:

- `docs/LOCAL_WORKSPACE.md` for the founder-safe loopback workflow;
- `scripts/verify-local-workspace.mjs` for exact checkout preflight;
- `npm run verify:local-workspace`;
- static terminal-contract checks so the preflight cannot disappear silently;
- README links from the guarded terminal section;
- a Product Design mission UX spec so the UI cannot imply setup is proof.

### Act

The preflight validates:

- absolute, readable `CONTROL_ROOM_WORKSPACE_ROOT`;
- sibling checkout names;
- no private checkout nested inside public `founder-control-room`;
- Git top-level root equals the expected checkout path;
- remotes match expected `jussray/*` repositories;
- mission checkout HEADs match exact Control Room mission SHAs;
- clean working trees before terminal evidence begins.

## Red Team I: premise

The premise is not “run locally because GitHub is down.” The premise is “use local execution only when private hosted runners cannot provision, and only under the same exact-head, audit, founder, and evidence boundaries as the terminal.”

## Lindy screen

The implementation uses ordinary Git commands, Node standard library process spawning with `shell:false`, fixed directory names, exact SHAs, and Markdown runbooks. It adds no new provider and no credential-handling layer.

## L99 authority model

A passing local-workspace preflight is not proof of a storefront mission. It does not authorize:

- terminal enablement;
- write-risk dependency setup;
- Playwright setup;
- verification command execution;
- merge;
- deployment;
- pricing, outreach, spending, checkout, refunds, customer communication, vendor access, or customer data access.

No approval carries forward.

## Red Team II: selected plan

Failure modes considered:

1. stale checkout head;
2. private checkout nested inside the public repository;
3. dirty working tree changing evidence;
4. spoofed wrong remote;
5. symlink or path traversal outside the workspace root;
6. treating preflight as mission evidence;
7. copying private source into public Control Room to bypass runner limits.

Controls:

- `realpath` and `relative` containment checks;
- exact 40-character mission SHA comparison;
- clean `git status --short` requirement;
- expected remote substring check;
- explicit docs that preflight is not mission evidence;
- static contract requiring the runbook and private-nesting invariant.

## Rollback

Revert the documentation, npm script, preflight script, Product Design spec, and static-contract additions. Existing missions remain sandboxed. Existing terminal and evidence rows are immutable and must not be deleted.

## Definition of done

- exact-head CI executes and passes;
- terminal contract includes the local-workspace invariant;
- the PR merges with expected-head protection;
- no private source enters the public repository;
- storefront missions remain sandboxed until actual terminal or real GitHub runner evidence exists.
