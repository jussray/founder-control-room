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

## Fingerprints

Fingerprints prove identity, not permission. A matching fingerprint can establish that the exact input, environment, or output is the object under discussion, but it cannot create a capability, widen an authority envelope, or replace founder approval.

The interactive envelope may bind:

- `inputFingerprint`: exact source/input packet used for execution;
- `environmentFingerprint`: exact sandbox/tool/runtime environment;
- `outputFingerprint`: exact artifact/result permitted for export or downstream proof.

If an upstream envelope already binds a fingerprint, every downstream envelope must preserve that exact value. A downstream stage may add a previously-unbound fingerprint as evidence becomes available, but it may not replace a bound value.

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

The legacy guarded terminal remains available for bounded read/verify commands under its existing founder, mission, command-registry, and exact-head checks. Write-risk commands are now fail-closed on that route: `confirmWrite: true` is no longer execution authority, and write requests return `L99_AUTHORITY_REQUIRED` until an exact L99 ApprovalReceipt is verified at execution time.

Command Bridge preserves the same boundary. Read/verify requests may still resolve to the guarded terminal endpoint; write-risk requests do not receive an executable terminal endpoint and instead report `L99_APPROVAL_RECEIPT` as the missing authority.

This is a **deny-until-integrated safety fuse**, not completed write execution wiring. The repository does not yet verify an L99 ApprovalReceipt and then execute the approved write command on this path. That later integration must bind the exact operation ID to a separately reviewed fixed command template and must reread authoritative policy/approval state immediately before execution.

n8n may coordinate these capabilities but cannot widen them. A workflow, prompt, MCP handle, terminal route, browser session, Playwright session, sandbox instance, or fingerprint is not an authorization grant by itself.

Any later execution integration must preserve the exact target, operation, isolation envelope, expiry, fingerprint bindings, reservation, and action hash approved upstream, and must reacquire runtime/UI proof where the integrated surface is user-visible or interactive.
