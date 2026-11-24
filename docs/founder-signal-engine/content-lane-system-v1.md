# Content Lane System v1

Status: `IMPLEMENTED_ON_EXISTING_FOUNDER_CONTENT_ENGINE`

This is not a second content OS. It is the per-platform lane registry inside Founder Control Room's existing founder-content architecture.

Authoritative code:

- `src/lib/contentLaneSystem.ts`
- `src/lib/__tests__/contentLaneSystem.test.ts`
- `src/http/routes/youtubeGrowth.ts`
- `src/http/routes/__tests__/n8nConveyor.youtubeGrowth.integration.test.ts`
- `src/lib/firstPartySocialPublisher.ts` remains authoritative for the supported platform list and publication capabilities.

Implementation parent before this documentation receipt: `6efacafdc866448cf1e0c2afc94ef27fb74ec672` on `feat/prompt-workflow-router`. The current proof subject is always the commit containing the code being evaluated; predecessor green does not transfer after head movement.

## Shared kernel

Every content platform lane inherits the same durable content mechanics:

```text
audience + painful problem + useful promise
→ repeatable format
→ content engine
→ return/community loop
→ money path
→ measure
→ compound / repair / kill
```

Every lane uses:

```text
DISCOVER / PROVE / BELONG / CONVERT
```

and the default content unit:

```text
HOOK → VALUE → PROOF → PAYOFF → CTA
```

Faceless remains a format choice, not permission for copied clips, repetitive cosmetic reuse, generic AI slideshows, or zero-point-of-view automation. Original value, a truth boundary, and accountable proof remain required.

## Lane-specific North Stars

The shared kernel does not mean one universal success score. Every platform has a distinct North Star and native evidence signals. A content pattern is promoted only when outcome evidence satisfies that lane's North Star. Repeatability requires distinct run receipts. Misses and inconclusive attempts stay in revision memory rather than being erased.

| Lane | North Star |
| --- | --- |
| LinkedIn | qualified founder opportunities from proof-led content |
| Facebook | returning community participation that produces attributable next actions |
| Instagram | saved/shared visual proof that produces qualified actions |
| Threads | returning conversation that produces qualified actions |
| X | qualified conversation plus attributable clickthrough/action |
| TikTok | retained viewers who take a qualified next action |
| YouTube | returning viewers and watch time that compound into qualified actions/revenue |
| Pinterest | evergreen outbound actions and conversions |
| Bluesky | qualified public conversation plus attributable clickthrough |
| Mastodon | qualified community conversation plus attributable clickthrough |
| Google Business | qualified local actions such as website, call, direction, booking, visit, or purchase outcomes |

The registry is intentionally typed against `FIRST_PARTY_SOCIAL_PLATFORMS`. Adding or removing a first-party platform without updating the lane registry should fail the focused contract test instead of silently creating an ungoverned content surface.

## Lane shape

Each platform lane declares:

- `laneId`;
- one lane-specific North Star;
- evidence signals;
- native formats;
- discovery mechanics;
- return mechanics;
- conversion paths;
- proof preferences;
- publication capability inherited from `firstPartySocialPublisher.ts`;
- a non-authorizing authority envelope.

The publication capability is not redefined in this module. `contentField`, adapter readiness, media requirement, and account boundary are read from the existing first-party publisher contract so the lane system cannot drift into a parallel publication model.

## Learning and visual-library rule

A successful content pattern may be promoted into reusable prompt/visual memory only when subject-matched evidence shows it achieved the founder's intended outcome for that lane. One spike is not repeatability. Visibility is not revenue. A platform-native engagement signal is evidence, not authority.

Unsuccessful, stale, or inconclusive attempts remain revision memory with the miss, changed variable, and next falsification target preserved. They are not promoted as winners and they are not deleted merely because they failed.

## Money path

Every lane designs a legitimate money path early while keeping revenue proof separate from attention:

```text
viewer problem
→ useful content
→ qualified next action
→ offer / product / service / resource / relationship
→ conversion event
→ destination-native revenue evidence
```

Platform ads or native monetization are downstream options, not the only business model. Current eligibility rules must be read from current platform/provider evidence when decision-relevant; they are not hard-coded into this lane contract.

## Authority boundary

The lane system is advisory and shaping-only. It does not authorize:

- publication;
- scheduling;
- provider mutation;
- spend;
- scaling execution;
- merge;
- deploy.

Existing founder-content approval, lifecycle, provider-readback, and publication boundaries remain authoritative.

## Verification

The focused contract requires exactly one lane for every first-party platform, distinct North Stars, native lane shape, inherited publication capabilities, the shared content kernel, revision-memory behavior, and zero publication/scheduling/spend/scale authority.

The authenticated existing YouTube growth surface now exposes the unified lane-system snapshot so FCR can discover the full platform map without introducing another runtime control plane. YouTube continues to use its existing evidence-gated `TEST_AND_VALIDATE → DOUBLE_DOWN → SCALE` evaluator.

## Rollback

Revert the focused content-lane commits. Existing publication, lifecycle, provider, approval, and analytics systems remain intact because this layer does not replace them.

## Next gate

Require exact-head focused tests and normal repository CI on the final candidate. Because PR #860 has a moving/stale base history, continuity and merge readiness must be reacquired separately after current-main reconciliation. Do not treat source presence or predecessor green as merge proof.
