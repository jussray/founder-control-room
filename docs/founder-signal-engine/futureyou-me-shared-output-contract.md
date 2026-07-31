# FutureYou + ME Shared Analysis Contract

Status: `LOCKED_SCOPE`

Authoritative budget: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

## Goal

Give Ray maximum decision coverage without multiplying Zapier actions.

FutureYou, ME, Chief AI, 5W1H, evidence classification, social drafts, investor drafting, and the recommended next action must be produced by the same structured AI action used by the Founder Signal Engine.

This contract adds fields, not billable steps.

## One signal, one thinking action

```text
normalized source signal
-> free budget + idempotency gates
-> ONE structured AI action
   -> evidence truth
   -> ME decision lens
   -> FutureYou decision lens
   -> Chief AI routing decision
   -> social and investor review drafts
-> free validation + Paths
-> ONE canonical HubSpot result note
```

Do not create separate Zaps or separate AI calls for FutureYou, ME, LinkedIn, Facebook, Instagram, investor outreach, or proof formatting.

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
- Populate `me_profile_angle` only when the signal affects Ray's LinkedIn/profile positioning, founder brand, Se'kret Bip narrative, or investor-facing proof.
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

## Shared truth boundary

The AI result must keep these categories separate:

```text
VERIFIED
INFERRED
UNKNOWN
FUTUREYOU GUIDANCE
ME DECISION
```

FutureYou guidance and ME decisions may reason from verified evidence, but they must never be written back as verified facts.

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
linkedin_draft
facebook_draft
instagram_draft
investor_outreach_draft
publish_allowed
```

`publish_allowed` remains `false` until an exact founder approval event reaches the separate approval lane.

## Zapier task effect

Adding FutureYou and ME changes the structured response schema only.

```text
Before: 1 AI action per signal
After:  1 AI action per signal
Added Zapier tasks: 0
```

The locked monthly plan remains:

```text
82 planned tasks
8 routine headroom
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
- FutureYou and ME are split into separate AI actions;
- the planned task total exceeds the 90-task operating ceiling;
- the 10-task emergency reserve is consumed by routine planning.

## Rollback

Revert this contract, the matching JSON fields, and verifier assertions together. Do not delete Zapier workflows, HubSpot evidence, Buffer drafts, Zap History, or queue records.
