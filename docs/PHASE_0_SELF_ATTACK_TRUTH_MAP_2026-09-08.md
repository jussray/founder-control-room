# Phase 0 Truth Map — ULTRATHINK Self-Attack Implant

Date: 2026-09-08  
Authority: founder-approved direct-main contract implant  
Mutation scope: `jussray/founder-control-room` only  
Cross-repository audit scope: read-only

## Current supersession note — 2026-09-10

This document preserves the September 8 pre-wiring baseline. Its statements that the revised deterministic first slice was not yet wired and that live first-slice wiring remained gated are **HISTORICAL / SUPERSEDED AS SOURCE-STATE CLAIMS** by the bounded Friend Intake candidate in PR #774.

The current source candidate mounts a separate `/friend-intake` path while leaving the existing `/mirror/run` implementation untouched. The Friend Intake path is deterministic and model-free, uses the shared `project_events` timeline boundary, and has a founder-facing desktop/mobile surface. The feature remains fail-closed unless `FCR_FRIEND_INTAKE_ENABLED=true`; intake-content persistence has a separate fail-closed `FCR_FRIEND_INTAKE_PERSISTENCE_ENABLED=true` requirement. Saved content requires interactive founder authority, and sensitive saves require a session-bound exact-payload review capability with one-review/one-save database identity.

That source state does **not** prove either flag is enabled in production, that the migration is applied, that a provider/runtime serves the candidate, or that production browser behavior matches the candidate. Those remain separate configuration, database, deployment, runtime, and browser proof planes.

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

The bullets in this section are the September 8 observation set unless the supersession note above says otherwise.

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
- **HISTORICAL:** at the September 8 observation point, the revised deterministic first slice was not yet the live Mirror implementation. PR #774 later introduced a separate default-off `/friend-intake` source candidate instead of rewriting `/mirror/run`.
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

The following are preserved as September 8 hypotheses. Where PR #774 now supplies source evidence, the supersession note above controls present-tense interpretation.

- The revised first slice could likely reuse `project_events` for the founder-visible timeline/audit entry, but the final record shape had to be verified against current migrations and route consumers before a persistence patch.
- Existing Mirror types could likely be adapted instead of replaced, but the current `MirrorModelProvenance` is OpenAI-specific and the revised deterministic slice needed a provider-neutral/stub-safe provenance seam.
- Existing founder auth was sufficient for a first founder-only slice; role expansion should be additive and must not weaken the current founder boundary.

## UNKNOWN / NOT YET PROVEN

- Exact production Supabase schema parity for every logical first-slice record.
- Whether either Friend Intake source flag is enabled in a production runtime.
- Whether the Friend Intake migration has been applied to production Supabase.
- Whether the public production route serves the exact PR candidate.
- Production runtime behavior is not proven by this source audit or by source-only review.

## BLOCKED

- None for the historical September 8 additive contract implant.
- **SUPERSEDED:** the old statement that source wiring itself remained gated no longer describes PR #774's source candidate. Production activation remains separately gated by exact-head review/CI, explicit configuration, database migration authority, deployment authority, and runtime/browser proof.

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

The September 8 planning gate below is historical. PR #774 subsequently implemented the bounded source candidate it described.

1. current `src/http/routes/mirror.ts`;
2. `src/mirror/types.ts`;
3. existing project-event/timeline persistence;
4. feature flags;
5. founder-facing UI surface;
6. desktop/mobile Playwright path.

Present-tense acceptance now requires exact-head proof for the PR candidate and separate proof for any later production configuration, migration, deployment, or runtime claim. Do not infer production activation from source implementation.
