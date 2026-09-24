# Media Router ↔ Domain Protocol Contract v1

## Purpose

This contract defines the authority boundary between Founder Control Room's media routing/execution layer and project/domain protocols such as `/MAKEVIDEO`, Ask Me Video, `/LEEVIZE`, or later project-local approval systems.

The boundary exists to prevent a technically successful media operation from silently becoming rights clearance, factual approval, release permission, or publication authority.

## Authority rule

> **Media Router routes and stores. Domain protocols classify and approve.**

A Media Router output may prove that an operation was eligible, executed, stored, fingerprinted, cost-accounted, quarantined, or revoked. It does not prove that an asset is commercially cleared, factually approved, release-permitted, reusable across projects, or publication-authorized.

## Media Router may

- recommend a route;
- reserve bounded execution budget;
- execute an approved provider or deterministic tool;
- store assets and immutable receipts;
- create candidate, revision, quarantine, and revocation state;
- refuse an ineligible request;
- record provider, allowance, deterministic-compute, storage/egress, and optional human-labor cost evidence.

## Media Router may not

- clear commercial rights by itself;
- approve factual or regulated claims;
- approve cross-project reuse by itself;
- mark an asset release-permitted by itself;
- mark an output publication-authorized;
- publish an asset.

`publicationAuthorized` is therefore a literal `false` invariant in Media Router output v1. The same fail-closed rule applies to `releasePermitted`, `commercialRightsCleared`, `factualClaimsApproved`, `regulatedClaimsApproved`, and `crossProjectReuseApproved`.

## Protocol package boundary

Current FCR repository reality does not contain a portable `packages/protocol` workspace and does not declare Zod in the root package. Phase 1 therefore keeps the protocol in the existing root TypeScript build as a dependency-free portable module.

The protocol module must use only pure TypeScript/runtime primitives:

- no `node:crypto`;
- no filesystem access;
- no `process.env`;
- no provider SDKs;
- no network access;
- no budget, storage, or publication side effects.

A future package extraction may wrap or replace the hand-rolled strict parsers with Zod only after the repository has a verified package/export/dependency boundary. The contract semantics must remain identical.

## Media intents

The request contract recognizes these closed v1 intents:

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

`compose`, `transcode`, and `overlay` are first-class deterministic post-production intents rather than vague subcases of `edit`.

`publish_bundle` is only a request classification in v1. It is not a direct generation route and does not grant publication authority. A later orchestration workflow must satisfy its own domain approval and publication boundary.

Unknown intent values fail closed.

## Domain context

A `DomainMediaContextV1` binds media work to one workspace/project and carries upstream approval references plus explicit identity-reference assets.

Rules:

1. `releaseState = published_release` requires a non-empty `releaseReceiptId`.
2. A manual approval reference requires a human-readable reason.
3. Approval references are evidence pointers only. The Media Router cannot mint them for itself.
4. Identity consistency must be satisfied by references explicitly supplied in the request/domain context. An arbitrary registry asset tagged as an identity reference is not enough.
5. Unknown fields fail closed so new authority-bearing semantics cannot appear without a contract version change.

## Rights changes

Any request to change one of these authority-sensitive states:

- commercial rights;
- cross-project reuse;
- release permission;

must carry an `upstreamAuthorityReference` produced outside the Media Router.

A continuity fingerprint, execution receipt, provider receipt, asset ID, successful render, or founder preference is not a substitute for the upstream authority reference.

## Output ceiling

`MediaRouterOutputV1` is intentionally non-authorizing. It may return controlled asset IDs and upstream evidence references, but all approval booleans remain literal `false`.

A later domain protocol may consume Media Router evidence and produce a separate approval/release/publication receipt. That downstream receipt must not rewrite the Media Router output.

## Revocation

Revocation is additive, never deletion.

- existing asset/receipt history remains addressable;
- a same-idempotency-key retry may return the existing revocation;
- a later distinct authority/reason appends a supplemental event without changing the historical record;
- revoked or quarantined assets are never silently promoted back to eligible state.

## Cost accounting boundary

Receipts must distinguish:

1. **Generative provider cost** — reserved before execution and settled from provider usage/billing evidence when available.
2. **Deterministic compute cost** — CPU/GPU/render/storage/egress cost, estimated or measured separately from generation budget.
3. **Allowance consumption** — free/trial credits or generations tracked independently from USD because `$0` can still consume a scarce allowance.
4. **Human labor** — nullable in Phase 1 but preserved as a distinct future cost category.

Every cost line should state whether it is `VERIFIED`, `INFERRED`, `UNKNOWN`, or `WAIVED` rather than collapsing uncertainty into zero.

## Phase 1 implementation ceiling

Phase 1 contains only:

- this contract;
- dependency-free TypeScript types and strict runtime parsers;
- contract tests.

Phase 1 explicitly excludes:

- route evaluation;
- provider selection;
- wrappers;
- Gemini or other provider calls;
- FFmpeg execution;
- budget reservation;
- storage persistence;
- dashboards;
- public APIs;
- automatic cross-project reuse;
- real publication handoff.

## Attack invariants

The following must remain true under red-team, OODA, L99, Lindy, GoalFix, Truth/Confess, Attack Ten/20/3000/6000, and browser/runtime proof flows:

- capability is not authority;
- a successful provider call is not rights clearance;
- a stored candidate is not release permission;
- a release receipt is not publication proof;
- a continuity fingerprint or cookie is evidence, never bearer authority;
- a free generation can still consume allowance;
- a dry run cannot reserve or spend;
- a retry cannot duplicate budget or revocation effects;
- stale source/provider/runtime evidence cannot be promoted to current truth;
- no generated WORLD FOOTAGE may masquerade as PROOF FOOTAGE.

## Rollback

This protocol is additive and non-runtime. Rollback is a source revert of the contract/module/tests. No provider, database, secret, billing, deployment, asset, or publication state is mutated by Phase 1.
