# Canonical Founder Action Authority

## Status

This document describes the staged bootstrap contract for synchronizing an explicit founder decision into an exact merge or production-deploy authority receipt. It does not itself grant authority and it does not activate a provider mutation.

The existing Ask-Founder broker remains the durable decision layer. A row in `founder_permission_requests` may prove that the founder explicitly approved an exact proposal, but that row deliberately carries no execution authority. External operators must never translate copied chat text, a PR comment, a provider session, `merge_authority: true`, or a syntactically valid approval identifier into permission to mutate a provider.

## Canonical chain

```text
approved conversational console
  -> authenticated FCR Ask-Founder request
  -> interactive FCR founder decision
  -> founder_permission_requests decision evidence
  -> interactive issue of founder_authority_receipts
  -> exact action receipt reread
  -> atomic reservation for one execution key
  -> separately gated external mutation
  -> execution / provider / verification receipts
```

The console is a decision surface, not the canonical ledger. The canonical action receipt lives in FCR/Supabase. D1, Cloudflare Workflow state, GitHub status, and provider logs remain evidence or orchestration state and cannot substitute for the receipt.

## Exact scope

`founder_authority_receipts` supports two initial authority shapes:

- `merge`: exact owned repository, pull-request number, base SHA, and head SHA.
- `deploy`: exact `jussray/founder-control-room` head SHA and `production` environment.

A receipt is short-lived, revocable, one-action scoped, and service-role protected. An action with different repository identity, PR number, base SHA, head SHA, action type, or environment must fail closed.

## Issuance

`POST /mcp/founder-authority-receipts/:requestId/issue` requires the current interactive founder session and an accepted browser Origin. Issuance rereads the stored broker request and decision, reconstructs the canonical request identity including its note, confirms the current founder identity matches the stored decision identity, and derives a deterministic action-receipt identity.

A bearer-only agent cannot issue the receipt. The broker decision remains `executionAuthorized: false`; only the separately issued exact action receipt reports execution authority for its own bounded scope.

## Verification

`GET /mcp/founder-authority-receipts/verify` is a read-only exact-scope verifier intended for repository and provider gates. The caller must supply the public action identity it is trying to verify. The response exposes only bounded action metadata such as receipt id, action type, repository, PR/base/head identity, environment, status, and expiry.

The verification surface must never disclose founder email, founder user id, request hash, decision hash, raw conversation content, session state, or provider credentials.

## Reservation

`reserve_founder_authority_receipt(...)` is service-role-only and performs an exact-scope reread under a row lock before reservation. A different execution key cannot reuse a reserved receipt. Reservation is the local idempotency boundary before an effectful provider mutation.

A read-only verification response is not equivalent to reservation. Provider execution must not be described as one-time or fully consumed until the executor is wired to the reservation/consumption path.

## Bootstrap order

This authority plane cannot become a required merge/deploy gate in the same change that creates its database table and live verification endpoint, because the gate would depend on provider state that cannot exist until the bootstrap is merged and deployed.

The safe rollout is therefore two-phase:

1. **Phase A: install and prove the authority substrate.** Merge the migration, issuance route, exact-scope verifier, tests, and this contract using the repository's currently valid exact-candidate founder approval path. Apply the migration and deploy the API only under a separate production-deploy approval.
2. **Phase B: enforce the new authority substrate.** After live readback proves the table and endpoint, make `Required Gate`, PR continuity, canonical deploy, and Worker reconcile reread the exact canonical receipt and reserve it where the executor has mutation authority.

No bootstrap exception, environment flag, remembered chat approval, or permanent fallback should survive into Phase B.

## GitHub and Cloudflare bypass risk

Repository ruleset enforcement and FCR action authority are separate controls. A GitHub ruleset bypass actor or provider integration can bypass GitHub-side required checks. Code in this repository cannot remove an account-level or repository-level provider bypass actor unless the provider administration API is explicitly available and separately authorized.

Therefore Phase B must treat the current GitHub ruleset bypass list as an external configuration risk and must not claim that `Required Gate` alone blocks every integration. Cloudflare native Git integration must remain non-promoting, and production promotion must remain behind an FCR canonical deploy receipt plus the guarded manual workflow.

## Non-authority statements

The following are never sufficient authority by themselves:

```text
chat message
PR body
PR comment
merge_authority: true
successful CI
successful Playwright
Cloudflare "Deployment successful" UI text
D1 command claim
Workflow step completion
R2 evidence object
provider reference
```

They may contribute evidence. They cannot replace the separately authenticated founder decision and exact FCR action receipt.
