# Unified Growth Inbox — Private Operating Plan

> **Private / decision-locked draft.** Do not publish, connect live credentials,
> enable outbound automation, deploy, or spend without a separate founder gate.

## Truthmode decision

Build one provider-independent growth and conversation control plane inside Founder
Control Room. Do not build ten unrelated bots and do not treat "autopilot" as
permission to contact anyone who can be found.

The system should automate the repetitive parts of growth:

- inbound capture;
- message normalization and deduplication;
- contact and project attribution;
- consent and conversation-window checks;
- intent, urgency, and lead qualification;
- approved FAQ responses;
- response drafting and human handoff;
- follow-up task creation;
- delivery evidence, attribution, and outcome reporting.

It should not begin as unrestricted autonomous outbound sales. Live campaigns,
outbound calls, pricing, discounts, custom terms, and paid-provider changes remain
separate founder approval gates.

## Channel reality

| Channel | Status | First useful mode | Critical constraint |
|---|---|---|---|
| Instagram Direct | Viable | inbound assist + drafts | Professional account, approved permissions, webhooks, messaging window |
| Facebook Messenger | Viable | inbound assist + drafts | Facebook Page, Page token, permission, platform messaging window |
| WhatsApp | Viable | support + approved sequences | Business Platform, opt-in, templates outside user-initiated window |
| Telegram | Viable | inbound bot + Mini App | User must initiate or authorize the bot relationship |
| Email | Viable | transactional + opted-in nurture | Sender identity, non-deceptive content, unsubscribe and suppression |
| SMS/MMS | Viable | opted-in reminders + support | Affirmative consent, sender registration, STOP handling, quiet hours |
| Voice calls | Viable with high controls | inbound routing first | Separate consent/disclosure for outbound automation, recording, transcription, synthetic voice |
| Viber | Later / commercial gate | subscribed-user support | Commercial onboarding and subscriber requirement |
| Webchat | Highest-control launch channel | inbound assist | First-party consent, disclosure, retention, security, handoff |
| Google Business Messages | Retired | none | Do not build; route Google Business Profile visitors to supported channels |

## Locked architecture

```text
Instagram / Messenger / WhatsApp / Telegram / Email / SMS / Voice / Viber / Webchat
                                  │
                                  ▼
                    Signed webhook and inbound gateway
                                  │
                    verify → dedupe → rate-limit
                                  │
                                  ▼
                         Channel adapter layer
                                  │
                  provider event → canonical envelope
                                  │
                                  ▼
                       Project boundary resolver
                                  │
             brand + campaign + landing page + source attribution
                                  │
                                  ▼
                      Contact identity candidate graph
                                  │
             provider IDs remain separate; verified links only
                                  │
                                  ▼
                         Consent policy engine
                                  │
          purpose + channel + sender + window + opt-out + jurisdiction
                                  │
                                  ▼
                     Conversation and lead state engine
                                  │
              intent + urgency + qualification + next best action
                                  │
                                  ▼
                           AI assistance layer
                                  │
     approved FAQ response OR draft OR task OR immediate human escalation
                                  │
                                  ▼
                        Founder dispatch gate
                                  │
         template + audience + consent + budget + time + kill condition
                                  │
                                  ▼
                         Outbound channel adapter
                                  │
                                  ▼
                 delivery evidence + attribution + outcome
```

## One inbox, multiple projects

The shared system owns the protocol, audit, consent logic, and operator experience.
Each project owns its own:

- brand identity and tone;
- approved knowledge and offers;
- contact purpose and consent language;
- lead definition and disqualification rules;
- templates, campaign windows, and escalation contacts;
- data retention and deletion policy;
- attribution and outcome definitions.

A contact for Juss Beautiful Hair is not silently marketed Se’kret Bip, L99, or
another project. Cross-project contact requires a separately recorded purpose and
valid permission.

## Se’kret Bip boundary

The growth inbox must never become a shadow copy of the product's teen or family
data. It may use only independently consented business-communication records such
as:

- waitlist membership and status;
- founding-preview or early-access participation;
- sponsor interest;
- referral code and source;
- account communication preference;
- launch updates and product-feedback permissions.

It must not ingest journals, voice notes, private chats, emotional state, safety
events, parent-visible content, activity history, or other wellness information.
It must not use vulnerability, age, distress, or family circumstances to improve
sales conversion.

## Canonical records

### Channel identity

```text
project_id
channel
provider_account_id
provider_user_id
display_name_optional
verified_contact_link_optional
first_seen_at
last_seen_at
blocked_at_optional
```

### Consent ledger

```text
project_id
channel
provider_identity_id
purpose: transactional | support | updates | marketing | calls
status: unknown | opted_in | opted_out | blocked | expired
source
consent_copy_version
evidence_reference
consented_at
revoked_at_optional
jurisdiction_context_optional
sender_identity
retention_state
```

### Conversation

```text
project_id
channel_identity_id
provider_conversation_id
state: open | waiting_on_customer | waiting_on_human | resolved | blocked
messaging_window_expires_at_optional
assigned_operator_optional
last_inbound_at
last_outbound_at_optional
sensitivity_flags
```

### Message envelope

Store a normalized operational envelope. Raw provider payloads should be discarded
or kept only in a narrowly bounded encrypted quarantine when required for dispute,
delivery, or signature debugging.

```text
provider_event_id
idempotency_key
direction
content_type
sanitized_text_or_reference
received_at
provider_timestamp
signature_verified
consent_decision
policy_decision
automation_level
response_or_escalation_reference
```

### Lead

```text
project_id
unified_contact_id_optional
stage: new | engaged | qualified | nurture | high_intent | booked | won | lost | do_not_contact
expressed_need
product_or_offer
source_campaign
qualification_evidence
next_action
owner
value_estimate_optional
actual_value_optional
last_stage_change_at
```

## Lead qualification

Use explicit, explainable signals:

- the person states a problem or desired outcome;
- asks about availability, price, fit, timing, sponsorship, partnership, booking,
  ordering, or access;
- completes a waitlist, consultation, product, or support flow;
- returns, replies, refers, books, or completes a verified conversion;
- has a known relationship with the relevant project.

Do not qualify based on inferred sensitive characteristics, private wellness data,
financial desperation, age, health, family situation, race, religion, or similar
protected or vulnerable signals.

The AI may recommend a lead stage. A stage change that triggers outbound contact,
pricing, a custom offer, or high-value attention must remain auditable and
reversible.

## Automation levels and release gates

### Phase 0 — Observe only

- define adapters and canonical envelopes;
- ingest synthetic fixtures only;
- validate webhook signatures and replay handling;
- test project separation and consent decisions;
- send nothing.

**Exit evidence:** adversarial contract tests and a complete provider readiness
matrix.

### Phase 1 — Draft-only unified inbox

- receive real inbound events from one approved channel;
- create summaries, intent labels, lead recommendations, and response drafts;
- require a human click for every response;
- record corrections and false classifications.

**First recommended channels:** webchat and email, then Instagram/Facebook inbound.

### Phase 2 — Approved inbound assist

- automatically answer a small catalog of low-risk FAQs;
- disclose automation;
- enforce response windows and consent;
- immediate human handoff for ambiguity, complaints, payments, safety, legal,
  medical, press, identity, or custom-term conversations.

### Phase 3 — Approved sequences

A sequence must freeze:

- project and brand;
- lawful/valid audience source;
- channel and sender;
- purpose and consent requirement;
- exact approved templates;
- start/end time and quiet hours;
- frequency cap;
- budget cap;
- conversion target;
- complaint and opt-out kill threshold;
- rollback and suppression behavior.

Every new sequence requires a separate approval. Approval does not transfer to a
new audience, channel, offer, or template.

### Phase 4 — Trusted narrow rules

Only after production proof may selected rules execute without per-message review.
Examples:

- send a waitlist confirmation immediately after explicit signup;
- respond with approved store hours or order-status instructions;
- send an opted-in appointment reminder;
- notify a human when purchase intent or sponsor interest is detected;
- close a conversation after a documented resolution period.

No unrestricted cold outreach mode exists.

## First-party webchat role

Webchat should be the control channel because it is first-party, links naturally
from the splash and waiting-list experience, and can demonstrate the complete
architecture before depending on external app reviews.

Initial webchat flow:

```text
Splash / project page
→ user opens chat
→ automation disclosure + purpose choice
→ FAQ, waitlist, sponsor, product, order, partnership, or human help
→ minimal contact capture only when necessary
→ consent and project recorded
→ answer, draft/handoff, or action
→ conversation appears in Founder Control Room
```

## Unified operator experience

The founder dashboard should show:

- all conversations with project and channel badges;
- unread, urgent, high-intent, waiting, blocked, and human-required queues;
- consent and messaging-window state beside the composer;
- one contact timeline without destructive identity merging;
- AI summary, confidence, evidence, suggested stage, and draft;
- approved knowledge source and template version;
- attribution trail from content or splash to outcome;
- send button disabled when consent, window, identity, or policy fails;
- global and per-project kill switches;
- audit trail for every automated or human action.

## AI generation system

AI may generate:

- concise conversation summaries;
- intent, urgency, sentiment-without-sensitive-inference, and lead recommendations;
- platform-appropriate drafts;
- FAQ answers grounded only in approved project knowledge;
- follow-up tasks and suggested timing;
- campaign variants for founder review;
- daily pipeline and failure summaries.

AI may not generate or send:

- invented testimonials or numbers;
- deceptive scarcity or deadlines;
- guaranteed outcomes;
- medical or legal advice;
- prices, refunds, discounts, custom terms, or commitments not approved;
- manipulative messages based on vulnerability;
- messages that conceal automation or impersonate a human operator.

## Provider adapter contract

Every adapter must implement equivalent behavior for:

- verify inbound authenticity;
- normalize events;
- generate deterministic idempotency keys;
- expose capabilities and current restrictions;
- evaluate whether a response is allowed now;
- send through one guarded dispatch method;
- normalize delivery, seen, failure, opt-out, and block events;
- redact secrets and unnecessary payload fields;
- support disable and credential-revocation paths;
- expose health and policy-version evidence.

Provider policy is runtime configuration, not folklore embedded in prompts.

## Compliance and brand controls

- Preserve evidence of consent and opt-out.
- Honor the strictest applicable suppression state before dispatch.
- Separate transactional, support, update, marketing, and call purposes.
- Use accurate sender identity and non-deceptive subject/content.
- Maintain a valid email address/unsubscribe system for commercial email.
- Treat automated calls, recordings, transcription, and synthetic voice as
  separately gated capabilities.
- Never scrape or purchase contacts for autonomous outreach.
- Keep credentials server-side, scoped, rotated, and excluded from logs.
- Use template/version approval and a content kill switch.
- Obtain qualified legal review before broad automated marketing, calling,
  recording, minor-directed marketing, or multi-jurisdiction operation.

## Metrics that matter

```text
source impression
→ landing / splash visit
→ conversation opened
→ authenticated inbound message
→ qualified intent
→ human or approved automation response
→ booked action / waitlist / sponsor / sale
→ completed and collected outcome
→ repeat or referral
```

Track conversion rates, not vanity totals. Distinguish:

- projected value;
- booked value;
- invoiced value;
- actually collected revenue;
- sponsorship pledged versus received;
- waitlist registration versus activation;
- automated response versus human-corrected response.

## Kill conditions

Disable a channel or automation when:

- provider signatures or webhook delivery cannot be verified;
- duplicate or replay events create repeated actions;
- consent state is unavailable or contradictory;
- opt-outs, blocks, complaints, or policy violations exceed the approved threshold;
- AI correction or escalation rate rises above the approved threshold;
- cross-project or sensitive-data leakage occurs;
- delivery failures or provider policy changes invalidate assumptions;
- audit, suppression, attribution, or rollback evidence is incomplete;
- a channel sends after its kill switch is activated.

## Build order

1. Commit the private skill, plan, typed contract, and channel registry.
2. Red-team the contract with synthetic events across all channels.
3. Implement first-party webchat adapter in `observe_only` then `draft_only`.
4. Implement email inbound/reply adapter and suppression ledger.
5. Add Instagram and Facebook inbound webhooks after Meta app/account readiness.
6. Add WhatsApp after WABA, phone, opt-in, template, and business verification readiness.
7. Add SMS and inbound voice only after sender registration, consent, and legal review.
8. Add Telegram when a useful user-initiated bot flow exists.
9. Treat Viber as optional after commercial onboarding proves demand.
10. Never implement Google Business Messages; maintain replacement links instead.

## Current branch boundary

This branch defines architecture, policy, machine-readable channel readiness, and
provider-neutral types. It does not:

- create or store credentials;
- connect a provider account;
- receive or send a real message;
- apply a database migration;
- deploy a webhook;
- create a campaign;
- call, text, email, or message anyone;
- authorize billing or merge.

The next approval gate is a founder-reviewed decision on the first implementation
channel, recommended as first-party webchat in `draft_only` mode.
