# Day 3 Buffer Content Boundary

Status: `DAY3_PROVEN__REVIEW_WINDOW_IMPLEMENTED_AWAITING_LIVE_PROVIDER_AND_INGRESS_PROOF`

Authoritative budget: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

Machine-readable provider contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable firewall: [`tools/zapier/buffer-content-firewall.cjs`](../../tools/zapier/buffer-content-firewall.cjs)

Review controller: [`tools/zapier/buffer-review-window.cjs`](../../tools/zapier/buffer-review-window.cjs)

Verification:

```bash
npm run verify:buffer-content
node scripts/verify-zapier-task-budget.mjs
```

## Historical Day 3 truth

The Day 3 draft-routing milestone is proven and closed. Do not reopen it or describe the original draft proof as the current blocker.

Historical source:

```text
Repository: jussray/Sekret-Bip
Pull request: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
Founder Control Room issue: #73
```

The current phase is controlled scheduled distribution with a founder review window. Repository implementation does not prove live Zap mapping, Buffer creation, Gmail delivery, reply ingress, or publication.

## Current executable contract

A valid Buffer input must contain:

```text
finished platform-native post text
approved content field and channel
exact HTTPS proof URL
exact 40-character source commit SHA
fresh generated_at timestamp
batch UUID, size, and item index
invocation UUID
steering grant ID, maximum 100 characters
authorization_mode: standing-policy
runtime-minted founder_approval_id, maximum 200 characters
schedule_policy_id: buffer-20-minute-review-v1
notification_mode: gmail_campaign_digest
publish_allowed: true
destination_mode: schedule
```

The runtime receipt must equal:

```text
standing-policy:<steeringGrantId>:<invocationId>
```

This is an exact correlation receipt backed by authenticated Founder Control Room middleware and private provider ingress. It is not a standalone cryptographic signature. Caller-written approval, copied identifiers, or a mismatched invocation fails closed.

The firewall owns the provider fields and emits:

```text
scheduled_at: generated_at + 20 minutes
review_deadline: scheduled_at
buffer_method: schedule
buffer_api_sharing_mode: customScheduled
buffer_api_due_at: scheduled_at
buffer_save_to_draft: false
notification_required: true
notification_failure_policy: cancel_scheduled_batch
share_now_allowed: false
```

Caller-supplied schedule, provider mode, draft, or immediate-share values cannot override those outputs.

## Required operating order

```text
verified source signal
-> standing-policy gate
-> runtime one-invocation receipt
-> one structured AI action
-> select up to three finished channel posts
-> run every post through the content firewall
-> create exact Buffer custom schedules
-> retain every Buffer post ID and due time
-> build one Gmail campaign digest
-> send it with a private reply address bound to the review context
-> retain notification and reply-ingress evidence
-> process only valid founder commands before the deadline
-> cancel, or regenerate + revalidate + update
-> no valid reply leaves the existing Buffer schedules unchanged
-> retain final provider and Founder Control Room receipts
```

## Gmail notification and reply ingress

Gmail remains the founder-visible notification channel. One digest contains each caption, channel, fire time, Buffer post ID, and review token.

Accepted commands:

```text
cancel all
<channel>: cancel
<channel>: <requested tweak>
```

The parser accepts exactly one unquoted command on the first non-empty line. Recognized quoted history and mail signatures after the command are ignored. Quoted-only messages and multiple unquoted commands fail closed.

A deadline command must match retained founder identity, review context, token, and deadline. Multi-post edits must identify one exact channel. Edits return to generation and firewall validation before Buffer update.

### Latency boundary

A polling Gmail trigger is not accepted for the 20-minute deadline path. A 15-minute poll can leave too little time to process a command safely and cannot guarantee service throughout the window.

Activation therefore requires instant private reply ingress. The preferred durable route is:

```text
Gmail digest
Reply-To: private review address on an owned domain
-> Cloudflare Email Routing Worker
-> validate founder sender, review context, token, and deadline
-> controlled edit/cancel action
```

That inbound route is an activation gate and separate implementation surface. This PR does not claim that Email Routing, DNS, Worker deployment, or live reply processing has been configured.

If notification delivery fails, cancel the identified scheduled batch. Do not allow silent publication without the promised notice.

## Budget boundary

The self-imposed planning envelope funds six campaigns as:

```text
3 Buffer schedule actions
+ 1 Gmail campaign digest
= 4 tasks per campaign
```

The complete envelope remains:

```text
88 planned tasks
90-task operating ceiling
2-task operating headroom
10-task emergency reserve
100-task maximum envelope
```

This budget is not evidence of the connected Zapier subscription or workflow capabilities. A Free two-step Zap alone is insufficient for the complete orchestration. Activation requires a verified multi-step Zap or backend orchestration plus instant private reply ingress.

## Proof boundary

Repository tests prove:

- exact `generated_at + 20 minutes` computation;
- Buffer API `customScheduled` and `dueAt` mapping;
- stale-generation rejection;
- runtime receipt correlation and backend-aligned limits;
- prompt and forbidden-field rejection;
- provider override resistance;
- one digest for up to three posts;
- one-command reply parsing;
- founder/context/token/deadline checks in the controller contract;
- channel-scoped edit and cancel commands;
- cancel-on-notification-failure compensation;
- no-reply preservation of existing schedules;
- the 88-task planning envelope;
- explicit rejection of Gmail polling as the deadline ingress.

They do not prove:

- live Zapier plan or action-schema capability;
- installed secrets or automation grant;
- live Zap mapping;
- Buffer schedule creation;
- Gmail delivery;
- Cloudflare Email Routing or Worker deployment;
- real edit or cancellation against Buffer;
- public platform publication;
- final receipt correlation.

## Activation gates

Required secrets:

```text
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
```

Required capabilities and evidence:

```text
verified webhook trigger
verified multi-step workflow or backend orchestration
instant private reply ingress
live Buffer schedule schema and returned IDs
one Gmail digest with bound private Reply-To
one edit or cancel path
one no-reply path
final Buffer/platform receipts
Founder Control Room audit correlation
```

No raw secret belongs in GitHub, chat, HubSpot, captions, screenshots, or evidence artifacts.

## `share_now` boundary

`share_now` remains rejected. Immediate publication requires a separate exact-run contract with its own authority, expiry, replay protection, tests, receipts, and rollback.

## Rollback

1. Disable or remove `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON`.
2. Disable the affected Zap, Catch Hook, and private reply route.
3. Cancel only identified scheduled test artifacts when provider IDs exist.
4. Revert the firewall, review controller, tests, provider contract, planning envelope, workflow, and operator instructions together.
5. Preserve Zap history, mail receipts, Buffer/platform receipts, HubSpot evidence, and Founder Control Room audits.

## Stop condition

This repository phase is complete only when exact-head checks pass on one immutable PR head. Live activation stops at the first missing secret, capability, instant reply-ingress proof, provider receipt, or correlation artifact.
