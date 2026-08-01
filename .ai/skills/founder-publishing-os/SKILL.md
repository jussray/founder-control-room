---
name: founder-publishing-os
description: >
  Governed publishing capability that turns verified founder progress into
  audience-specific campaigns, platform drafts, approval decisions, Buffer
  handoffs, receipts, and learning without letting marketing outrun reality.
version: 1.0
visibility: private
owner: Juss
inherits:
  - .ai/skills/juss-founder-os/SKILL.md
---

# Founder Publishing OS

## Mission

Turn reality into trustworthy influence.

This skill is the decision and campaign layer between repository/provider evidence and transport adapters such as Buffer, HubSpot, email, or direct social APIs. Buffer is a delivery surface, not the source of truth, strategist, approver, or learning system.

## Operating stack

Use:

```text
/garyvee lindymode redteam l99 redteam ooda /truthmode
```

- Founder value: identify the audience outcome and why the event deserves attention.
- Lindy: preserve a platform-independent fact packet and replaceable transport adapters.
- Redteam I: ask whether the event should be published at all.
- L99: map authority, provenance, state, evidence, approval, receipts, rollback, and learning.
- Redteam II: attack the selected narrative, channel mix, timing, and blast radius.
- OODA: observe evidence, decide the next permitted state, act minimally, verify receipts, and learn.

## Capability boundary

```text
Provider signals
→ Proof Engine
→ @juss intent and priority
→ Founder Publishing decision
→ Proof-led platform drafts and asset briefs
→ Founder approval
→ Buffer or another transport adapter
→ Buffer receipt
→ Public platform receipt
→ Performance and learning loop
```

This skill decides whether a campaign may advance and what package should be handed off. It does not silently publish, spend, alter accounts, create credentials, or replace provider-specific adapters.

## Required public-post ingredients

A public founder-progress package requires all three:

1. **Verified traction** — adoption, revenue, conversion, audience growth, retention, or qualified interest backed by a source URL.
2. **Governance advantage** — a concrete trust, rollback, auditability, safety, exact-head, compliance, or operational-control advantage backed by proof.
3. **Clickable proof** — a public PR, commit, deployment, product page, demo, metric source, receipt, or other evidence that supports the claim.

A merge, test, deployment, task count, or configuration change is execution evidence. Do not relabel it as traction unless it demonstrates a real audience or business outcome.

## Decision states

- `blocked`: evidence, traction, governance proof, audience, platform, or project provenance is missing or contradictory; keep internal.
- `draft_ready`: the fact packet is complete enough to review, but proof is conditional or draft mode was requested.
- `approval_required`: evidence is ready and queue/publish was requested, but no exact founder approval receipt exists.
- `authorized`: proof is ready, the package is complete, and the exact queue/publish action has a founder approval receipt.

The executable reference is `src/publishing/decision.ts`.

## Canonical fact packet

Create one immutable campaign packet before writing platform variants:

```json
{
  "projectSlug": "project-slug",
  "eventId": "stable-source-event-id",
  "summary": "founder-readable verified event",
  "requestedMode": "draft",
  "audiences": ["investors"],
  "platforms": ["linkedin"],
  "traction": [],
  "governanceAdvantages": [],
  "proofSnapshot": {},
  "founderApprovalId": null
}
```

Never use raw prompts, private orchestration instructions, secrets, private user data, or unparsed provider responses as social copy.

## Platform routing

Each destination receives a dedicated finished-copy field:

| Destination | Content field |
|---|---|
| LinkedIn | `linkedin_draft` |
| Juss&Co Facebook | `facebook_founder_draft` |
| Juss Beautiful Hair Facebook | `facebook_brand_draft` |
| Instagram | `instagram_draft` |
| Threads | `threads_draft` |
| X | `x_draft` |
| Bluesky | `bluesky_draft` |
| Email | `email_draft` |

Platform adapters may compress or restructure the narrative, but they must not change the underlying facts, traction value, governance claim, or proof links.

## Asset decisions

For each selected platform, decide whether the event needs:

- no media;
- one proof screenshot;
- a branded static card;
- a document/carousel;
- a short vertical video;
- a founder voiceover;
- a product demo clip.

Asset briefs must specify audience job, source evidence, opening frame, visual hierarchy, caption relationship, accessibility text, platform ratio, duration, and forbidden claims. Buffer receives validated final media, not a request to repair or invent the creative.

## Approval and transport

- Draft creation may proceed without publication authority when the evidence package is safe.
- Queue and publish require `publishAllowed: true` plus an exact non-empty founder approval receipt.
- Map Buffer Post Text only from the validated platform-specific content field after the existing Buffer content firewall.
- A successful Zapier or Buffer step is transport evidence, not public publication proof.
- Public publication requires the platform post ID or permalink receipt.

## Learning loop

After publication, retain:

- source project and exact evidence SHA/event;
- campaign and platform variant IDs;
- final approved text and asset IDs;
- Buffer run/artifact receipt;
- public platform receipt;
- impressions, clicks, qualified replies, conversions, referrals, and other meaningful outcomes;
- what changed in the next campaign because of those outcomes.

Do not optimize for vanity totals alone. Prefer conversion ratios, qualified interest, repeat engagement, and movement toward the founder objective.

## Product surface contract

Founder Control Room should eventually expose one Publishability Card per event with:

- current state and requested destination mode;
- traction, governance, and proof completeness;
- audience and platform routing;
- platform draft tabs and asset brief;
- blockers and warnings;
- `Hold`, `Review draft`, and approval-gated `Queue/Publish` actions;
- receipt timeline from evidence through public URL;
- learning summary after publication.

A visual prototype or design QA requires Product Design Work Mode, a selected visual target, rendered implementation, and screenshot evidence. This skill contract alone is not visual proof.

## Stop conditions

Stop public progression when:

- project provenance does not match the proof snapshot;
- traction is missing or is only execution activity;
- governance advantage has no evidence;
- proof links are private, irrelevant, stale, or contradictory;
- the post exposes private prompts, secrets, user data, teen data, internal logs, or proprietary logic;
- queue/publish lacks the exact founder approval receipt;
- Buffer or platform receipts are absent;
- the narrative claims launch, security, compliance, production readiness, growth, or customer outcomes beyond the evidence.

## Required report

Return:

- `REALITY`: verified event and evidence state;
- `DECISION`: blocked, draft-ready, approval-required, or authorized;
- `CAMPAIGN`: audiences, platforms, content fields, and asset briefs;
- `PROOF`: traction, governance advantage, and clickable evidence;
- `TRANSPORT`: Buffer/adapter state and receipts;
- `RISK`: missing, conditional, or private evidence;
- `LEARNING`: measured outcome and next adaptation;
- `NEXT GATE`: one exact founder or provider action.
