# Day 3 Buffer Content Boundary

Status: `DAY3_PROVEN__20_MINUTE_REVIEW_WINDOW_IMPLEMENTED_AWAITING_LIVE_ACTIVATION`

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

The next phase is controlled scheduled distribution with a founder review window. Repository implementation does not itself prove that the live Zap has been remapped, enabled, or executed.

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
steering grant ID
authorization_mode: standing-policy
runtime-minted founder_approval_id
schedule_policy_id: buffer-20-minute-review-v1
notification_mode: gmail_campaign_digest
publish_allowed: true
destination_mode: schedule
```

The runtime-minted authorization receipt must equal:

```text
standing-policy:<steeringGrantId>:<invocationId>
```

A checked-in policy name is not authorization. Caller-written approval text, a copied policy identifier, or a mismatched invocation fails closed.

The firewall owns the provider fields and emits:

```text
buffer_action: buffer_add_to_queue
buffer_method: schedule
buffer_save_to_draft: false
scheduled_at: generated_at + 20 minutes
review_deadline: scheduled_at
notification_required: true
notification_failure_policy: cancel_scheduled_batch
share_now_allowed: false
```

Caller-supplied `scheduled_at`, `method`, `buffer_method`, `saveToDraft`, or `share_now` values cannot override those outputs.

## Required Zap order

```text
verified source signal
-> Founder Signal standing-policy gate
-> runtime-minted one-invocation authorization receipt
-> one structured AI action
-> select up to three channel-specific finished posts
-> run each post through buffer-content-firewall.cjs
-> create Buffer schedules for the owned fire time
-> retain every returned Buffer post ID
-> build one Gmail campaign digest
-> send the digest to the founder mailbox
-> retain Gmail thread ID, review token, sender, deadline, and Buffer IDs
-> process only matching-thread replies from the founder mailbox
-> cancel, or regenerate + revalidate + update, before the deadline
-> no reply leaves the existing Buffer schedules unchanged
-> retain final Buffer/platform and Founder Control Room receipts
```

## Gmail review contract

One campaign digest contains every scheduled caption, channel, fire time, Buffer post ID, and the review token.

Accepted commands before the deadline:

```text
cancel all
<channel>: cancel
<channel>: <requested tweak>
```

A reply is rejected unless all of these match retained state:

- review token;
- founder mailbox sender;
- original Gmail thread;
- review deadline;
- exactly one target channel for multi-post edits.

An edit request does not directly mutate Buffer. It returns to generation and the content firewall, preserving the original scheduled fire time only when enough time remains to complete the validated update.

If Gmail notification fails, cancel the complete scheduled batch. Do not allow silent publication without the promised review notice.

## Budget boundary

The budget funds six campaigns per month as:

```text
3 Buffer schedule actions
+ 1 Gmail campaign digest
= 4 tasks per campaign
```

Founder-signal analysis is reduced from 30 to 27 monthly runs so the complete plan remains at 88 planned tasks, two below the 90-task operating ceiling, with ten emergency-reserve tasks.

The repository plan label is not proof of current Zapier account capability. Before activation, verify that the live plan supports the webhook and multi-step workflow actually used.

## Proof boundary

Repository tests prove:

- the exact 20-minute computation;
- stale-generation rejection;
- runtime receipt correlation;
- prompt and forbidden-field rejection;
- caller override resistance;
- one digest for up to three posts;
- sender, thread, token, and deadline checks;
- channel-scoped edit and cancel commands;
- cancel-on-notification-failure compensation;
- no-reply preservation of the existing schedule;
- the 88-task budget ceiling.

They do not prove:

- live Zapier plan capability;
- installed secrets;
- live Zap mapping;
- Buffer schedule creation;
- Gmail delivery or reply ingestion;
- edit or cancellation against Buffer;
- public platform publication;
- final receipt correlation.

## Activation gates

Live activation requires:

```text
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
```

It also requires one controlled synthetic campaign proving:

```text
exact source SHA and proof URL
standing-policy decision and runtime receipt
Zapier run ID
three or fewer Buffer schedule IDs
one Gmail digest and thread ID
one edit or cancel path
one no-reply path
final Buffer/platform receipts
Founder Control Room audit correlation
```

No raw secret belongs in GitHub, chat, HubSpot, Buffer captions, screenshots, or evidence artifacts.

## `share_now` boundary

`share_now` remains rejected by this contract. A founder naming a specific immediate run does not automatically create executable authority. Immediate publication requires a separate, exact-run contract with its own receipt, tests, expiry, replay protection, and rollback.

## Rollback

1. Disable or remove `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` before changing provider state.
2. Disable the affected Zap or Catch Hook.
3. Cancel only the identified scheduled test batch when provider IDs are known.
4. Revert the firewall, review controller, tests, provider contract, task budget, workflow, and operator instructions together.
5. Preserve Zap history, Gmail receipts, Buffer receipts, platform receipts, HubSpot evidence, and Founder Control Room audits.

## Stop condition

This code phase is complete only when exact-head checks pass on one immutable PR head. Live activation remains separate and stops at the first missing secret, plan capability, provider receipt, or correlation artifact.
