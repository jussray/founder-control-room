# FCR Browser Capability Routing Addendum

**Status:** founder-approved additive governance contract  
**Authority host:** `jussray/founder-control-room`  
**Parent contract:** `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`

## Purpose

Browser-capable providers extend Founder Control Room. They do not become a second operating system, authority plane, truth plane, or completion plane.

Opera is an actively preferred authenticated-browser capability when a task genuinely requires live signed-in browser state or UI-only interaction and no narrower direct provider capability can complete the work.

The canonical connector-bridge truth carrier is [`.control-room/plugin-management.json`](../.control-room/plugin-management.json). This addendum must not invent a competing connection-state taxonomy.

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

Installation state is not live connection truth.

Keep these evidence planes separate:

- connector/app installed, enabled, or otherwise surfaced;
- connector tools available to the current ChatGPT/FCR session;
- live connector session exposed by a current read-only bridge probe;
- authenticated provider-page state observed after the bridge is live;
- authority for the exact requested action.

A browser bridge may be called `CONNECTED` only after a current live read-only probe succeeds. For Opera Browser Connector, `list-tabs` is the canonical first live probe while that connector exposes it. A successful response with zero open tabs may still prove the bridge itself is live; the existence of a specific tab is a separate provider-page fact.

If the connector surface exists but the live probe returns `Browser not connected`, classify the bridge as `BLOCKED_CONNECTOR_BRIDGE` in alignment with `.control-room/plugin-management.json`. Do not infer that the founder is logged out of Facebook, that the Facebook tab is closed, that local setup is wrong, or that the provider page needs to be reset unless separate provider evidence proves that claim.

Never claim that a connection probe was retried unless that live read-only probe actually executed in the current turn or execution context. When the founder reports a connection/setup change or asks to continue, re-probe the bridge before repeating provider setup guidance.

Connection continuity must bind current probe evidence. A materially different live-probe result expires the predecessor bridge claim. Continuity fingerprints and proof cookies remain non-secret state markers only; they never contain credentials, browser tokens, browsing history, or provider session secrets, and they never create or renew authority.

A successful bridge probe proves only that the browser bridge is live. It does not prove the target page is authenticated, the target data exists, the requested mutation is authorized, or the requested outcome occurred.

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
→ Otherwise browser-only authenticated state required and Opera live-probe current/sufficient? use Opera
→ Otherwise another authenticated browser bridge available and sufficient? use it
→ Otherwise use the smallest generic browser automation path
→ Recheck authority
→ Execute bounded action
→ Capture receipt
→ Verify required outcome
→ Next Gate
```

## Opera interpretation

Opera Browser Connector / Opera Neon-class browser capability may be used as the preferred authenticated browser execution surface when its current capabilities are appropriate, connected, and available. It remains subordinate to FCR and must not become a separate router, approval system, evidence model, or completion authority.

The product architecture remains provider-agnostic. Opera is a preferred browser capability, not an architectural dependency. Replacing it with another compatible authenticated browser bridge must not change FCR's authority or truth semantics.

## Blockers

The following are cohesion blockers:

- routing through a browser provider when a direct scoped provider capability already satisfies the task without a justified reason;
- failing to use connected Opera for a browser-only authenticated task without an evidence-backed reason another path is safer or more capable;
- treating installation, enablement, permission, or tool visibility as proof of a live browser bridge;
- claiming `CONNECTED` without a successful current live probe;
- claiming a connector retry without probe execution evidence;
- repeating provider login/setup/reset instructions after a bridge-only failure without provider-page evidence;
- treating browser login/session state as authorization;
- unbound browser clicks after the approved proposal changed;
- claiming completion from browser navigation without the required provider/outcome evidence;
- storing secrets or credentials in fingerprints/proof cookies;
- creating a second browser-specific approval or truth system;
- retrying an ambiguous mutation without reconciling whether it already executed.
