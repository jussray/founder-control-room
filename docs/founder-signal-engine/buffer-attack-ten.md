# Buffer Publication Attack Ten

Status: `SOURCE_CONTRACT_IMPLEMENTED__AWAITING_CONTROLLED_LIVE_PROVIDER_AND_INGRESS_PROOF`

This is the adversarial release contract for consequential social publication through Founder Control Room. It does **not** claim that Buffer, LinkedIn, Cloudflare ingress, or runtime publication is currently proven.

Machine-readable provider contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable Attack Ten evaluator: [`tools/zapier/buffer-attack-ten.cjs`](../../tools/zapier/buffer-attack-ten.cjs)

Adversarial source tests: [`tools/zapier/test-buffer-attack-ten.cjs`](../../tools/zapier/test-buffer-attack-ten.cjs)

## Release invariant

A provider `200`, a Buffer schedule, or a provider acknowledgement is not a verified publication.

Only one exact publication run may reach:

```text
VERIFIED_PUBLISHED
```

and only after all ten assertions pass for the same publication run ID, canonical payload SHA-256, founder approval, authority scope, provider action, ingress evidence, provider readback, and runtime observation.

## Attack Ten

| ID | Assertion | Failure the contract must prevent |
| --- | --- | --- |
| A1 | Founder intent is explicit and immutable | Approved copy is substituted after approval |
| A2 | Authority is scoped, expiring, one-use, and non-transferable | Old or cross-channel authority is replayed |
| A3 | Review-window rules are enforced by the control plane | Provider or caller bypasses the 20-minute review policy |
| A4 | Content identity is frozen and integrity-bound | Approval, execution, readback, or runtime refers to different copy |
| A5 | Provider capability is live and policy-gated | Configured credentials or a mock are promoted into live capability |
| A6 | Execution is idempotent and receipt-correlated | Retry creates a duplicate or loses run/authority identity |
| A7 | Provider acknowledgement is independently read back | Submission success is treated as provider-state proof |
| A8 | Ingress is authenticated, deduplicated, and durable | Forged, delayed, or duplicate ingress changes state |
| A9 | Runtime outcome is observed | Provider success is treated as proof the public destination is correct |
| A10 | Failure, expiry, denial, and rollback remain visible and safe | Missing evidence or a red path silently resolves to green |

## Canonical state machine

```text
DRAFT
  -> FOUNDER_APPROVED
  -> REVIEW_WINDOW_OPEN
  -> REVIEW_WINDOW_MATURED
  -> AUTHORITY_MINTED
  -> PROVIDER_CAPABILITY_VERIFIED
  -> ACTION_SUBMITTED
  -> PROVIDER_ACKNOWLEDGED
  -> READBACK_CONFIRMED
  -> RUNTIME_OUTCOME_OBSERVED
  -> VERIFIED_PUBLISHED
```

Red and recoverable states remain explicit:

```text
DENIED
EXPIRED
REVOKED
FAILED
UNKNOWN
CORRELATION_FAILED
INGRESS_INVALID
DUPLICATE_BLOCKED
ROLLBACK_PENDING
ROLLED_BACK
```

The ledger is append-only and hash-chained. Current state is derived from history. A later event cannot overwrite an earlier event.

## Controlled synthetic run

Production publication remains blocked until one bounded synthetic run proves the valid path and these negative controls:

1. premature execution is denied;
2. expired authority is rejected;
3. authority nonce replay is blocked;
4. mismatched content hash is rejected.

The source test simulates those controls deterministically. That is **source proof only**. It is not provider proof.

The live synthetic run must retain:

```text
publication_run_id
canonical_payload_sha256
founder_approval_id
authority_id
authority_nonce
provider account + channel identity
deterministic idempotency key
provider action ID
authenticated/deduplicated/durable ingress event
provider readback post identity
runtime-observed post identity
hash-chained publication events
```

## Release gate

Production publication may be enabled only when the live proof shows:

```text
live provider mutation included
AND controlled synthetic run == VERIFIED_PUBLISHED
AND exact receipt correlation == true
AND ingress capability == VERIFIED
AND ingress authentication/signature proof == true
AND authority is active and unused
AND provider capability is live
AND current content hash == authorized content hash
AND runtime outcome is observed
```

Everything else is deny or explicit `UNKNOWN`.

## Current proof boundary

This branch may prove:

- deterministic Attack Ten evaluation;
- hash-chain tamper detection;
- state-transition validation;
- the four required negative controls;
- release denial when provider, ingress, correlation, or runtime evidence is missing;
- `VERIFIED_PUBLISHED` as the only state that may count toward Verified Leverage.

It does not prove:

- installed live Buffer credentials or scopes;
- the actual Buffer account/channel mapping;
- live Buffer mutation;
- live private ingress delivery;
- live ingress signature/origin proof;
- LinkedIn publication;
- public runtime rendering;
- production rollback.

Those remain separate provider/runtime evidence gates.

## Rollback

Close this branch or revert its source-only commit. No provider state is mutated by this contract.
