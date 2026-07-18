# Founder Control Room Terminal Fix — OODA / Red Team / Lindy / L99

## Decision

Do not bypass the Control Room to merge the store-moat pull requests. Repair the Control Room so it can produce exact-head evidence, then require the same proof path for future projects.

This is a platform fix, not a one-off script.

## OODA

### Observe

- Storefront pull requests contain the intended moat changes and explicit catalog-separation checks.
- GitHub-hosted jobs are failing before steps execute, so they provide no usable proof.
- The Control Room currently observes repository checks but cannot execute local verification commands.
- Runtime code and the live database disagree on mission branch and connection field names.
- The check normalizer does not classify Playwright as browser-test evidence.
- The private hair repository is not separately registered in the project registry.

### Orient

The durable asset is not a successful merge. It is a reusable verification plane that can:

1. bind every run to an exact commit;
2. execute only reviewed project commands;
3. capture bounded, redacted evidence;
4. make evidence queryable by missions and proof gates;
5. preserve separate founder authority for merge and deployment.

### Decide

Implement a guarded mission terminal API rather than an unrestricted shell. Align runtime field names to the live schema, register the missing private project, normalize browser-test checks, and make merge authorization reject stale or wrong-SHA evidence.

### Act

- Add an allowlisted command registry and process runner using `spawn` with `shell: false`.
- Add founder-authenticated terminal routes and immutable run records.
- Add timeout, cancellation, output limits, secret redaction, path confinement, and one-active-run-per-project controls.
- Add exact-head evidence persistence.
- Repair mission and repository lookup schema drift.
- Add tests for bypass attempts and failure modes.
- Verify the Control Room branch before integrating it.
- Only then create missions for the three store PRs and run their checks.

## Red Team I — attack the premise

### Failure: “A terminal will solve runner outages.”

Not automatically. A terminal without checked-out repositories, dependencies, browsers, or a trusted workspace is only another interface. The runner therefore requires a configured local workspace root and fails closed when a project directory is unavailable.

### Failure: arbitrary shell escape

Blocked by design:

- no caller-supplied executable;
- no caller-supplied arguments;
- no `bash`, `sh`, PowerShell, pipes, redirects, command substitution, or `shell: true`;
- command IDs resolve to reviewed executable/argument arrays;
- project paths are canonicalized beneath a configured workspace root.

### Failure: branch changes after testing

Every run requires an expected 40-character commit SHA. The runner resolves `git rev-parse HEAD` before execution and refuses a mismatch. Evidence stores the observed SHA. Merge authorization must compare the repository’s current head to the approved SHA again.

### Failure: secrets in logs

The child receives only an allowlisted environment. Known secret values and token-like patterns are redacted before storage or response. Output is capped and marked when truncated.

### Failure: malicious package lifecycle scripts

Dependency installation is classified as a write-risk command and remains an explicit founder action. Verification commands should prefer locked dependencies and reviewed lockfiles. The command registry is project-specific rather than globally reusable by unknown repositories.

### Failure: a passing manual attestation substitutes for CI

Blocked. Manual proof-gate approval remains necessary but insufficient. Merge must also have exact-head machine evidence for every required check.

## Lindy Mode

Prefer mechanisms that have survived decades of operational use:

- OS process isolation primitives over custom command parsers;
- executable plus argument arrays over shell strings;
- Git commit identities over mutable branch names;
- append-only audit records over transient console output;
- allowlists over denylist pattern matching;
- explicit state machines and idempotency keys over hidden automation;
- reversible branches and merge commits over direct file mutation on production branches.

The runner stays small. It does not become a general CI platform, remote desktop, package manager, or secret manager.

## L99 authority model

| Action | Authority |
|---|---|
| List approved commands | Founder-authenticated read |
| Run a verification command | Explicit founder request, mission-scoped |
| Cancel a run | Explicit founder request |
| Persist machine evidence | Automatic consequence of a run |
| Pass proof gate | Separate founder approval plus complete evidence |
| Merge | Separate founder approval, fresh exact-head proof |
| Deploy | Separate approval; not inherited from merge |
| Roll back | Separate approval; rollback path required beforehand |

No approval carries forward.

## Bill Gates platform lens

The leverage comes from standardization: one command contract, one evidence contract, and one approval boundary across every repository. Fixing the shared control plane compounds; writing a special script for three PRs does not.

The moat is the feedback loop:

```text
project registry
→ exact-head command execution
→ normalized evidence
→ proof gate
→ founder decision
→ integration
→ post-integration verification
→ reusable operational history
```

## Merge criteria for the current store work

The three store PRs remain blocked until:

- the Control Room repair is itself reviewed and verified;
- each target repository is registered and checked out in the guarded workspace;
- dependency, type, lint, unit, build, and Playwright commands applicable to that project execute on the exact PR head;
- Playwright verifies desktop and mobile behavior;
- negative assertions prove product catalogs remain separate;
- no skipped, runner-less, stale, truncated-critical, or `steps: null` result is treated as passing;
- a fresh merge proof gate is recorded;
- the repository head still matches the approved SHA at integration time.
