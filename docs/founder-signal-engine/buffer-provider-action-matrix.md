# Buffer Provider Action Matrix

Status: `DRAFT_ONLY_CONTRACT`

Machine-readable authority: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Deterministic verification: `npm run verify:buffer-provider`

## Canonical rule

For the Zapier Buffer action:

```text
action: buffer_add_to_queue
method: draft # required; never rely on Buffer default
```

For the Buffer GraphQL API:

```text
mutation: createPost
saveToDraft: true # required
```

No other Buffer method is authorized for the first draft-only milestone. The contract rejects `queue`, `schedule`, `share_next`, `share_now`, and `schedule_draft`, even when a provider may describe one of those values as draft-adjacent. Strictness is intentional until a later evidence-backed contract loosens it.

## Why this is load-bearing

Buffer distinguishes drafts from scheduled posts through an explicit draft-safe value. A policy field such as `publish_allowed: false` does not configure the provider action by itself. The provider mapping must also be pinned to `method: draft` for Zapier or `saveToDraft: true` for the API.

## Authority boundary

- Draft creation is the only authorized provider outcome.
- Queueing, scheduling, immediate sharing, and publishing remain blocked.
- Changing the required method needs a separate founder-approved contract change and exact-head verification.
- A successful Zapier or Buffer action is transport evidence, not publication proof.
- No live Zap, Buffer account, channel role, credential, or post is changed by this repository contract.

## Optional account-side defense

Buffer's Requires Approval role can force API, MCP, and third-party-created posts into approval drafts, but it is available through Buffer's Team collaboration features and the organization owner retains Full Posting access. Treat it as optional paid defense-in-depth requiring a separate restricted user. It is not a free-plan control and does not replace the explicit provider method.

## Promotion gate

Before any live provider test:

1. repository verification passes on the exact candidate head;
2. the live Zap maps `Method` to `Draft` explicitly;
3. the controlled test returns a genuine Buffer draft identifier;
4. Buffer shows the item in Drafts rather than Queue or Sent;
5. no publish, queue, or schedule receipt exists;
6. the founder separately approves any later widening of authority.

## Rollback

Revert the focused provider-contract change. No provider cleanup is required because this contract does not mutate Buffer or Zapier.
