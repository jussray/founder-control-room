# Day 3 Buffer Content Boundary

Status: `EXECUTABLE_DRAFT_GUARD_IMPLEMENTED_AWAITING_LIVE_ZAP_MAPPING`

Authoritative budget: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

Machine-readable provider contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable firewall: [`tools/zapier/buffer-content-firewall.cjs`](../../tools/zapier/buffer-content-firewall.cjs)

Verification:

```bash
npm run verify:buffer-content
```

## Reality

The original failure was a field-mapping failure: prompt instructions could reach Buffer instead of finished platform copy. A second provider-level gap also existed: review-only policy did not itself set Buffer's `Method` field.

The executable firewall now handles both boundaries. It accepts only finished, proof-linked platform copy and emits only draft-safe Buffer fields.

## Executable output contract

A valid firewall result includes:

```text
validated_post_text
content_validated: true
content_field
channel
destination_mode: draft
publish_allowed: false
proof_url
source_commit_sha
founder_approval_id: null
buffer_action: buffer_add_to_queue
buffer_method: draft
buffer_save_to_draft: true
```

Caller-supplied values such as `share_now`, `queue`, `publish`, or `saveToDraft: false` cannot widen this output. The firewall owns the provider fields.

## Required Zap order

```text
verified source signal
-> one structured AI action
-> parse channel-specific finished copy
-> Code by Zapier using buffer-content-firewall.cjs
-> map Buffer Post Text from validated_post_text
-> map Buffer Method from buffer_method
-> create Buffer draft
-> retain the real Buffer draft identifier
```

Do not map the raw AI response, prompt, system instruction, user message, source note, or GitHub evidence field into Buffer's post text.

## Code by Zapier inputs

| Code input | Source |
|---|---|
| `post_text` | Selected platform output such as `linkedin_draft` |
| `content_field` | Literal approved output-field name |
| `channel` | Stable owned-channel identifier |
| `destination_mode` | Literal `draft` |
| `publish_allowed` | Literal `false` |
| `proof_url` | Exact public proof URL |
| `source_commit_sha` | Exact 40-character source commit SHA |

The current draft-only milestone rejects `queue`, `publish`, `schedule`, `share_now`, `share_next`, and `schedule_draft`, even when approval-looking input is supplied.

## Buffer field mapping

| Buffer field | Firewall output |
|---|---|
| Post Text | `validated_post_text` |
| Method | `buffer_method` |

The expected provider output is always:

```text
buffer_action: buffer_add_to_queue
buffer_method: draft
buffer_save_to_draft: true
```

## Acceptance test

The test passes only when:

1. finished copy passes content validation;
2. prompt-like text and forbidden source fields fail;
3. exact proof URL and commit SHA are present;
4. the Node and Zapier-like runtimes both emit `buffer_method: draft`;
5. the API-safe equivalent is `buffer_save_to_draft: true`;
6. every queue, scheduling, immediate-share, or publish attempt fails closed;
7. caller overrides cannot replace the safe provider output;
8. the live controlled run later returns a genuine Buffer draft ID;
9. no Queue, Sent, scheduled, or public permalink evidence exists.

## Proof boundary

Repository tests prove the executable mapping and rejection behavior. They do not prove that the live Zap has been remapped or that Buffer created a draft.

Requires Approval can be additional account-side protection only when the relevant paid collaboration plan and a separate restricted user are actually configured. It is not relied on by this code contract.

## Rollback

Revert the firewall, focused tests, provider configuration, package commands, workflow, and this documentation update together. Do not delete historical Buffer drafts, sent posts, Zap History, HubSpot evidence, or platform receipts.

## Stop condition

Day 3 remains open until a controlled synthetic run maps the firewall-owned `buffer_method` into Buffer and returns a genuine draft identifier without Queue, Sent, schedule, or public-post evidence.
