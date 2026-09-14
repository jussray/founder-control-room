# Day 3 Buffer Content Boundary

Status: `DRAFT_ONLY_SOURCE_ENFORCED__AWAITING_LIVE_BUFFER_DRAFTS_PROOF`

Authoritative machine contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable firewall: [`tools/zapier/buffer-content-firewall.cjs`](../../tools/zapier/buffer-content-firewall.cjs)

Verification:

```bash
npm run verify:buffer-content
node scripts/verify-zapier-task-budget.mjs
```

## Current truth

The active first milestone is **review-only Buffer draft handoff**.

Current source enforcement requires:

```text
provider action: buffer_add_to_queue
method: draft
saveToDraft: true
publish_allowed: false
destination_mode: draft
scheduled_at: null
review_deadline: null
share_now_allowed: false
```

The provider method must be explicit. Missing or unexpected provider modes do not inherit Buffer defaults. Queue, schedule, share-next, share-now, schedule-draft, publish, and unknown future method values fail closed at the checked-in provider boundary.

This source contract does **not** prove the connected Zap currently uses the exact mapping, that Buffer accepted a draft, or that any live provider write occurred. Live readiness remains non-live until exact provider readback is retained and correlated to the deployed source identity.

## Required operating order

```text
verified source signal
-> public-safe finished copy
-> exact founder/content authority required by the active caller
-> content firewall
-> explicit Buffer draft provider request
-> Buffer Drafts readback
-> retain provider receipt / draft identity
-> human review in Buffer
-> stop
```

No automatic schedule or publication follows from the draft handoff.

A later publish or scheduling milestone requires a separately activated authority contract and fresh provider proof. Historical scheduling code, tests, or Attack Ten evidence may remain in the repository as deferred safety work, but they do not authorize or activate scheduled/public publication.

## Live proof gate

Repository tests can prove the source boundary, including:

- only explicit `method: draft` is accepted for the current provider handoff;
- `saveToDraft` is true;
- `publish_allowed` is false;
- provider fire time is absent;
- share-now remains denied;
- caller-supplied scheduling/immediate-publication values cannot override the draft-only output;
- exact source/proof and authorization correlation required by the caller remains fail-closed.

Repository proof does **not** prove:

- live Zapier plan or action-schema capability;
- installed provider secrets or automation grants;
- live Zap mapping;
- a real Buffer Draft was created;
- Buffer Drafts readback or provider receipt identity;
- LinkedIn or any other public-platform publication;
- final external outcome correlation.

A controlled live probe is successful only when the external provider readback proves the resulting object is a **draft**, not queued, scheduled, shared, or published.

## Historical scheduling contract

The repository previously developed a 20-minute scheduled-publication review-window design with Gmail review ingress and Attack Ten evidence. That material is historical/deferred safety work now.

It must not compete with current authority. In particular, these former active values are **superseded for the current milestone**:

```text
publish_allowed: true
destination_mode: schedule
method: schedule
saveToDraft: false
scheduled_at: generated_at + 20 minutes
no reply -> publish by existing Buffer schedule
```

Do not use historical green receipts for that scheduled design as evidence that current draft-only live delivery works.

## Budget boundary

Planning/task-budget artifacts are capacity evidence only. They do not authorize provider mutation and do not prove the connected Zapier subscription, Buffer mapping, or provider outcome.

## Secret boundary

No raw secret belongs in GitHub, chat, captions, screenshots, browser bundles, or evidence artifacts.

Provider credentials remain configuration facts. Their presence is not proof of a successful live draft write.

## Rollback

1. Disable the affected provider automation/grant if a live probe exposes unsafe behavior.
2. Remove only identified controlled test artifacts when a provider ID exists.
3. Revert the draft-only source slice if the checked-in contract itself is defective.
4. Preserve provider history and receipts for diagnosis.
5. Do not fall back to schedule/share-now behavior to manufacture a green result.

## Stop condition

The source phase is complete when exact-head repository checks pass with the draft-only invariant intact.

The live provider phase is complete only when a controlled exact-source probe returns provider readback proving the object landed in Buffer Drafts and no schedule/publication side effect occurred. Until then, live Buffer draft delivery remains `UNKNOWN` / `AWAITING_PROOF`.
