# Day 3 Buffer Content Boundary

Status: `IMPLEMENTED_IN_REPO_AWAITING_LIVE_ZAP_MAPPING`

Authoritative configuration: [`config/zapier-task-budget.json`](../../config/zapier-task-budget.json)

Executable firewall: [`tools/zapier/buffer-content-firewall.cjs`](../../tools/zapier/buffer-content-firewall.cjs)

Verification: `npm run verify:zapier-budget`

## Reality

The Day 3 lane has transported prompt instructions into Buffer instead of the finished social post generated from those instructions.

That is a field-mapping failure, not a writing failure.

The prompt is private orchestration input. Buffer must receive only complete, platform-ready copy after the structured AI response has been parsed and validated.

## Founder-approved content shape

The desired output is the finished post package demonstrated by the PR #27 status copy:

- name the real change;
- distinguish verified evidence from unfinished work;
- avoid launch or product claims that the evidence does not support;
- include the relevant proof links;
- preserve Ray's direct founder voice;
- adapt the same proof package for each owned channel rather than copying one generic caption everywhere.

The three canonical first routes are:

| Owned channel | Structured AI output field | Audience job |
|---|---|---|
| Juss Rayy LinkedIn | `linkedin_draft` | Technical founder narrative, evidence, business lesson, partner or investor signal |
| Juss&Co Facebook | `facebook_founder_draft` | Founder confession, community context, what changed, what remains unfinished |
| Juss Beautiful Hair Facebook | `facebook_brand_draft` | Customer-facing brand update, clear promises, preview status, customer question |

`facebook_draft` remains available for backward compatibility and general Facebook review copy, but it is not the canonical source for either named Facebook page.

## Required structured AI response

The shared AI action must return one valid JSON object with the existing evidence, ME, FutureYou, and campaign fields plus these distinct finished-copy fields:

```json
{
  "verified_evidence": [],
  "inferred_conclusions": [],
  "unknown_information": [],
  "missing_evidence": [],
  "linkedin_draft": "complete LinkedIn post",
  "facebook_founder_draft": "complete Juss&Co Facebook post",
  "facebook_brand_draft": "complete Juss Beautiful Hair Facebook post",
  "instagram_draft": "complete Instagram caption",
  "publish_allowed": false
}
```

The response must not wrap JSON in Markdown or place commentary outside the object.

## Zap step order

```text
verified source signal
-> one structured AI action
-> parse JSON fields
-> select the exact channel-specific draft field
-> Buffer content firewall
-> Buffer draft, queue, or publish action
-> retain Buffer and platform receipts
```

Do not send the raw AI response directly to Buffer. Do not map the prompt, system instruction, user message, source note, raw response, or GitHub evidence field into Buffer's post text.

## Firewall input mapping

Add **Code by Zapier** immediately before each Buffer action and paste the contents of:

```text
tools/zapier/buffer-content-firewall.cjs
```

Map these inputs:

| Code input | Source |
|---|---|
| `post_text` | The selected platform output, such as `linkedin_draft` |
| `content_field` | Literal name of that selected output field |
| `channel` | Stable owned-channel identifier |
| `destination_mode` | `draft`, `queue`, or `publish` |
| `publish_allowed` | Parsed AI/approval-lane value |
| `founder_approval_id` | Exact founder approval receipt when queueing or publishing |
| `proof_url` | Exact PR, commit, issue, deployment, screenshot, or demo proof URL |
| `source_commit_sha` | Exact 40-character source commit SHA |

The Code step returns:

```text
validated_post_text
content_validated
content_field
channel
destination_mode
proof_url
source_commit_sha
founder_approval_id
```

## Buffer mapping

Buffer's **Post Text** field must map only to:

```text
validated_post_text
```

The following sources are forbidden:

```text
prompt
system_prompt
user_prompt
user_message
instructions
raw_response
input
github_evidence
```

The firewall also rejects prompt-like phrases, unresolved `{{template}}` tokens, missing proof, missing exact commit SHA, undersized copy, and unauthorized queue/publish requests.

## Draft versus publication authority

- `draft` may be used while `publish_allowed` is false so the founder can review the finished copy.
- `queue` and `publish` require both `publish_allowed: true` and a non-empty exact `founder_approval_id`.
- A successful Zapier or Buffer transport event does not prove publication.
- Publication proof requires the real platform post/activity ID or permalink receipt.

## Focused acceptance test

Use a controlled signal with the same evidence shape as the Juss Beautiful Hair PR #27 example.

The test passes only when:

1. the structured output contains complete LinkedIn, founder-Facebook, and brand-Facebook posts;
2. each post accurately distinguishes verified work from unfinished work;
3. the prompt text and template variables are absent from all three posts;
4. each channel selects its dedicated output field;
5. the firewall returns `content_validated: true`;
6. Buffer receives `validated_post_text`, not the prompt or raw response;
7. draft mode produces real Buffer draft identifiers;
8. queue or publish mode remains blocked without an exact founder approval receipt;
9. any published run retains a real LinkedIn or Facebook receipt;
10. Founder Control Room correlates the source SHA, Zapier run ID, Buffer artifact, platform receipt, policy decision, and timestamp.

## Proof currently available

Repository verification proves the content firewall behavior through:

```bash
npm run verify:zapier-budget
```

The test suite accepts finished posts modeled on the PR #27 copy and rejects:

- prompt instructions;
- unresolved template tokens;
- forbidden input fields;
- unauthorized queue or publish attempts.

This repository proof does not claim that the live Zap has already been remapped or that Buffer has created a new draft. Those remain external Day 3 gates.

## Rollback

Revert the configuration, verifier, firewall, test, package script, and this document together. Do not delete existing Buffer drafts, sent posts, Zap History, HubSpot evidence, or platform receipts.

## Stop condition

Day 3 remains open until the live Zap maps a channel-specific finished draft through the firewall into Buffer and returns genuine Buffer plus platform receipts. A run that posts instructions or a prompt is a failed run even when every transport step reports success.
