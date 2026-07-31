# Founder Signal Engine — Zapier 100-Task Budget

Status: `LOCKED_SCOPE`

Authoritative budget: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

Verification: `npm run verify:zapier-budget`

## Reality

Ray reports 126 monthly Zapier tasks in the current scope while the active free plan includes 100 monthly tasks.

A scoped outcome is not automatically a billable task. Zapier counts successful billable action executions. Triggers and supported built-in control steps such as Filters, Formatter, Paths, Delay, Looping, Sub-Zaps, Digests, Zapier Manager, Storage, Tables, and Forms are assigned to the free control plane in this contract.

The repository does not contain a current Zapier History export proving which live actions produced the reported 126. Therefore:

- `126` is the founder-reported baseline;
- `82` is the locked planned monthly budget;
- the reduction is a scoped architecture target, not proof that the live Zapier account has already changed;
- no existing Zap may be deleted or disabled automatically.

## Goal

Preserve the required Founder Signal Engine outcomes while keeping routine Zapier usage below the free-plan limit:

```text
100 monthly task limit
- 10 emergency reserve
= 90 operating ceiling
- 82 planned tasks
= 8 routine headroom
```

The 82-task plan reduces the reported baseline by 44 tasks, or about 35%, without removing the review, social, investor-outreach, failure, or evidence outcomes.

## Consolidated system

### Free intake and routing plane

Normalize every source event into one Zapier Table queue:

```text
GitHub, HubSpot, Gmail, or approved manual request
-> source trigger
-> free Filter and Formatter steps
-> free Zapier Table queue record
```

Each queue record must include:

```text
source_event_id
signal_id
source
source_record_url
associated_deal_id
mode
publish_allowed
requested_outcomes
idempotency_key
created_at
```

Do not call AI, Buffer, Gmail, or a paid external write before the budget and idempotency gates pass.

### One core analysis lane

The queue feeds one core Founder Signal processor:

```text
new queued signal
-> free duplicate and monthly-budget gates
-> one structured AI analysis action
-> free validation and routing paths
-> one same-deal HubSpot result note
-> free proof and budget records in Zapier Tables
```

One AI action must generate the complete machine-mappable result, including:

```text
5W1H
VERIFIED / INFERRED / UNKNOWN
missing evidence
recommended next action
LinkedIn review draft
Facebook review draft
Instagram review draft
investor-outreach draft when requested
publish_allowed: false
```

Do not spend separate AI tasks for each social channel or each proof format.

### Social approval lane

Social content remains review-only until an exact founder approval event exists.

```text
approved LinkedIn draft
-> free approval and budget gates
-> one Buffer action
-> free returned-artifact ledger record
```

LinkedIn is the only budgeted Buffer channel in the first 100-task plan. Facebook and Instagram remain generated review drafts in HubSpot until the budget is intentionally reallocated.

### Investor outreach lane

Investor research and draft preparation happen inside the core AI response. The paid action is reserved for the real approved send:

```text
approved personalized investor email
-> free approval and budget gates
-> one email send action
-> free evidence ledger record
```

Do not batch unrelated investors into one impersonal message merely to save tasks. Do not send without exact founder approval for the recipient and content.

### Failure lane

Use the Zapier-supported error trigger for genuine failures:

```text
Zap error
-> free Zap-name and correlation filters
-> one same-deal HubSpot failure task
-> free failure ledger record
```

Do not create routine success tasks in addition to the canonical HubSpot result note. A HubSpot task is reserved for a real failure or an explicit founder follow-up.

### Founder Control Room proof

The same-deal HubSpot result note and Zapier Table record are the canonical Zapier-produced proof artifacts.

Founder Control Room must read or ingest those artifacts through its own runtime instead of requiring a second Zapier write for every event. This preserves Control Room evidence while avoiding a duplicated paid action.

## Monthly allocation

| Lane | Monthly runs | Tasks per run | Planned tasks |
|---|---:|---:|---:|
| Structured signal analysis plus HubSpot result | 30 | 2 | 60 |
| Approved LinkedIn Buffer action | 10 | 1 | 10 |
| Approved personalized investor email | 8 | 1 | 8 |
| Same-deal failure task | 4 | 1 | 4 |
| **Planned total** |  |  | **82** |
| Routine headroom below 90-task ceiling |  |  | **8** |
| Emergency reserve |  |  | **10** |
| **Free-plan limit** |  |  | **100** |

## What was merged conceptually

1. LinkedIn, Facebook, Instagram, investor, 5W1H, and proof generation become one structured AI response per signal.
2. HubSpot result-note creation becomes the single routine external proof write.
3. Routine HubSpot success tasks are removed; tasks are failure-only or founder-requested follow-ups.
4. Buffer runs only after approval and starts with LinkedIn rather than spending one task per channel.
5. Founder Control Room proof is read from the canonical ledger instead of receiving a duplicate Zapier write for every signal.
6. Source normalization, counters, idempotency, routing, backlog, and digests use free Zapier control-plane steps.

## Budget gate

Before every billable action:

1. Read the current month from the free budget table.
2. Confirm the idempotency key has not already completed the requested action.
3. Calculate the projected task count after the action.
4. Continue only when the projected count is at or below `90`.
5. At `91+`, write the request to the free backlog table and stop before the billable action.
6. The final 10 tasks remain emergency reserve and require an explicit founder-approved override.

## Rollout order

1. Build the free intake queue and task-budget table.
2. Point the existing HubSpot-to-Claude review loop at the shared core processor.
3. Verify one controlled request produces one AI task and one same-deal HubSpot result task.
4. Add the LinkedIn approval path and verify it spends no Buffer task without approval.
5. Add the investor approval path and verify one approved recipient equals one email task.
6. Add the failure Zap and force one safe test failure.
7. Inspect Zap History and reconcile the live account against this budget before disabling any superseded Zap.

## Proof required before calling the reduction live

```text
Zap names and IDs
before/after task forecast
one successful core run
one blocked unapproved social run
one approved LinkedIn draft run
one blocked unapproved investor send
one approved investor test recipient run
one forced failure run
Zap History billable-task totals
HubSpot same-deal result and failure records
Buffer returned item artifact
budget table counter and overflow behavior
```

## Risk

- A live Zap may contain hidden premium or billable actions not represented in repository docs.
- AI, Code, SDK, MCP, and app actions may consume more than the simple one-action estimate depending on the configured product and runtime.
- Polling volume and incoming trigger volume can cause platform limits even when Filters later stop billable actions.
- The task reduction is not active until the real Zapier workflows are inspected and repaired through a connected Zapier control surface.

## Rollback

Disable only the new consolidated Zaps and restore the prior named Zaps. Preserve Zap History, HubSpot notes/tasks, Buffer drafts, Zapier Table rows, and Founder Control Room evidence. Do not delete prior workflows or records.

## Stop condition

Stop new routine billable work at the 90-task operating ceiling. Queue overflow for review or the next billing month. Do not silently exceed the free plan, broaden publication authority, or delete existing automation to manufacture a lower count.
