# Phase 0 Truth Map — ULTRATHINK Self-Attack Implant

Date: 2026-09-08  
Authority: founder-approved direct-main contract implant  
Mutation scope: `jussray/founder-control-room` only  
Cross-repository audit scope: read-only

## Header

```text
AUTHORITATIVE REPO: jussray/founder-control-room
TARGET BRANCH: main
AUDITED START HEAD: 34ffe99e77455f278b437f4cfc67c76e3df59a25
CURRENT GOAL: implant v1.4 self-attack contracts and map the revised first vertical slice
SUSPECTED FAILURE AREA: master-spec drift + first-slice mismatch with existing Mirror path
FIRST FILES/LOGS:
- AGENTS.md
- package.json
- tsconfig.json
- playwright.config.ts
- docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md
- docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md
- src/http/middleware/requireFounder.ts
- src/http/routes/mirror.ts
- src/mirror/types.ts
STOP CONDITION:
- land only additive governance/type contracts;
- do not rewire the live Friend/Mirror path until exact touched files and behavior proof are separately scoped;
- stop on authority conflict, broad migration, new external dependency, or stale main.
```

## VERIFIED — Founder Control Room

- Repository is `jussray/founder-control-room`; default branch is `main`.
- Audited starting `main` is `34ffe99e77455f278b437f4cfc67c76e3df59a25`.
- The base master file labels itself v1.2.
- The existing v1.3 addendum is the approved additive reconciliation surface and explicitly avoids broad rewriting the base master.
- `AGENTS.md` requires repository truth, exact-head evidence, serialized mutation authority, Documentation Truth, and Playwright for user-facing behavior.
- TypeScript is strict/NodeNext and includes `src`.
- Founder auth is already a two-gate boundary: valid Supabase identity/session plus the service-role `founder_users` allowlist.
- High-consequence interactive founder decisions have a stricter opaque browser-session path.
- The current Mirror route is founder-gated and writes sanitized audit metadata into `project_events`.
- The current Mirror route calls the OpenAI Mirror provider by default.
- The current Mirror input accepts `relatedMemories`.
- Therefore the revised deterministic first slice (no model call, no memory retrieval) is **not yet the live Mirror implementation**.
- `project_events` is already used as the shared founder-visible operational activity/audit feed. New first-slice timeline work should prefer reuse over a parallel timeline table.
- Playwright is configured under `e2e/`, non-parallel by default, with retained failure video/screenshot/trace behavior.
- The repository already has V10 privileged approval middleware and tests. The new generic ApprovalBinding must not replace that live authority path without a separate migration proof.

## VERIFIED — Parallel repository compatibility

### Chief AI / PromptOS

```text
repo: jussray/chief-ai-machine
main: 2fd4fda0cab12e52ab5096e723884d98bcfe7d10
```

- Chief has existing evidence/approval/continuity contracts.
- Continuity fingerprints are retrieval/identity aids, not proof.
- PR #147 is open/draft on `d32d66ff997d38253beb0171c1fcd772c62d8b88`.
- Five semantic/security review threads are unresolved on that exact head.
- FCR must not infer Chief privileged-write readiness from source/build green while those current review findings remain unresolved.
- No Chief mutation is part of this implant.

### StoryEngine

```text
repo: jussray/StoryEngine
main: 4ed6853bacbe4800308e614a37e3ef0b7e1e2b8e
```

- StoryEngine declares Founder Control Room as portfolio hub/canonical authority for its federation path.
- StoryEngine already has local Control Room routes, manifests, reconciliation logic, and Playwright guardrail coverage.
- Generic FCR truth/approval types must not make StoryEngine an independent governance authority.
- No StoryEngine mutation is part of this implant.

### Se'kret Bip

```text
repo: jussray/Sekret-Bip
main: ee3a85a3c1f4904f07206fe2204b036e235ec7e9
```

- Se'kret Bip has explicit product/privacy contracts, privacy types, privacy labels, and teen/family-specific guardrails.
- Se'kret Bip states that teen privacy, consent, identity, product truth, durable state, and safety remain product-owned even when providers are replaceable.
- Generic FCR memory minimization is a floor, not permission to weaken Se'kret Bip's stricter teen/family rules.
- No Se'kret Bip mutation is part of this implant.

## INFERRED

- The revised first slice can likely reuse `project_events` for the founder-visible timeline/audit entry, but the final record shape must be verified against current migrations and route consumers before a persistence patch.
- Existing Mirror types can likely be adapted instead of replaced, but the current `MirrorModelProvenance` is OpenAI-specific and the revised deterministic slice needs a provider-neutral/stub-safe provenance seam.
- Existing founder auth is sufficient for a first founder-only slice; role expansion should be additive and must not weaken the current founder boundary.

## UNKNOWN / NOT YET PROVEN

- Exact production Supabase schema parity for every logical first-slice record.
- Whether a current feature-flag store already covers all six generic mutable-module kill switches.
- Whether the current public/control-room UI already has a reusable provenance drawer for this exact slice.
- Whether the current CI on the post-implant exact head will run the relevant full Playwright lane automatically.
- Production runtime behavior is not proven by this source audit.

## BLOCKED

- None for the additive contract implant.
- Live first-slice wiring remains gated on a separately scoped touched-file plan and browser proof.

## FIRST VERTICAL SLICE

```text
Friend Intake
-> Mirror
-> Tags
-> exactly one move
-> Provenance
-> Timeline
```

## OUT OF SCOPE FOR THIS IMPLANT COMMIT

- changing `/mirror/run` behavior;
- external model calls for the revised slice;
- memory retrieval;
- provider writes;
- publishing;
- deployment;
- scheduling;
- broad folder migration;
- replacing V10 privileged middleware;
- mutating Chief, StoryEngine, or Se'kret Bip.

## NEXT IMPLEMENTATION GATE

Produce one focused live-slice plan that reconciles:

1. current `src/http/routes/mirror.ts`;
2. `src/mirror/types.ts`;
3. existing project-event/timeline persistence;
4. feature flags;
5. founder-facing UI surface;
6. desktop/mobile Playwright path.

Do not call the revised Friend slice implemented until that exact path is wired and browser-proven.
