# L99 Interactive Authority Boundary

Terminal, browser, and sandbox access are explicit capabilities, not ambient agent powers.

- `terminal.read`: inspect bounded command output or files without mutation.
- `terminal.exec`: execute only an explicit command allowlist inside an approved target scope.
- `browser.open`: open/navigate only; it never carries external mutation authority.
- `browser.read`: inspect rendered state.
- `browser.interact`: bounded UI interaction; UI/runtime claims require Playwright proof.
- `browser.external_mutation`: submit/send/publish/purchase or another external side effect; requires a founder-bound receipt and exact action binding.
- `sandbox.create`: create an isolated environment from zero ambient authority.
- `sandbox.read`: inspect sandbox state without widening network, secret, production, or persistence access.
- `sandbox.exec`: execute only an explicit allowlist and only when exact input and environment fingerprints are bound.
- `sandbox.snapshot`: create an internal snapshot without external export authority.
- `sandbox.export`: move a specific output across the sandbox boundary only with founder receipt and exact output fingerprint.
- `sandbox.destroy`: terminal sandbox lifecycle mutation; requires founder receipt.

## Runtime shape boundary

TypeScript types are not runtime authority. Any envelope crossing JSON, provider, workflow, MCP, browser, or other runtime boundaries must pass the runtime shape guard before it can be validated or derived.

The guard rejects unknown capability identifiers, unknown top-level or nested authority fields, non-boolean authority flags, malformed fingerprint/isolation objects, non-string target/operation collections, and missing/invalid required fields. Valid envelopes also require at least one non-blank target and one non-blank allowed operation. An unknown field must never become a shadow permission that sits outside the validated/hash-bound contract.

## Monotonic derivation

A capability is a typed authority boundary, not a scalar permission level. A downstream envelope may narrow targets, operations, expiry, isolation, and evidence bindings **inside the same exact capability**, but it may not change the capability identifier.

For example, `sandbox.export` cannot derive `sandbox.exec`, `sandbox.create` cannot derive `sandbox.snapshot`, and `browser.external_mutation` cannot silently become `browser.read`. If a later stage needs a different capability, it must obtain a separate grant for that capability. This avoids authority laundering through relationships that look numerically “weaker” but authorize a different execution surface or lifecycle action.

`externalMutation` is also sticky security metadata. If the approved parent classifies an operation as externally mutating, a child may not relabel the same capability/operation as non-mutating to escape mutation-specific gates. A different risk classification requires a separately justified grant rather than silent derivation.

## Fingerprints

Fingerprints prove identity, not permission. A matching fingerprint can establish that the exact input, environment, or output is the object under discussion, but it cannot create a capability, widen an authority envelope, or replace founder approval.

L99 fingerprints use the repository's existing cryptographic identity convention: each non-null fingerprint must be a **64-hex SHA-256 digest**. Friendly labels, opaque names, timestamps, provider IDs, or arbitrary nonempty strings are not fingerprints and must not satisfy an identity binding.

The interactive envelope may bind:

- `inputFingerprint`: SHA-256 of the exact source/input packet used for execution;
- `environmentFingerprint`: SHA-256 of the exact sandbox/tool/runtime environment manifest;
- `outputFingerprint`: SHA-256 of the exact artifact/result permitted for export or downstream proof.

If an upstream envelope already binds a fingerprint, every downstream envelope must preserve that exact digest. A downstream stage may add a previously-unbound fingerprint as evidence becomes available, but it may not replace a bound digest.

A syntactically valid digest is necessary but not sufficient evidence. The receipt-aware executor must recompute the relevant SHA-256 from the exact canonical bytes/manifest at the point where identity matters and compare it to the bound digest. Merely receiving a 64-hex string from an untrusted caller does not prove identity.

Fingerprint lineage should eventually support the same proof shape used elsewhere in FCR:

```text
source/input fingerprint
        ↓
environment/runtime fingerprint
        ↓
execution fingerprint
        ↓
output/artifact fingerprint
        ↓
provider/runtime witness
```

A fingerprint mismatch is an identity failure. A fingerprint match is not an authorization grant.

## Sandbox default

The current Founder OS sandbox already starts from a zero-ambient-authority posture: network, providers, database, filesystem, environment, subprocess, secrets, dynamic code, wall clock, randomness, and public URLs are disabled by default. L99 preserves that default. Any future access to network, secrets, production, or persistent storage must be an explicit, founder-bound grant rather than an implicit property of being inside a sandbox.

## Current terminal integration state

The legacy guarded terminal is now **read-only execution**. Commands classified `read` may still run under the existing founder, terminal-enabled/loopback, project-verification, mission, command-registry, and exact-head guards.

Commands classified `verify` or `write` are fail-closed on the legacy route and return `L99_AUTHORITY_REQUIRED` with `L99_APPROVAL_RECEIPT` as the missing authority. `confirmWrite: true` is not execution authority.

This distinction is intentional. A registry entry such as `npm test`, `npm run build`, Playwright, or a repository Python script is executable code from the checked-out repository head. Exact SHA proves which source is present; it does not prove the source is safe to execute. An in-review or otherwise untrusted head can redefine repository scripts, so `verify` must not be treated as equivalent to `read`.

Command Bridge preserves the same boundary:

- `read` risk may resolve to the guarded terminal endpoint;
- `verify` and `write` risk receive no runnable terminal endpoint and instead require `L99_APPROVAL_RECEIPT`.

The current repository has one production instantiation of `GuardedTerminalRunner`: the terminal HTTP route. Other current constructor references are the runner implementation/tests. Therefore this deny fuse sits on today's real caller rather than beside it.

This is a **deny-until-integrated safety fuse**, not completed executable authority wiring. The repository does not yet verify an L99 ApprovalReceipt and then execute an approved `verify` or `write` command. That later integration must run through an isolated execution boundary, bind the exact operation ID to a separately reviewed fixed command template, and reread authoritative policy/approval state immediately before execution.

Terminal operation IDs are bounded policy identifiers, not shell fragments or filesystem paths. The future executor must resolve an approved ID through a fixed registry/template mapping; it must never pass the operation ID or user-supplied text directly to a shell or interpreter.

n8n may coordinate these capabilities but cannot widen them. A workflow, prompt, MCP handle, terminal route, browser session, Playwright session, sandbox instance, or fingerprint is not an authorization grant by itself.

Any later execution integration must preserve the exact capability, mutation classification, target, operation, isolation envelope, expiry, fingerprint bindings, reservation, and action hash approved upstream, and must reacquire runtime/UI proof where the integrated surface is user-visible or interactive.
