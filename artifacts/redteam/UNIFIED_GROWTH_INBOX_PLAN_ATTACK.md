# Red Team II — Unified Growth Inbox Plan Attack

## Selected plan

One provider-independent inbox with channel adapters, consent and suppression engine,
AI drafting and narrow inbound assistance, founder dispatch gates, attribution, and
collected-revenue reporting.

## Attack surface

### Identity

- Provider IDs can be recycled, duplicated, or attached to different humans.
- Matching on name, avatar, device, or behavior can merge unrelated people.

**Control:** preserve channel identities separately; auto-link only through verified
contact proof; send probabilistic matches to founder review.

### Consent

- A user can consent to support but not marketing.
- Permission for one Juss project can be reused improperly by another.
- Opt-out events can race with queued messages.

**Control:** purpose- and project-specific consent; strict suppression hierarchy;
atomic dispatch checks; immediate runtime opt-out; queued-message cancellation.

### Platform policy

- Messaging windows, templates, permissions, and pricing can change.
- A prompt can contain stale policy folklore.

**Control:** versioned runtime channel registry, source review date, provider health
and policy evidence, fail closed on unknown or expired state.

### Legal and jurisdiction

- Federal, state, and carrier requirements can overlap.
- Pennsylvania telemarketing registration, bonding, and Do Not Call obligations may
  apply even before the system makes its first outbound sales call.

**Control:** outbound voice disabled; qualified-counsel gate; registration and
suppression evidence required before enablement.

### AI behavior

- A model can invent prices, availability, testimonials, scarcity, or guarantees.
- It can hide automation or use emotional vulnerability to push conversion.

**Control:** approved constrained knowledge and templates; claim evidence; forbidden
sensitive targeting; human escalation; correction and complaint thresholds.

### Audit and replay

- Duplicate webhooks can cause repeated sends.
- Provider success followed by audit failure can leave uncertain external state.

**Control:** deterministic idempotency, reserve action before dispatch, normalize
provider evidence, no automatic retry after uncertain execution, global kill switch.

### Revenue truth

- Bookings, invoices, projections, and sponsorship pledges can be reported as cash.

**Control:** recognize revenue only at `payment_collected`; track refunds and
chargebacks separately.

### Se’kret Bip contamination

- Teen wellness content could leak into lead scoring or persuasion.

**Control:** explicit allowlist of waitlist/launch/sponsor/referral communication data;
architectural denylist of journals, voice, chats, safety, emotional, health, parent,
and private activity data.

## Kill criteria

Disable a channel or rule when:

- consent, identity, jurisdiction, or suppression is uncertain;
- messages send after opt-out or kill activation;
- duplicate events cause duplicate actions;
- provider policy or delivery behavior changes;
- cross-project or sensitive-data leakage occurs;
- complaints, blocks, failures, or AI corrections exceed the approved threshold;
- audit evidence cannot prove who sent what, to whom, and why.

## Plan decision

The plan survives only with draft-only default, first-party webchat first, outbound
voice disabled, explicit legal gates, separate project consent, no private Bip data,
and no unrestricted cold-outreach mode.
