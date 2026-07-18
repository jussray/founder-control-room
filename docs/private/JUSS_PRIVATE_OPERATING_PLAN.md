# Juss Private Operating Plan

> **Private / decision-locked.** Do not publish or distribute without Juss’s approval.

## Current position

The core strategy is settled. The remaining gap is disciplined implementation,
verification, and launch execution.

**Locked principle:** The experience can close. The relationship, account, splash
identity, waiting-list state, and proof of demand remain.

## Public acquisition architecture

```text
Social content
→ Splash PNG
→ invisible CTA
→ account recognition or lightweight onboarding
→ 72-hour Se’kret Bip founding preview while open
→ personalized waiting-list home after closure
→ updates, referrals, sponsorship, and future access
```

## Non-negotiables

- The splash PNG is the permanent visual doorway and the primary CTA surface.
- The CTA is visually invisible but technically explicit, accessible, measurable,
  state-aware, and protected against double taps.
- The authoritative product source, prompts, safety logic, business logic, Control
  Room, L99, and unreleased architecture remain private.
- Nothing is deleted without explicit authorization for that specific deletion.
- Existing users are recognized and do not repeat completed onboarding.
- The preview can end after 72 hours; the account and relationship continue.
- Sponsorship grants no ownership, license, product control, or brand rights.
- Public claims require evidence.

## Experience states

### During the founding preview

| User state | Splash result |
|---|---|
| New visitor | Create account → lightweight onboarding → limited preview → waitlist saved |
| Recognized user | Silent session recognition → resume preview |
| Incomplete onboarding | Resume unfinished steps only |

### After the preview closes

| User state | Splash result |
|---|---|
| Recognized + waitlisted | “Welcome back — your place is saved” → personalized waiting-list home |
| Existing + incomplete | Resume short onboarding → confirm waiting list |
| New visitor | Create account → minimal onboarding → join waiting list |
| Invited user | Validate invitation → approved early-access path |

## Durable lifecycle states

```text
account_created
→ onboarding_started
→ onboarding_completed
→ preview_activated
→ waitlist_joined
→ preview_closed_seen
→ returning_waitlist_user
→ early_access_eligible
→ invited
→ active
```

Do not infer the entire relationship from page history. Store durable state.

## Splash PNG specification

- Use the same splash identity before, during, and after the preview.
- Make the artwork a real accessible button or link with a label such as
  “Enter Se’kret Bip.”
- Support keyboard, visible focus, screen readers, switch control, and reduced motion.
- Prevent accidental double taps.
- Preserve the branded image while routing or loading.
- Reveal a subtle fallback cue only if a visitor does not recognize the interaction.
- Track:
  - `splash_viewed`
  - `splash_tapped`
  - `session_recognized`
  - `onboarding_started`
  - `onboarding_resumed`
  - `preview_entered`
  - `waitlist_page_entered`
  - `waitlist_joined`
  - `return_visit`
  - `early_access_entered`

## Routing contract

```text
preview_open + new_user          → onboarding
preview_open + recognized_user   → preview
preview_closed + waitlisted_user → personalized waiting-list home
preview_closed + incomplete_user → resume onboarding
preview_closed + new_user        → waiting-list onboarding
invited_user                     → approved early access
```

## Waiting-list home

The waiting list is a persistent prelaunch product surface, not a dead end.

It should provide:

- “Your place is saved” confirmation;
- current project phase and next visible milestone;
- founder/build updates and controlled previews;
- referral link and referral progress;
- early-access eligibility or invitation status;
- brief feedback prompts and preference updates;
- sponsor/support option with specific funding uses;
- account, communication, consent, and privacy controls.

## 72-hour campaign

### Hours 0–24: Reveal

- Explain what Se’kret Bip is, who it serves, and why it exists.
- Open the preview and account flow.
- Publish the first walkthrough and founder message.
- Use one CTA: enter through the splash and save a place.

### Hours 24–48: Proof

- Show selected features, verified progress, and privacy principles.
- Publish testing and release evidence without exposing implementation.
- Report real activation and waiting-list signals without inflated claims.

### Hours 48–72: Conversion

- State the closing time clearly.
- Explain what remains after closure.
- Drive return visits, referrals, waitlist completion, and sponsorship.
- Close the interactive preview on schedule.
- Route recognized users to their personalized waiting-list home.

### After closure

- Publish a transparent result summary.
- Keep splash, accounts, waiting-list home, and updates active.
- Begin weekly evidence-backed build updates.
- Invite controlled cohorts only after product, privacy, and safety gates are green.

## Content Control Room

Instagram, Facebook, TikTok, and other content should use one controlled queue.

```text
project skill
→ campaign brief
→ AI draft generation
→ brand / privacy / safety validation
→ Juss approval
→ approved platform adapter
→ performance data
→ next OODA cycle
```

Default to draft-only. Public publishing requires explicit approval until the
system has earned documented trust.

Every content record should include:

```text
project
campaign
platform
content_type
hook
caption
visual_asset
call_to_action
destination_url
approval_status
scheduled_time
publication_status
performance_metrics
```

## What proves potential cash flow

Registrations alone prove attention, not revenue. Measure movement through the
full funnel:

| Stage | Evidence |
|---|---|
| Discovery | impressions, profile visits, launch-page visits |
| Intent | splash views, splash taps, account starts |
| Activation | onboarding completion, preview entry, meaningful use |
| Retention | return visits during and after the preview |
| Demand | waiting-list joins, early-access requests, completed preferences |
| Advocacy | referrals, shares, useful feedback |
| Economic signal | sponsorships and properly reviewed willingness-to-pay evidence |

Report conversion ratios, not vanity totals alone.

## Red-team register

| Risk | Countermeasure |
|---|---|
| Code or IP exposure | Keep authoritative repositories private and publish only controlled builds and sanitized proof |
| Artificial-scarcity backlash | Explain the 72-hour terms before signup and preserve the account relationship |
| Sensitive data collection | Minimize data, use synthetic preview data, and obtain qualified privacy/legal review |
| Onboarding friction | Use progressive onboarding and collect only what the current state needs |
| Dead waiting list | Provide weekly updates, milestones, status, referrals, and controlled participation |
| Brand fragmentation | Lead with Se’kret Bip and position other systems as supporting infrastructure |
| Unverified claims | Publish only evidence-backed progress and label experiments clearly |
| Automation account risk | Use approved APIs, isolated tokens, audit logs, limits, kill switches, and human approval |
| False green technical state | Verify real providers, real routing, failure handling, and production-like paths |

## Definition of ready

- [ ] Splash PNG final and consistent across entry states.
- [ ] Invisible CTA accessible, measurable, state-aware, and double-tap safe.
- [ ] Authentication and recognized-return flow verified.
- [ ] Lifecycle state model implemented.
- [ ] Preview-open and preview-closed routing tested.
- [ ] Waiting-list home provides persistent value.
- [ ] Private/public boundary audited.
- [ ] No secrets, private prompts, real user data, admin paths, or proprietary internals exposed.
- [ ] Privacy, consent, retention, and age-related requirements reviewed before broad teen onboarding.
- [ ] Brand and ownership notices visible.
- [ ] Analytics verified end to end.
- [ ] Social draft and approval workflow tested.
- [ ] Rollback and emergency-close procedures verified.
- [ ] Playwright evidence and failure artifacts collected.

## Exact execution order

1. Freeze this plan and the Juss Founder OS as the decision source of truth.
2. Audit `sekret-bip-demo` and the deployed experience without deleting or exposing anything.
3. Specify the splash states, invisible CTA, accessibility, and routing contract.
4. Implement lifecycle states and recognized login behavior.
5. Build the preview-closed personalized waiting-list home.
6. Add analytics for the complete funnel.
7. Create the Se’kret Bip project-native skill inheriting from Juss Founder OS.
8. Build the Content Control Room draft/approval workflow.
9. Run OODA, both red-team passes, and Playwright verification.
10. Schedule the 72-hour founding preview only after every gate is genuinely green.

## Decision filter

Before a consequential action, ask:

1. Does this protect the brand?
2. Does it preserve the relationship after the preview?
3. Can the result be verified?
4. Does it expose code or operating logic unnecessarily?
5. Is it reversible?
6. Does it create measurable user movement?
7. Does it preserve Juss’s authority and original intent?

If any answer is no, re-orient before acting.
