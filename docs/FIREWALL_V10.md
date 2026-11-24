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
