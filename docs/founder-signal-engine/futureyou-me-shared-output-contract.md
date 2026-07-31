# FutureYou + ME Shared Analysis Contract

Status: `LOCKED_SCOPE`

Authoritative budget: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

## Goal

Give Ray maximum decision and distribution coverage without multiplying Zapier thinking actions.

FutureYou, ME, Chief AI, 5W1H, evidence classification, the recommended next action, investor drafting, media direction, and every supported social-platform draft must be produced by the same structured AI action used by the Founder Signal Engine.

This contract adds fields, not separate AI tasks.

## One signal, one thinking action

```text
normalized source signal
-> free budget + idempotency gates
-> ONE structured AI action
   -> evidence truth
   -> ME decision lens
   -> FutureYou decision lens
   -> Chief AI routing decision
   -> platform-native social campaign package
   -> investor review draft when requested
-> free validation + Paths
-> ONE canonical HubSpot result note
-> optional founder-approved Buffer fan-out
```

Do not create separate Zaps or separate AI calls for FutureYou, ME, LinkedIn, Facebook, Instagram, Threads, X, TikTok, YouTube Shorts, Pinterest, Bluesky, Mastodon, Google Business, investor outreach, or proof formatting.

## ME lens

`ME` is the present-self founder decision layer.

Required fields:

```text
me_reality_now
me_smallest_next_action
me_founder_voice
me_profile_angle
```

Rules:

- State what is verified now without inflating progress.
- Choose one smallest reversible next action.
- Preserve Ray's founder voice rather than generating generic corporate copy.
- Populate `me_profile_angle` only when the signal affects Ray's profile positioning, founder brand, Se'kret Bip narrative, or investor-facing proof.
- Do not turn ME into a second AI action.

## FutureYou lens

FutureYou speaks as Ray five years after the goal succeeded.

Required fields:

```text
future_you_guidance
future_you_what_mattered
future_you_what_did_not
future_you_valid_fear
```

Required voice:

```text
first person
specific to the supplied evidence and decision
what Ray needs to hear, not generic encouragement
```

Required opener:

```text
The thing you’re worried about most right now — I remember that. Here’s what actually happened…
```

FutureYou must identify:

- what materially compounded;
- what looked urgent but did not matter;
- which current fear contained a real signal;
- the action present-day Ray should take now.

Do not fabricate future facts, revenue, users, funding, partnerships, launch status, or outcomes. FutureYou is a decision-compression lens, not evidence.

## Shared social campaign lens

The same AI action must create one coherent campaign package, then tailor the copy to each platform instead of copying one generic caption everywhere.

Required campaign fields:

```text
social_campaign_angle
social_campaign_media_brief
linkedin_draft
facebook_draft
instagram_draft
threads_draft
x_draft
tiktok_caption
youtube_shorts_draft
pinterest_draft
bluesky_draft
mastodon_draft
google_business_draft
```

Rules:

- Keep one verified campaign claim set across every platform.
- Adapt hook, length, formatting, call to action, and media framing to the platform.
- Do not invent platform traction, views, followers, customers, partnerships, or launch proof.
- Keep every draft review-only until an exact founder approval event exists.
- The Buffer lane may distribute to three approved active channels in parallel, costing one Buffer action per channel.
- Non-selected platform drafts remain available in HubSpot and Founder Control Room without another AI task.

## Shared truth boundary

The AI result must keep these categories separate:

```text
VERIFIED
INFERRED
UNKNOWN
FUTUREYOU GUIDANCE
ME DECISION
SOCIAL REVIEW COPY
```

FutureYou guidance, ME decisions, and social copy may reason from verified evidence, but they must never be written back as verified facts.

## Shared output minimum

The one AI action must return at least:

```text
signal_id
decision
who
what
where
when
why
how
verified_evidence
inferred_conclusions
unknown_information
missing_evidence
first_failure_stage
recommended_next_action
me_reality_now
me_smallest_next_action
me_founder_voice
me_profile_angle
future_you_guidance
future_you_what_mattered
future_you_what_did_not
future_you_valid_fear
chief_ai_decision
social_campaign_angle
social_campaign_media_brief
linkedin_draft
facebook_draft
instagram_draft
threads_draft
x_draft
tiktok_caption
youtube_shorts_draft
pinterest_draft
bluesky_draft
mastodon_draft
google_business_draft
investor_outreach_draft
publish_allowed
```

`publish_allowed` remains `false` until an exact founder approval event reaches the separate approval lane.

## Zapier task effect

Adding FutureYou, ME, and the wider social matrix changes the structured response schema only.

```text
Before: 1 AI action per signal
After:  1 AI action per signal
Added AI tasks: 0
```

Approved Buffer distribution remains separately and honestly budgeted:

```text
3 selected channels
x 1 Buffer action per channel
= 3 Zapier tasks per approved campaign
```

The locked monthly plan is:

```text
88 planned tasks
2 routine headroom
10 emergency reserve
100-task free-plan limit
```

## Validation

Run:

```bash
npm run verify:zapier-budget
```

The verifier must fail when:

- FutureYou fields are removed;
- ME fields are removed;
- a required social-platform draft is removed;
- FutureYou, ME, or social drafting are split into separate AI actions;
- the Buffer allocation does not equal the number of configured parallel channel slots;
- platform-native copy is no longer required;
- the planned task total exceeds the 90-task operating ceiling;
- the 10-task emergency reserve is consumed by routine planning.

## Rollback

Revert this contract, the matching JSON fields, and verifier assertions together. Do not delete Zapier workflows, HubSpot evidence, Buffer drafts/posts, Zap History, or queue records.
