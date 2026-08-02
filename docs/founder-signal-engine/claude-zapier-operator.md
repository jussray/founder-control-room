# Claude Zapier Operator Contract

## Purpose

Claude is a first-class Founder Signal Engine operator when Claude has a connected Zapier MCP or another declared Zapier control surface.

This is not a generic permission grant. Claude may use only the tools, accounts, records, Zaps, and actions exposed by the connected control surface and covered by the current founder-approved scope.

The OpenAI Developers bridge remains a separate ChatGPT/OpenAI route. Claude may use its direct Zapier path when that path exposes the required capability. Neither route silently expands the other route's authority.

## Milestone truth

The original Day 3 draft-routing milestone is proven and closed.

Historical Day 3 source:

```text
Repository: jussray/Sekret-Bip
Pull request: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
Founder Control Room issue: #73
```

Do not reopen that milestone or describe its original draft receipt as the current blocker.

The current target is controlled scheduled distribution:

```text
verified source evidence
-> server-held standing-policy decision
-> runtime-minted one-invocation authorization receipt
-> one structured AI result
-> Buffer schedules at generated_at + 20 minutes
-> one Gmail campaign digest
-> founder edit/cancel window
-> no reply preserves automatic Buffer publication
-> retained provider and Founder Control Room receipts
```

Repository implementation is not proof that the live Zap has been remapped, enabled, or executed.

## Two execution modes

### Conversational Zapier MCP mode

Claude may perform a requested cross-app investigation while the founder is actively asking for it.

Examples:

- read a Gmail notification;
- extract repository, pull request, workflow, branch, SHA, run ID, and timestamp;
- inspect matching GitHub evidence;
- cross-reference HubSpot records;
- inspect or update an existing saved Zapier skill when supported;
- return a joined conclusion.

A conversational run does not become an always-on event Zap merely because it succeeded once.

### Event Zap mode

Work that must continue after the conversation closes requires a published Zap with a real trigger and a verified live plan that supports the chosen workflow.

Current scheduled path:

```text
Founder Signal Engine invocation
-> exact evidence and policy gate
-> runtime authorization receipt
-> structured generation
-> executable content firewall
-> Buffer schedule creation
-> Gmail digest and reply monitoring
-> Buffer edit/cancel or no-change result
-> HubSpot and Founder Control Room evidence
```

Do not describe a conversational tool call or repository test as proof that this event path is active.

## Saved skill rule

When an existing saved Zapier skill such as `founder rundown` covers the requested purpose:

1. inspect the existing skill;
2. update it rather than create a duplicate;
3. preserve useful existing sources and behavior;
4. add only the missing verification, classification, scheduling, and writeback rules;
5. report exactly what changed.

Do not create near-duplicates merely to produce visible activity.

## Authority model

Connection is capability, not authority.

Scheduled publication is allowed only when all of these are true:

- exact source evidence satisfies the server-held standing policy;
- the policy gate selects `auto-distribute` for the exact route;
- the middleware supplies the matching grant and invocation context;
- the runtime mints this receipt:

```text
standing-policy:<grantId>:<invocationId>
```

- the Buffer firewall verifies that exact receipt correlation;
- the post uses an approved content field, exact source SHA, HTTPS proof, fresh generation timestamp, and the 20-minute schedule contract.

A checked-in policy name, caller-written approval, copied receipt, founder-sounding sentence, or manual field mapping is not authority.

This receipt is a runtime correlation value backed by the authenticated backend and private hook boundary. It is not a standalone cryptographic signature and must never be accepted outside that trusted path.

## Evidence-first investigation

For Gmail-to-GitHub or similar cross-source work, extract and verify the most specific available identifiers:

```text
repository
pull request number
workflow name
branch
commit SHA
workflow run ID
job ID when available
event timestamp
notification timestamp
provider artifact IDs
```

Follow identifiers, not similar titles.

A closed pull request does not by itself prove a failure notification is stale.

## Required classification

Use exactly one primary classification:

```text
ACTIVE_FAILURE
HISTORICAL_FAILURE
STALE_NOTIFICATION
INFRASTRUCTURE_FAILURE
RESOLVED
UNRESOLVED
```

Rules:

- `ACTIVE_FAILURE`: the exact current ref or workflow remains failing and action is required.
- `HISTORICAL_FAILURE`: the failure was real but applies to superseded or completed work.
- `STALE_NOTIFICATION`: newer evidence proves the notice no longer represents current state.
- `INFRASTRUCTURE_FAILURE`: zero-step, no-log, runner-startup, provider, or platform evidence prevents assigning a code regression.
- `RESOLVED`: the exact failure has later verified green or superseding proof.
- `UNRESOLVED`: connected tools cannot establish a defensible classification.

## Evidence labels

Every conclusion must separate:

```text
VERIFIED
INFERRED
UNKNOWN
BLOCKED
```

Never promote inference into VERIFIED because it sounds probable.

## Structured generation contract

Generate the complete platform set in one structured AI action when the budget contract requires it.

Required proof-bearing fields include:

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
traction
governance_advantage
clickable_proof
linkedin_draft
facebook_founder_draft
facebook_brand_draft
instagram_draft
publish_allowed
```

Only approved platform output fields may reach the Buffer firewall. Raw prompts, instructions, user messages, source notes, and unresolved template values are forbidden.

## Buffer scheduling contract

Each selected channel must pass `tools/zapier/buffer-content-firewall.cjs`.

Required inputs include:

```text
post_text
content_field
channel
destination_mode: schedule
publish_allowed: true
proof_url
source_commit_sha
generated_at
batch_id
batch_size
batch_index
invocation_id
steering_grant_id
founder_approval_id
authorization_mode: standing-policy
schedule_policy_id: buffer-20-minute-review-v1
notification_mode: gmail_campaign_digest
```

Map Buffer only from firewall-owned outputs:

```text
Post Text <- validated_post_text
Method <- buffer_method
Scheduled time <- scheduled_at
```

The firewall owns the fire time:

```text
scheduled_at = generated_at + 20 minutes
```

It rejects draft, queue, publish, share-next, schedule-draft, and share-now modes under this contract. Caller-supplied provider fields cannot widen the output.

## Gmail review contract

After all selected Buffer schedules return real post IDs, build one campaign digest for up to three posts.

The digest must contain:

```text
caption
channel
fire time
Buffer post ID
review deadline
review token
```

Accepted commands:

```text
cancel all
<channel>: cancel
<channel>: <requested tweak>
```

The parser accepts exactly one unquoted command on the first non-empty line. Standard quoted history and recognized mail signatures after that command are ignored. Multiple unquoted command lines and quoted-only messages fail closed.

A reply is actionable only when all retained values match:

- founder mailbox sender;
- original Gmail thread ID;
- review token;
- deadline;
- one exact target channel for multi-post edits.

An edit request returns to generation and firewall validation before any Buffer update. It never maps raw reply text directly into Buffer.

If Gmail notification fails, cancel the scheduled batch and retain partial-failure evidence. Do not silently publish without the promised review notice.

If no valid reply arrives, perform no extra publish call. Buffer retains the existing schedule.

## HubSpot writeback

When CRM write is approved, associate the result with the same source deal rather than creating a floating note or task.

Canonical deal:

```text
Deal: Founder Signal Engine
Deal ID: 337185466050
```

Retain:

```text
source event ID
signal ID
decision
VERIFIED / INFERRED / UNKNOWN / BLOCKED
source SHA and proof URL
policy and invocation references
Zapier run ID
Buffer schedule IDs and fire times
Gmail message and thread ID
edit, cancel, compensation, or no-reply result
final provider receipts
```

A successful AI response without associated evidence does not prove the closed loop.

## Budget rule

The current checked-in budget funds six campaigns as:

```text
3 Buffer schedule actions
+ 1 Gmail campaign digest
= 4 tasks per campaign
```

Do not send one notice per channel unless the budget contract is deliberately changed and reverified.

The repository label `Zapier Free` is an assumption about the planned budget, not proof of live plan capability. Verify the account supports the webhook and multi-step workflow before activation.

## `share_now`

The current contract rejects `share_now`.

A founder naming a specific immediate run does not make the present code support it. Immediate publication requires a separate exact-run authority contract with expiry, replay protection, tests, receipts, and rollback.

## Required proof

A scheduled Founder Signal Engine run is complete only when applicable artifacts exist:

```text
exact source identifiers and SHA
trusted proof URL
policy decision and grant ID
invocation ID and runtime receipt
Zapier run ID and status
structured AI output
each Buffer schedule ID and fire time
Gmail message and thread ID
founder reply result or no-reply result
HubSpot same-deal evidence when approved
final Buffer or platform receipt
Founder Control Room audit correlation
```

Do not claim the chain ran when a mandatory artifact is missing.

## Failure behavior

When a step fails:

1. retain the exact error or skipped-step reason;
2. identify the first failed stage;
3. do not blindly retry an external creation action;
4. search retained evidence for an existing artifact before replay;
5. execute defined compensation when safe and supported;
6. preserve partial provider IDs and receipts;
7. stop at the smallest unresolved gate.

## Required report format

```text
REALITY
FIX
PROOF
RISK
ROLLBACK
NEXT GATE
```

## Separate approval required

This contract does not itself authorize:

- merge or deployment;
- secret creation, rotation, or disclosure;
- enabling or publishing a Zap;
- unrelated account access;
- billing changes;
- deletion of Zaps, records, branches, provider artifacts, or evidence;
- immediate `share_now` publication;
- vendor, customer, official, sponsor, or investor outreach outside its own approved route.

## Stop condition

Stop when the scoped action is evidenced or one exact external gate prevents further verified progress.

Valid current gates include:

```text
missing bridge secret
missing automation grant
unsupported Zapier plan capability
missing runtime authorization receipt
missing Buffer post ID
missing Gmail thread receipt
reply identity mismatch
expired review window
missing final provider receipt
```
