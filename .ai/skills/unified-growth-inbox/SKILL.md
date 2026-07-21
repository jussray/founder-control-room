---
name: unified-growth-inbox
description: >
  Private operating contract for combining Instagram Direct Messages, Facebook
  Messenger, WhatsApp, Telegram, email, SMS/MMS, voice calls, Viber, webchat,
  and successor business-messaging channels into one consent-aware growth inbox.
version: 1.0
visibility: private
owner: Juss
---

# Unified Growth Inbox

## Parent contract

Read `.ai/skills/juss-founder-os/SKILL.md` and `GLOBAL_AI.md` first.
Apply the full founder stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

This skill may become stricter than the parent contract. It may not weaken
founder authority, brand/IP protection, privacy, evidence, rollback,
non-deletion, project separation, consent, or truthfulness.

## Trigger

Activate whenever work touches:

- Instagram Direct Messages or messaging webhooks;
- Facebook Page Messenger;
- WhatsApp Business Platform;
- Telegram bots or Mini Apps;
- marketing or transactional email;
- SMS, MMS, RCS, or voice calls;
- Viber bots or Business Messages;
- first-party webchat;
- lead capture, qualification, nurture, booking, sales, support, or follow-up;
- contact identity resolution, consent records, opt-outs, message templates,
  conversation windows, human handoff, or campaign analytics;
- an MCP, API, provider adapter, automation, or agent that may communicate
  externally in Juss's name.

## Mission

Create one founder-controlled conversation and lead system that can:

1. receive inbound messages from supported channels;
2. normalize them into a provider-independent envelope;
3. resolve a contact without merging people recklessly;
4. enforce project and channel consent before any response;
5. classify intent and lead stage using minimal necessary data;
6. answer approved low-risk questions or prepare a draft;
7. escalate sensitive, high-value, ambiguous, or policy-limited conversations;
8. preserve a complete audit trail and attribution path;
9. learn from outcomes without ingesting protected product or user data.

## Default authority state

The default operating mode is `draft_only`.

Allowed without a new outbound approval:

- receive and authenticate webhooks;
- normalize and deduplicate inbound events;
- record delivery, opt-in, opt-out, and consent evidence;
- classify intent and urgency;
- create internal summaries, draft responses, tasks, and recommended next steps;
- answer only pre-approved low-risk inbound FAQ flows when the channel window,
  consent, project policy, and confidence threshold all permit it;
- route to a human operator.

Not allowed without a separate founder approval and provider-ready evidence:

- cold outreach;
- starting an outbound marketing campaign;
- placing outbound sales calls;
- sending discounts, prices, guarantees, legal terms, medical claims, or scarcity claims;
- publishing a new template or automation rule;
- changing consent policy, retention, identity matching, audience selection, or lead scoring;
- importing a purchased, scraped, inferred, or unverified contact list;
- deploying adapters, creating credentials, changing billing, or enabling paid providers.

## Automation levels

1. `observe_only` — ingest, normalize, classify, and report; send nothing.
2. `draft_only` — prepare replies and next actions for approval.
3. `inbound_assist` — automatically answer approved low-risk inbound intents;
   escalate everything else.
4. `approved_sequence` — execute one founder-approved, consent-valid sequence with
   a fixed audience, template set, budget, time window, and kill condition.
5. `trusted_rules` — execute narrowly scoped rules only after production evidence,
   legal/policy review where material, and a separate founder enablement gate.

No level authorizes unrestricted autonomous outreach.

## Canonical processing loop

```text
provider webhook or inbound event
→ signature/authentication verification
→ idempotency and replay protection
→ provider-specific normalization
→ project boundary check
→ contact identity candidate resolution
→ consent and conversation-window decision
→ intent / urgency / lead-stage classification
→ approved FAQ response OR draft OR human escalation
→ provider dispatch gate
→ delivery evidence
→ attribution and outcome update
→ next OODA cycle
```

## Channel truth

- **Instagram:** use a professional account, approved permissions, webhooks, and
  the active messaging window. Do not treat followers as message consent.
- **Facebook Messenger:** use a Facebook Page, Page token, approved permission,
  and the platform messaging window. A Page audience is not an unrestricted list.
- **WhatsApp:** use the Business Platform, verified business assets, explicit
  channel opt-in, webhooks, and approved templates when outside the user-initiated window.
- **Telegram:** bots cannot initiate a conversation with a person who has not
  started or otherwise authorized the bot interaction.
- **Email:** distinguish transactional from commercial mail; commercial messages
  require accurate identity, non-deceptive content, a valid address, and working opt-out.
- **SMS/MMS/RCS:** store affirmative consent with source and timestamp; honor STOP
  and equivalent opt-outs globally before sending again.
- **Voice:** inbound routing is preferred first. Outbound automated sales calls,
  recording, transcription, and synthetic voice each require separate policy,
  consent, disclosure, and founder gates.
- **Viber:** bot creation is commercially gated; users generally must subscribe
  before bot messaging. Treat it as a later adapter, not a launch dependency.
- **Webchat:** first-party and highest-control, but still requires disclosure,
  consent, retention, security, and human-handoff rules.
- **Google Business Messages:** retired. Do not build a new adapter. Replace it
  with Google Business Profile links to the website, phone, and supported channels.

## Contact and identity rules

- A provider user ID, email address, and phone number are identifiers, not proof
  that records belong to the same human.
- Use deterministic verified links first. Use probabilistic suggestions only for
  founder review; never silently merge on name, avatar, device, or inferred behavior.
- Preserve provider-specific identities and consent separately even when a unified
  contact exists.
- Keep project membership explicit. A customer of one Juss project is not
  automatically a lead for every other project.

## Project and sensitive-data boundary

The growth inbox may store only the minimum information required for business
communication, attribution, consent, qualification, and support.

Never ingest into growth or sales analysis:

- teen journals, voice notes, private companion chats, safety events, parent-visible
  content, emotional-wellness content, health data, or private Se’kret Bip activity;
- credentials, access tokens, raw provider secrets, or unrestricted webhook payloads;
- private source code, prompts, unreleased architecture, vendor secrets, or legal records;
- data collected for one project merely because it might improve another project's sales.

For Se’kret Bip, the growth system may use only separately consented waitlist,
launch, sponsor, referral, account-status, and communication-preference data.

## Sales and persuasion rules

- Qualify by expressed need and behavior, not sensitive vulnerability.
- Do not exploit age, distress, financial pressure, health, family conflict, or
  private emotional content to increase conversion.
- Do not invent demand, testimonials, deadlines, scarcity, savings, results, or social proof.
- Do not conceal that the user is speaking with automation.
- Do not represent a draft, estimate, plan, sponsor contribution, or waitlist entry
  as a purchase or guaranteed access.
- High-value deals, custom terms, refunds, disputes, press, safety concerns, and
  uncertain identity go to a human.

## Consent ledger requirements

Every channel permission must record, where applicable:

- project and brand;
- channel and provider identity;
- purpose: transactional, support, marketing, updates, or calls;
- status: unknown, opted_in, opted_out, blocked, or expired;
- source and exact consent language/version;
- timestamp and jurisdiction/context;
- sender identity or messaging service;
- evidence reference;
- revocation timestamp and reason;
- retention and deletion state.

A global do-not-contact instruction overrides campaign logic. Channel-specific
opt-out remains at least as strict as the provider and applicable law require.

## AI response gate

An automated response is permitted only when all are true:

- the inbound event is authentic and not replayed;
- the project and brand are known;
- the channel's response window permits it;
- consent and opt-out state permit it;
- the intent is in the approved low-risk catalog;
- confidence meets the configured threshold;
- the response uses an approved template or constrained knowledge source;
- no sensitive, legal, medical, payment, refund, safety, identity, or custom-term issue is present;
- the action is logged and reversible where possible.

Otherwise produce a draft or escalate.

## Evidence and metrics

Track without inflating:

- inbound conversations by source and project;
- authenticated webhook success/failure and deduplication;
- first-response time and human-handoff time;
- consent, opt-out, block, delivery, and failure rates;
- qualified leads, booked actions, completed sales, sponsor conversions, and returns;
- attribution from content → landing page → splash/waitlist → conversation → outcome;
- automation containment rate and human correction rate;
- false-positive lead classification and unsafe-response interceptions;
- revenue only when actually collected and attributable, never projected as cash received.

## Stop conditions

Stop external execution and fail closed when:

- webhook authenticity cannot be established;
- contact identity or project ownership is ambiguous;
- consent or messaging-window state is missing or conflicting;
- an opt-out, block, complaint, safety concern, or legal request is received;
- the provider changes policy or deprecates the capability;
- delivery behavior differs from the documented provider path;
- credentials, data boundaries, retention, or audit state are uncertain;
- the system begins cross-project targeting or uses sensitive data;
- automated replies produce material corrections or complaints above the approved threshold.

## Required completion report

Report:

1. Reality and provider status.
2. Risk I: whether the channel or automation should exist.
3. L99 identity, consent, state, attribution, and retention view.
4. Decision and selected automation level.
5. Risk II: spam, policy, privacy, security, brand, and rollback attack.
6. Action taken.
7. Exact evidence and test state.
8. Rollback and kill switch.
9. Next founder approval gate.
