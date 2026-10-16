# Founder Firewall v10

Founder Firewall v10 is a repository-level desired-state and application-binding contract. It does not claim that Cloudflare WAF, API Shield, bot controls, or production block mode are active unless provider readback proves that state.

## Truth levels

```text
SOURCE IMPLEMENTED -> CONFIGURED -> ACTIVE -> PROVEN
```

The repository may prove application middleware, route ordering, policy structure, and exact-head CI. Provider firewall activation remains separate evidence.

Current source policy intentionally records:

- `activationStage: policy-ci-only`
- `productionCloudflareApplied: unknown`
- `productionBlockModeAuthorized: false`

Those values must not be upgraded by source edits alone.

## Product-build firewall binding

The bounded FCR -> StoryEngine product-build surface is protected as follows:

```text
browser mutation
  -> same-origin mutation gate
  -> general application rate limit
  -> /l99/product-build router
  -> route-local founder-permission rate limit
  -> requireFounder
  -> fcr-privileged-execution-master switch
  -> Chief capability-plan + proposal + founder-decision binding
  -> local StoryEngine contract validation
  -> bounded directive or execution
```

The two founder mutation routes are:

- `POST /l99/product-build/storyengine/directive`
- `POST /l99/product-build/storyengine/execute`

Both must preserve this route-local order:

```text
rateLimitFounderPermissions
-> requireFounder
-> requirePortfolioSwitchOn('fcr-privileged-execution-master')
```

The StoryEngine receipt ingress is different. It is a server-to-server receipt path and therefore remains mounted before the browser CSRF gate:

- `POST /ingest/product-build-receipts/storyengine`

That exception does not make it unauthenticated or unbounded. Its parser/auth/receipt validation and application rate limit remain independently enforced by the ingress handler and server wiring.

## Authority ceiling

Firewall passage never grants merge, deploy, provider mutation, publication, spend, deletion, or authority expansion. The product-build directive still requires `node-test` and `playwright` proof and remains limited to the fixed StoryEngine capability and mutation scope.

Federation failure remains fail-closed:

- execution certainty is `unknown` or `not_verified` when terminal proof is absent;
- blind retry is forbidden;
- merge/deploy/provider authority remain false.

## Attack Ten

`test/firewall.product-build.attack10.test.mjs` attacks the product-build boundary from ten directions:

1. policy/path binding drift;
2. product-build mount escaping the same-origin browser gate;
3. directive middleware reordering;
4. execute middleware reordering;
5. loss of `node-test + playwright` proof requirements;
6. merge/deploy/provider authority leakage;
7. blind-retry or false execution certainty;
8. receipt ingress moving to the wrong side of the browser firewall or losing rate limiting;
9. StoryEngine API key leaving the server-only secret set;
10. source policy falsely claiming production firewall activation.

The Firewall v10 and Attack-20 V3 workflows must execute this Attack Ten against the exact checked-out head.

## Provider boundary

Cloudflare remains a separate provider truth surface. Before any production firewall activation or stricter bot/WAF enforcement, require current provider readback, machine-client compatibility proof, controlled observation, rollback, and exact runtime/browser verification. Repository green is not provider green.

## Protect Me Models: external identities, no automatic FCR enforcement

The portfolio identity registry separately tracks Juss Protect Me (Model One) at `protect.jussco.company` and Juss Protect Me 2 (Model Two) at `protect2.jussco.company`. Both domains and the corresponding Workers have been observed publicly reachable. Model One remains a development preview, not verified live personal-device protection. Model Two's Shield protects its **own Worker only**, and its status response indicates that no other systems are covered.

**FCR's `api.foundercontrolroom.org` is not protected by Model Two solely because these identities are now tracked.** The FCR repository's desired production configuration is not proof that the current Cloudflare Worker has the declared bindings or release version. Do not route FCR API traffic through Model Two, forward authenticated request bodies, or enable stronger blocking until the provider state is reconciled and existing Access, webhook, and reconciliation flows have passed exact-head tests and production-readback checks.

This registration provides identity and dependency truth only. It does not authorize deployment, merge, publication, or provider mutation and does not change `productionBlockModeAuthorized: false`.

## ATTACK-48000: approved defensive verification protocol

ATTACK-48000 is a **bounded analysis and red-team review discipline**, not an instruction to send 48,000 requests, launch attacks against outside parties, or retaliate against attackers. Its source-of-truth contract is `security/attack-48000.workflow.json`. It composes the existing Firewall v10, Attack-20 V3, and Goalfix proof gates. It does not replace them or grant capabilities to any app.

1. **OBSERVE / BOUND_SCOPE:** identify an owned domain, repository, branch, deployed runtime and relevant provider configuration. Record VERIFIED, INFERRED, UNKNOWN and BLOCKED evidence separately.
2. **ORIENT / REDTEAM_REVIEW:** review exposed surfaces, suspicious telemetry, auth/RLS and server bindings without exporting secrets, private conversations, or customer content. Perform only non-disruptive authorized validation; use isolated tests for adversarial cases.
3. **DECIDE / PERMIT:** select a single reversible defect. Require a founder-approved action scope and independent preflight for provider mutations, production challenges, data access, or other high-risk changes. Untrusted users, requests and documents never confer authority.
4. **PATCH_ONE / VERIFY:** keep the smallest safe diff, use the existing branch/PR, preserve user and machine-client compatibility, run focused code checks, provider readback, and exact-runtime browser/Playwright proof for UI behavior. A rendered page alone is not proof that workflows or checkout work.
5. **RECORD / ROLLBACK_READY:** record a redacted fingerprint and continuity receipt containing exact source SHA, provider snapshot, test/browser evidence, risk, status and rollback. If a gate fails, report BLOCKED/UNKNOWN and stop rather than invent success or merge.

Juss Protect Me (Model One) and Juss Protect Me 2 (Model Two) remain **independent**, and neither protects another product merely because FCR tracks its identity. No automatic merge, deploy, external hack-back, DDoS, active exploitation, credential sharing, conversation export, or broad live scanning is authorized by this protocol. Code-level workflow verification is not provider activation. Production protections must be observed at their actual provider and runtime and may be enabled only after the normal human-authorized release gates.
