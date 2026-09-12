# FCR Browser Capability Routing Addendum

**Status:** founder-approved additive governance contract  
**Authority host:** `jussray/founder-control-room`  
**Parent contract:** `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`

## Purpose

Browser-capable providers extend Founder Control Room. They do not become a second operating system, authority plane, truth plane, or completion plane.

## Routing order

For each founder intent, select the narrowest capability that can safely complete the required action:

1. **Direct provider API / connected plugin / scoped MCP capability first.**
2. **Authenticated browser bridge second** when the task genuinely requires a live signed-in browser session or UI-only provider state. Opera Neon-class browser bridges belong here.
3. **Generic browser automation last** when neither a direct provider capability nor an authenticated browser bridge can satisfy the task.

Do not add a browser layer merely because one is available. If a bounded direct provider capability can complete the task, introducing another browser provider is unnecessary dependency and evidence surface.

## Authority boundary

Browser access is capability, not authority.

- A browser provider may observe, navigate, fill, click, upload, or return provider evidence only within the authority granted by FCR for the exact action.
- Login state, an open tab, an authenticated session, a visible button, or browser-control capability never grants execution authority.
- Consequential actions still require the same live authority check, consequence classification, exact proposal binding, approval when required, idempotency/reconciliation strategy, execution receipt, and outcome verification used by every other FCR capability.
- Provider acceptance and verified founder outcome remain separate truth states.
- A browser provider may not manufacture, inherit, widen, replay, or renew founder approval.

## Evidence and continuity

Every browser-routed action must identify:

- founder intent;
- canonical capability identity;
- selected routing tier;
- provider/session subject;
- current state fingerprint;
- authority revision;
- exact proposal/arguments fingerprint for mutations;
- execution receipt or observed provider evidence;
- outcome evidence when required;
- rollback/recovery path;
- next gate.

Continuity fingerprints and proof cookies are non-secret correlation markers only. They never become browser tracking cookies, device fingerprints, session credentials, or authority tokens. Material movement in provider session, subject, authority, action arguments, runtime state, or evidence expires predecessor continuity for the current claim.

## Selection rule

```text
Founder Intent
→ Inspect current capability availability
→ Direct API/plugin/MCP available and sufficient? use it
→ Otherwise browser-only authenticated state required? use authenticated browser bridge
→ Otherwise use the smallest generic browser automation path
→ Recheck authority
→ Execute bounded action
→ Capture receipt
→ Verify required outcome
→ Next Gate
```

## Opera interpretation

Opera Neon may be used as an authenticated browser execution surface when its current capabilities are appropriate and available. It remains subordinate to FCR and must not become a separate router, approval system, evidence model, or completion authority.

The product architecture must remain provider-agnostic. Replacing Opera with another compatible authenticated browser bridge must not change FCR's authority or truth semantics.

## Blockers

The following are cohesion blockers:

- routing through a browser provider when a direct scoped provider capability already satisfies the task without a justified reason;
- treating browser login/session state as authorization;
- unbound browser clicks after the approved proposal changed;
- claiming completion from browser navigation without the required provider/outcome evidence;
- storing secrets or credentials in fingerprints/proof cookies;
- creating a second browser-specific approval or truth system;
- retrying an ambiguous mutation without reconciling whether it already executed.
