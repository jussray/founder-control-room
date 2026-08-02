# Claude Zapier Operator Contract

## Purpose

Claude is a first-class Founder Signal Engine operator only when a connected Zapier MCP or another declared control surface exposes the required capability.

This is not a generic permission grant. Tool connection, repository configuration, live plan capability, provider authority, and completed execution are separate states.

The OpenAI Developers bridge remains a separate ChatGPT/OpenAI route. Neither route silently expands the other route's authority.

## Milestone truth

The original Day 3 draft-routing milestone is proven and closed.

```text
Repository: jussray/Sekret-Bip
Pull request: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
Founder Control Room issue: #73
```

Do not reopen it or describe the historical draft receipt as the current blocker.

The current target is:

```text
verified source evidence
-> server-held standing-policy decision
-> runtime one-invocation receipt
-> structured platform copy
-> exact Buffer custom schedules at generated_at + 20 minutes
-> one Gmail campaign digest
-> instant private reply ingress
-> founder edit/cancel window
-> no valid reply preserves automatic publication
-> retained provider and Founder Control Room receipts
```

Repository implementation does not prove live Zap mapping, plan capability, mail routing, or provider execution.

## Execution modes

### Conversational mode

Claude may inspect and reconcile connected Gmail, GitHub, HubSpot, Buffer, or Zapier evidence while the founder is actively requesting it.

A conversational run does not become an always-on Zap merely because it succeeded once.

### Event mode

Work that must continue after the conversation closes requires a real published trigger plus every capability in the checked-in activation contract.

The complete event path may be implemented through a capable multi-step Zap, backend orchestration, or a deliberately split architecture. A two-step Free Zap alone is not sufficient.

## Saved-skill and Zap rule

When an existing Zap or saved skill covers the purpose:

1. inspect it first;
2. update it rather than create a duplicate;
3. preserve useful sources and identifiers;
4. add only missing evidence, authority, scheduling, notification, ingress, and writeback behavior;
5. report exactly what changed.

## Authority model

Connection is capability, not authority.

Scheduled publication is allowed only when:

- exact evidence satisfies the server-held standing policy;
- the gate selects `auto-distribute` for the exact route;
- authenticated middleware supplies the matching grant and invocation context;
- the runtime mints:

```text
standing-policy:<grantId>:<invocationId>
```

- the Buffer firewall verifies that correlation;
- the post includes an approved content field, exact source SHA, HTTPS proof, fresh generation time, and review-window metadata.

A checked-in policy name, caller-written approval, copied receipt, founder-sounding sentence, or manually mapped provider field is not authority.

The runtime receipt is an exact correlation value backed by authenticated middleware and private ingress. It is not a standalone cryptographic signature.

## Evidence-first investigation

Follow exact identifiers rather than similar titles:

```text
repository
pull request
branch
commit SHA
workflow and run ID
job ID when available
source timestamp
policy and invocation IDs
Buffer post IDs and due times
Gmail message evidence
private reply address and ingress receipt
final provider receipts
```

Every conclusion must separate:

```text
VERIFIED
INFERRED
UNKNOWN
BLOCKED
```

Primary incident classifications remain:

```text
ACTIVE_FAILURE
HISTORICAL_FAILURE
STALE_NOTIFICATION
INFRASTRUCTURE_FAILURE
RESOLVED
UNRESOLVED
```

A closed pull request does not by itself make a failure notification stale.

## Structured generation contract

Generate the complete platform set in one structured action when the planning envelope requires it.

Only finished approved output fields may reach the Buffer firewall. Raw prompts, source notes, instructions, user messages, and unresolved templates are forbidden.

Every public post must carry:

```text
traction
governance advantage
clickable proof
```

## Buffer scheduling contract

Every selected post passes `tools/zapier/buffer-content-firewall.cjs`.

Required input includes:

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

The firewall owns the exact fire time and provider fields:

```text
scheduled_at = generated_at + 20 minutes
buffer_api_sharing_mode = customScheduled
buffer_api_due_at = scheduled_at
buffer_save_to_draft = false
share_now_allowed = false
```

Map Buffer only from firewall-owned outputs. Never rely on provider defaults or caller-supplied schedule fields.

The Zapier-facing `buffer_method: schedule` remains a desired mapping that must be proven against the live action schema. The current Buffer API-safe equivalent is `customScheduled` plus `dueAt`.

## Gmail notification contract

After all selected Buffer schedules return real IDs, send one Gmail digest for up to three posts.

The digest contains:

```text
caption
channel
fire time
Buffer post ID
review deadline
review token
private Reply-To address
```

Notification failure triggers cancel-batch compensation when identified provider IDs exist.

## Instant private reply-ingress contract

Gmail remains the visible notification channel. Gmail polling is not accepted as the deadline command path because a polling interval can consume most of a 20-minute window.

The deadline path requires instant private ingress. Preferred architecture:

```text
Gmail digest with context-bound Reply-To
-> owned-domain private address
-> Cloudflare Email Routing Worker
-> founder sender + recipient/context + token + deadline checks
-> controlled edit/cancel action
```

This route is not considered live until DNS/routing, Worker execution, identity checks, and provider effects have real receipts.

Accepted commands:

```text
cancel all
<channel>: cancel
<channel>: <requested tweak>
```

The parser accepts exactly one unquoted command on the first non-empty line. Recognized quoted history and signatures after it may be ignored. Reject quoted-only messages, multiple unquoted commands, sender mismatch, recipient/context mismatch, token mismatch, expired commands, ambiguous channels, and edits that bypass regeneration.

An edit request returns to generation and firewall validation before Buffer update. No valid reply means no extra publish call; Buffer retains the existing schedule.

## HubSpot writeback

When CRM write is separately approved, associate evidence with the same source deal:

```text
Deal: Founder Signal Engine
Deal ID: 337185466050
```

Do not create floating evidence records when the canonical deal is known.

## Planning envelope and capability truth

The self-imposed envelope funds six campaigns as:

```text
3 Buffer schedule actions
+ 1 Gmail digest
= 4 planned tasks per campaign
```

The full envelope remains 88 planned tasks under a 90-task operating ceiling with 10 reserve tasks. This is cost planning, not proof of a live Zapier subscription or topology.

Activation requires:

```text
verified webhook capability
verified multi-step Zap or backend orchestration
instant private reply ingress
live Buffer schedule schema
```

## Required proof

A scheduled run is complete only when applicable artifacts exist:

```text
exact source SHA and proof URL
policy decision, grant, invocation, and runtime receipt
Zapier or backend run receipt
structured output
each Buffer schedule ID and due time
Gmail message evidence and private Reply-To
instant reply-ingress receipt
edit, cancel, compensation, or no-reply result
HubSpot same-deal evidence when approved
final Buffer/platform receipt
Founder Control Room correlation
```

## Failure behavior

1. retain the exact first failure;
2. do not blindly retry an external creation action;
3. search for existing provider artifacts before replay;
4. compensate only identified artifacts;
5. preserve partial IDs and evidence;
6. stop at the smallest unresolved gate.

## Report format

```text
REALITY
FIX
PROOF
RISK
ROLLBACK
NEXT GATE
```

## Separate approval required

This contract does not authorize:

- merge or deployment;
- secret creation, rotation, or disclosure;
- DNS or Email Routing changes;
- enabling or publishing a Zap;
- billing changes;
- deletion of Zaps, branches, records, mail, provider artifacts, or evidence;
- immediate `share_now` publication;
- unrelated outreach or account access.

## Stop condition

Valid current stop gates include:

```text
missing bridge secret
missing automation grant
unsupported Zapier topology
missing instant private reply ingress
missing runtime receipt
missing Buffer schedule ID
missing Gmail notification receipt
reply identity or context mismatch
expired review window
missing final provider receipt
```
