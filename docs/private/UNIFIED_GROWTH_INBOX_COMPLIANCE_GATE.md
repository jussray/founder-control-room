# Unified Growth Inbox — Lawful Revenue Compliance Gate

> **Private operating guardrail, not legal advice.** Reviewed against current public
> guidance on 2026-07-17. Laws, platform policies, carrier rules, and provider terms
> change. Refresh official sources and obtain qualified counsel before enabling broad
> outbound marketing, automated calling, recording, minor-directed marketing, or
> multi-jurisdiction campaigns.

## Mission

The Growth Inbox exists to generate lawful revenue by converting permission-based
attention into useful conversations, qualified leads, completed sales, sponsors,
bookings, referrals, and retained customers.

The system must not manufacture growth through spam, deceptive claims, unlawful
calling/texting, hidden automation, scraped contacts, sensitive-data targeting, or
cross-project consent reuse.

**Revenue is real only when collected and attributable.** Waitlist entries, projected
deal value, sponsorship pledges, booked calls, and unpaid invoices are separate
funnel states, not cash received.

## Fail-closed dispatch rule

No external message, call, campaign step, or automated reply may be dispatched unless
all required checks return `allow`:

1. **Project and brand** are explicit.
2. **Sender identity** is verified and approved for the channel.
3. **Recipient identity** is sufficiently resolved without unsafe record merging.
4. **Purpose** is classified: transactional, support, product update, marketing, or call.
5. **Consent evidence** exists when required for the specific sender, channel, and purpose.
6. **Opt-out and suppression** checks are clear across global, project, channel, and campaign lists.
7. **Conversation window or approved template** permits the message under platform rules.
8. **Jurisdiction and time-zone policy** permit the contact at that time.
9. **Do-not-call / sender-registration / campaign-registration** requirements are satisfied when applicable.
10. **Content** uses an approved template or approved constrained knowledge source.
11. **Claim evidence** exists for prices, availability, results, deadlines, sponsorship use, and social proof.
12. **Automation disclosure and human handoff** are available where required or appropriate.
13. **Frequency cap, budget cap, complaint threshold, and kill condition** are active.
14. **Audit record and idempotency key** will be written before or atomically with dispatch.

Any `unknown`, `conflict`, `expired`, or missing evidence result is a denial.

## Universal lawful-growth controls

### Consent ledger

Store proof of permission by project, sender, channel, and purpose:

- exact consent language and version;
- source page, form, keyword, inbound message, contract, or other evidence;
- timestamp and relevant jurisdiction/context;
- sender and recipient identifiers;
- scope: transactional, support, updates, marketing, or calls;
- opt-in, opt-out, block, expiry, and re-opt-in events;
- evidence retention and deletion state.

A phone number or email entered for one purpose is not blanket consent for every
purpose, project, or channel.

### Suppression hierarchy

The strictest applicable state wins:

```text
global do-not-contact
→ legal / regulatory suppression
→ provider or carrier block
→ project suppression
→ channel opt-out
→ campaign opt-out
→ frequency or quiet-hours block
→ consent/window decision
```

Opt-outs are processed immediately in runtime. Legal maximum processing periods are
not operational targets.

### Claims and advertising

- Use accurate sender identity and non-deceptive subject lines, hooks, CTAs, and offers.
- Disclose material terms, limitations, recurring charges, and automation where material.
- Never invent testimonials, demand, customer counts, revenue, scarcity, deadlines,
  availability, outcomes, discounts, or sponsorship impact.
- Paid, gifted, employee, affiliate, or otherwise connected endorsements require
  appropriate disclosure.
- Preserve honest negative reviews; do not punish customers for truthful reviews.

### Privacy and data minimization

- Store only the minimum business-communication data needed for the approved purpose.
- Never copy raw provider payloads into general analytics when a normalized envelope is sufficient.
- Keep credentials, tokens, webhook secrets, payment data, private source, and unrestricted logs out of the inbox database.
- Define retention, access, correction, deletion, and export behavior before production ingestion.
- Do not combine identities across channels or projects without verified linkage and a lawful purpose.

### Se’kret Bip and younger users

The Growth Inbox is not allowed to use teen wellness or private product data for sales.

Never ingest or target from:

- journals, voice notes, companion chats, safety events, emotional state, health data,
  parent-visible content, or private app activity;
- inferred distress, age vulnerability, family conflict, or sensitive traits;
- data gathered for safety, support, authentication, or product operation merely because
  it could improve conversion.

Only separately consented waitlist, founding-preview, sponsor, referral, account-status,
launch-update, and communication-preference records may enter the growth system.
Qualified privacy/legal review is required before broad marketing to minors or using
age-segmented campaigns.

## Channel gates

### Commercial email

Before sending:

- identify the actual sender accurately;
- use a truthful subject line and content;
- classify commercial versus transactional/relationship purpose;
- include the required advertising disclosure when applicable;
- include a valid physical postal address for commercial mail;
- include a clear, functioning unsubscribe mechanism;
- preserve a suppression list and honor opt-outs promptly;
- monitor contractors and providers acting on the business’s behalf.

Do not buy, harvest, or infer email addresses for autonomous outreach.

### SMS, MMS, and RCS

Default launch posture: **inbound and explicitly opted-in only**.

Before outbound messaging:

- prove affirmative consent for the sender and campaign purpose;
- store the signup CTA and consent evidence;
- complete applicable sender and campaign registration, such as A2P requirements;
- send required confirmation and opt-out instructions;
- honor STOP and equivalent revocation keywords immediately;
- apply recipient-local quiet hours and frequency caps;
- check reassigned-number and suppression controls where applicable;
- prohibit purchased, scraped, or third-party lead lists;
- obtain legal review for promotional, recurring, or automated campaigns.

The system must not bypass carrier filtering, rotate numbers to evade enforcement, or
spread similar traffic across senders to avoid detection.

### Voice calls

Default launch posture: **inbound routing and founder-approved callbacks only**.

Outbound sales calls remain disabled until a reviewed policy establishes:

- whether telemarketer registration or an exemption applies;
- federal and state do-not-call screening;
- documented request/consent or established-business-relationship basis where valid;
- permitted calling hours and frequency;
- caller identity and required disclosures;
- separate consent and disclosure for prerecorded/artificial voice, synthetic voice,
  recording, and transcription;
- internal do-not-call handling and immediate revocation;
- human escalation, complaint handling, and audit evidence.

Because the founder operates in Pennsylvania, no automated telemarketing campaign may
launch until counsel determines whether Pennsylvania registration, bonding, list
subscription, and other obligations apply. Pennsylvania’s official guidance states
that many telemarketers must register before offering goods or services and must screen
the state Do Not Call list even when certain registration exemptions apply.

### Instagram Direct and Facebook Messenger

- Use approved business/Page accounts, permissions, tokens, and webhooks.
- Start with user-initiated inbound conversations and draft/inbound-assist modes.
- Enforce current platform response windows and approved message categories.
- Followers, likes, comments, scraped profiles, and Page audiences are not blanket DM consent.
- Do not use unofficial browser automation or credential sharing to simulate user activity.

### WhatsApp Business Platform

- Use verified business assets and official Business Platform access.
- Record channel-specific opt-in and the purpose disclosed to the user.
- Enforce the user-initiated service window and approved templates outside it.
- Keep template, language, sender, audience, frequency, and opt-out controls versioned.
- Suspend marketing sequences when quality, complaint, delivery, or policy signals deteriorate.

### Telegram

- Use an official bot or approved business-bot flow.
- A bot does not cold-start a private conversation; the user must initiate or otherwise
  authorize the relationship.
- Keep bot identity visible and provide a clear stop/block path.
- Do not import Telegram usernames or group membership into cross-channel outreach.

### Viber

Treat as a later commercial adapter. Require official commercial onboarding, current
terms, user subscription/permission, sender approval, and cost review before enabling.
It is not a launch dependency.

### Webchat

Webchat is the recommended first implementation channel because it is first-party and
user-initiated, but it still requires:

- visible automation disclosure;
- project/purpose choice;
- consent before optional follow-up capture;
- security, rate limits, abuse controls, and human handoff;
- retention and deletion rules;
- no sensitive Se’kret Bip data in growth analytics.

### Google Business Messages

Do not build a Google Business Messages adapter. Google discontinued the product on
2024-07-31. Maintain supported contact links through the business profile, website,
phone, social channels, and first-party webchat instead.

## Automation authority ladder

### Level 0 — observe only

Synthetic fixtures, adapter contracts, policy decisions, and tests. No real dispatch.

### Level 1 — draft only

Receive approved real inbound events and create summaries, lead recommendations, and
response drafts. A human sends every response.

### Level 2 — inbound assist

Automatically answer only approved, low-risk, user-initiated FAQs within valid windows.
Escalate ambiguity, complaints, payment, identity, safety, legal, medical, press, refund,
custom-term, or high-value conversations.

### Level 3 — approved sequence

Execute one approved sequence with a frozen project, sender, audience source, consent
rule, template set, start/end time, quiet hours, frequency, budget, conversion target,
complaint threshold, and kill switch.

### Level 4 — trusted narrow rules

Only after legal/policy review, production evidence, and a separate founder enablement
gate. No unrestricted cold-outreach level exists.

## Required pre-launch legal packet

Before any Level 3 or Level 4 marketing or calling capability, create and review:

1. channel and provider terms snapshot;
2. jurisdiction matrix;
3. consent language and evidence flow;
4. privacy notice and retention schedule;
5. suppression and opt-out test evidence;
6. sender/campaign/telemarketer registration status;
7. approved templates and claim substantiation;
8. quiet-hours and frequency policy;
9. complaint, incident, and legal-request workflow;
10. human handoff and automation disclosure;
11. rollback and emergency kill proof;
12. qualified-counsel decision or documented reason it is not required.

## Revenue scoreboard

Track separately:

```text
attention
→ permission
→ conversation
→ qualified need
→ offer or action
→ booked
→ purchased / sponsored
→ payment collected
→ retained / referred
```

Report:

- collected revenue by project and attributable source;
- refunds, chargebacks, delivery failures, opt-outs, complaints, and acquisition cost;
- lead-to-sale and conversation-to-sale conversion;
- sponsor pledged versus sponsor paid;
- booked versus completed appointments;
- AI-assisted versus human-corrected outcomes;
- revenue per consented contact, never revenue per scraped contact.

## Kill conditions

Immediately disable dispatch when:

- consent, identity, window, jurisdiction, or suppression state is uncertain;
- opt-outs or complaints are not processing correctly;
- a provider policy or law changes materially;
- messages send after suppression or the kill switch;
- sender identity, template, or attribution is wrong;
- cross-project targeting or sensitive-data use occurs;
- complaint, block, delivery-failure, or AI-correction rates exceed the approved threshold;
- audit records are missing or cannot prove who sent what and why.

## Authoritative public sources to refresh

- Federal Trade Commission: CAN-SPAM and advertising/disclosure guidance.
- Federal Communications Commission: TCPA, robocall, robotext, consent, and revocation guidance.
- Pennsylvania Office of Attorney General: Telemarketing Registration and Do Not Call guidance.
- Current official Meta, WhatsApp, Telegram, Viber, email, SMS/voice provider, and carrier policies.
- Google Business Messages discontinuation notice.

The Control Room must store source titles, review dates, and policy versions, not assume
that a prompt written once remains legally or operationally current forever.
