# Media Router ↔ Domain Protocol Contract v1

## Purpose

This contract defines the authority boundary between Founder Control Room's media routing/execution layer and project/domain protocols such as `/MAKEVIDEO`, Ask Me Video, `/LEEVIZE`, or later project-local approval systems.

The boundary exists to prevent a technically successful media operation from silently becoming rights clearance, factual approval, release permission, or publication authority.

## Authority rule

> **Media Router routes and stores. Domain protocols classify and approve.**

A Media Router operation may prove that work was eligible, routed, stored, fingerprinted, cost-accounted, quarantined, or revoked. Those facts do not create authority by themselves.

A domain protocol **may grant bounded authority**. When it does, the router may mirror that grant only when the grant carries a non-empty `sourceRecordId`, a non-`none` approval level, a timestamp, and a resolvable upstream domain record.

This distinction is intentional:

- execution/evidence receipts may remain non-authorizing;
- domain approval records may legitimately carry `authorityGranted: true`;
- the router cannot synthesize a domain grant from its own execution success.

## Media Router may

- recommend a route;
- reserve bounded execution budget;
- choose deterministic post-production before generative spend when the request can be completed locally;
- select an eligible direct provider;
- account for verified API free allowances separately from USD;
- store assets and immutable receipts;
- create candidate, revision, quarantine, archive, and revocation state;
- refuse an ineligible request;
- mirror bounded domain approval state when backed by upstream authority references.

## Media Router may not

- invent commercial-rights clearance;
- invent factual or regulated-claim approval;
- invent cross-project reuse permission;
- invent release permission;
- mark an output publication-authorized;
- execute publication as part of media routing.

`publicationAuthorized` is therefore a literal `false` invariant in Media Router output v1.

The following values are **not** hard-coded false: `releasePermitted`, `commercialRightsCleared`, `factualClaimsApproved`, `regulatedClaimsApproved`, and `crossProjectReuseApproved`. They may be true only when `domainAuthorityGranted` is true and the output cites matching upstream domain authority records. `releasePermitted=true` additionally requires a release receipt and a referenced `release_approved` grant.

## Protocol implementation boundary

The authoritative FCR protocol currently lives in `src/lib/mediaRouterDomainProtocol.ts` so it participates in the existing root TypeScript build without adding a second competing authority implementation.

The protocol module remains provider-agnostic and side-effect free. Routing/execution logic lives separately in `src/lib/mediaRouter.ts`.

## Media intents

The closed v1 intent set is:

- `generate`
- `edit`
- `storyboard`
- `motion_proof`
- `hero_shot`
- `assemble`
- `caption`
- `resize`
- `compose`
- `transcode`
- `overlay`
- `publish_bundle`

`compose`, `transcode`, and `overlay` are deterministic post-production intents. `edit` remains generative by default because an edit may require novel pixels or footage and must not silently downgrade to post-production.

`publish_bundle` is a classification, not publication authority.

Unknown intent values fail closed.

## Domain context

A domain context binds media work to one workspace/project and carries approval references, true authority grants, and per-input policy.

Rules:

1. `published_release` requires a non-empty release receipt.
2. Manual authority requires a human-readable reason.
3. A true grant cannot use approval level `none`.
4. A true grant must resolve to its upstream domain record before being used for an authority-sensitive output.
5. Identity/reference assets are evaluated from the bounded request/domain context, not inferred from arbitrary registry tags.
6. Per-reference `maySendToExternalProvider` policy is checked before provider cost.
7. Unknown authority-bearing fields fail closed.

## Rights changes

Authority-sensitive changes such as commercial rights, cross-project reuse, and release permission require an upstream authority reference and `authorityGranted: true`.

A continuity fingerprint, execution receipt, provider receipt, asset ID, successful render, or founder preference is not a substitute for a domain authority record.

## Output ceiling

`MediaRouterOutputV1` may mirror bounded domain approvals, but it never turns those approvals into publication authority.

Examples:

- `/MAKEVIDEO` release grant + matching release receipt → `releasePermitted: true` is valid.
- commercial-rights grant → `commercialRightsCleared: true` is valid.
- no matching upstream grant → those flags must remain false.
- `publicationAuthorized` remains false in all Media Router outputs.

Publication is a separate domain-authorized action with its own execution and proof receipt.

## Routing policy

Phase 1 route evaluation is implemented in `src/lib/mediaRouter.ts`.

Order of operations:

1. validate the complete attack-flow bundle;
2. refuse a blocked attack verdict;
3. verify request/domain identity;
4. refuse `media.publish` at the router boundary;
5. enforce release-receipt requirements;
6. use deterministic post-production when the bounded inputs make generation unnecessary;
7. enforce per-reference external-provider policy;
8. match provider capabilities;
9. prefer direct providers over wrappers;
10. in free mode, trust only API-observed free allowance;
11. enforce commercial-use capability when requested;
12. enforce request, daily, and monthly budget headroom;
13. choose by cost/quality/speed according to budget mode.

Wrapper selection is deliberately blocked in Phase 1 unless a later version adds an evidence-backed unique-value record and execution path.

## Attack-flow contract

Every governed production route requires exactly one evidence-bound record for:

1. production council
2. founder-value / GaryVee
3. Lindy
4. Red Team I
5. L99
6. Red Team II
7. OODA
8. GoalFix
9. Attack Ten
10. Attack 20
11. Attack 3000
12. Attack 6000
13. truthmode
14. confess
15. proof

A flow record needs source-record evidence, timestamp, rationale, and a pass/block verdict. Merely writing `pass` is not proof.

Attack Ten is a pre-execution challenge. Attack 20 is the executable adversarial/security floor and should cite receipts produced by the existing `src/security/attack20V3.ts` kernel. Attack 3000 and Attack 6000 remain independent higher-volume adversarial passes rather than aliases for Attack 20.

The attack-flow bundle is fingerprinted into the route recommendation. Changing governance evidence changes the executable recommendation identity.

## Revocation

Revocation is additive, never deletion.

- existing asset/receipt history remains addressable;
- a duplicate revocation id is idempotent;
- later distinct revocation evidence appends instead of rewriting history;
- a revoked asset cannot be reactivated by ordinary status mutation;
- downstream uses remain visible for review/takedown handling.

## Cost accounting

Routing keeps these categories distinct:

1. generative-provider USD;
2. deterministic compute USD;
3. storage/egress USD;
4. free/trial allowance consumption;
5. later provider actuals and human labor in execution receipts.

`$0` is not treated as unlimited when a scarce free allowance was consumed.

## Phase 1 implementation reality

Implemented now:

- strict protocol parsers and bounded true domain authority grants;
- source-record resolvability checks;
- route evaluator with trace and deterministic fingerprints;
- full attack-flow gating;
- deterministic post predicate;
- direct-provider catalog matching;
- verified free-allowance routing;
- request/daily/monthly budget headroom;
- in-memory budget reservation;
- in-memory asset, receipt, and revocation ledgers;
- terminal revoked-state behavior;
- honest FFmpeg, Gemini/Nano Banana, and Seedance adapter stubs.

Still deliberately deferred:

- real provider network calls;
- real FFmpeg rendering;
- wrapper execution;
- persistent database-backed ledgers;
- automatic cross-project promotion;
- dashboard/UI;
- publication execution.

No stub may report success when the underlying capability is unavailable.

## Attack invariants

The following remain true under council, Red Team, OODA, L99, Lindy, GoalFix, Truth/Confess, Attack Ten/20/3000/6000, and runtime proof flows:

- capability is not authority;
- evidence is not authority;
- domain authority may be true when actually granted;
- a successful provider call is not rights clearance;
- a stored candidate is not release permission;
- a release receipt is not publication proof;
- a continuity fingerprint or cookie is evidence, never bearer authority;
- a free generation can still consume allowance;
- a retry cannot duplicate budget or revocation effects;
- stale source/provider/runtime evidence cannot be promoted to current truth;
- no generated WORLD FOOTAGE may masquerade as PROOF FOOTAGE.

## Rollback

The Phase 1 implementation is additive source code. Rollback is a source revert of the protocol/router/tests/docs. Real provider calls, billing mutations, publication, and database migrations are not part of Phase 1, so those external states are not touched by this implementation.
