# FCR Browser Capability Routing Addendum

**Status:** founder-approved additive governance contract  
**Authority host:** `jussray/founder-control-room`  
**Parent contract:** `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`

## Purpose

Browser-capable providers extend Founder Control Room. They do not become a second operating system, authority plane, truth plane, or completion plane.

Opera is an actively preferred authenticated-browser capability when a task genuinely requires live signed-in browser state or UI-only interaction and no narrower direct provider capability can complete the work.

## Routing order

For each founder intent, select the narrowest capability that can safely complete the required action:

1. **Direct provider API / connected plugin / scoped MCP capability first.**
2. **Opera Browser Connector / authenticated Opera bridge second** when the task genuinely requires a live signed-in browser session or UI-only provider state and Opera is connected, authorized, and sufficient.
3. **Another authenticated browser bridge third** only when Opera is unavailable or insufficient for the required browser-only path.
4. **Generic browser automation last** when no direct provider capability or authenticated browser bridge can safely satisfy the task.

Do not add a browser layer merely because one is available. If a bounded direct provider capability can complete the task, introducing another browser provider is unnecessary dependency and evidence surface.

## Use-Opera rule

When Opera Browser Connector is connected and the founder intent requires authenticated browser interaction, FCR should actually route the browser-only portion through Opera rather than merely listing Opera as an architectural option.

This preference does not override a safer or more direct provider API/plugin/MCP path. It also does not authorize installation, connection, credential use, or consequential browser action by itself. Those remain separate capability and authority gates.

## Live connection truth gate

Installation state is not connection truth.

Treat these as separate evidence layers:

- plugin/app installed or enabled;
- connector tools surfaced to the current ChatGPT/FCR session;
- live browser-session handshake proven by a current read-only provider probe;
- authenticated provider/page state observed after that handshake;
- authority for any requested action.

`CONNECTED` may be claimed only after a live read-only browser probe succeeds in the current session. For the current Opera connector, `list-tabs` is the canonical first probe. A successful provider response with zero tabs may still prove the browser bridge is connected; the existence of tabs is not the gate. A provider error such as `Browser not connected` classifies the state as `BLOCKED_RUNTIME_HANDSHAKE` and forbids a connected claim.

Installed, enabled, available, permissioned, or tool-surfaced states must never be promoted into live connection truth. Likewise, saying that a connection was retried requires evidence that the live probe was actually executed in that turn or execution context.

When the founder reports that setup or connection state changed, re-run the smallest read-only live probe before repeating setup guidance. Preserve the exact provider result as current evidence. Do not invent which local setting, account state, or browser condition caused a failed handshake unless that cause is separately observed.

Connection continuity must fingerprint at least the provider identity, installation/tool-surface state when known, latest live-probe disposition, provider/session subject when returned, and evidence time or execution identity. A materially different live-probe result expires the predecessor connection claim. Fingerprints and proof cookies remain non-secret correlation markers and never contain browser credentials, session tokens, browsing history, or other secrets.

A successful connection probe proves only that the bridge is live. It does not prove the requested page is authenticated, the target data exists, the requested action succeeded, or that FCR has authority to mutate anything.

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
→ Otherwise browser-only authenticated state required and Opera connected/sufficient? use Opera
→ Otherwise another authenticated browser bridge available and sufficient? use it
→ Otherwise use the smallest generic browser automation path
→ Recheck authority
→ Execute bounded action
→ Capture receipt
→ Verify required outcome
→ Next Gate
```

For Opera, `connected/sufficient` in this selection rule means a current live connection probe succeeded. Tool visibility alone is not sufficient.

## Opera interpretation

Opera Browser Connector / Opera Neon-class browser capability may be used as the preferred authenticated browser execution surface when its current capabilities are appropriate, connected, and available. It remains subordinate to FCR and must not become a separate router, approval system, evidence model, or completion authority.

The product architecture remains provider-agnostic. Opera is a preferred browser capability, not an architectural dependency. Replacing it with another compatible authenticated browser bridge must not change FCR's authority or truth semantics.

## Blockers

The following are cohesion blockers:

- routing through a browser provider when a direct scoped provider capability already satisfies the task without a justified reason;
- failing to use connected Opera for a browser-only authenticated task without an evidence-backed reason another path is safer or more capable;
- claiming Opera or another browser bridge is connected from installation, enablement, permission, or tool visibility without a successful live probe;
- claiming a live probe was retried when no probe execution evidence exists;
- treating browser login/session state as authorization;
- unbound browser clicks after the approved proposal changed;
- claiming completion from browser navigation without the required provider/outcome evidence;
- storing secrets or credentials in fingerprints/proof cookies;
- creating a second browser-specific approval or truth system;
- retrying an ambiguous mutation without reconciling whether it already executed.
