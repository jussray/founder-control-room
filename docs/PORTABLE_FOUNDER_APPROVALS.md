# Portable Founder Approvals

## Decision

Juss may give founder direction and approval through approved conversational consoles, including ChatGPT, Claude, Perplexity, and Founder Control Room itself.

The console is not the permanent source of truth. Founder Control Room remains the governing ledger that validates, records, scopes, consumes, and audits the decision.

```text
Juss decides in an approved console
→ trusted adapter authenticates the founder and captures the exact decision
→ Founder Control Room validates a portable approval packet
→ packet is bound to exact content, action, target, branch, and SHA
→ separately gated executor consumes it once
→ immutable decision and execution receipts remain in Founder Control Room
```

This contract removes manual-only approval bottlenecks without turning model output, copied chat text, or a provider session into unlimited authority.

## Ask-Founder broker boundary

The `/mcp/founder-permissions` Ask-Founder broker is an interim decision-capture boundary, not a substitute for the portable approval packet above.

- Bearer-authenticated agents may create an exact pending request, but a decision write requires an independently authenticated current `fcr_session` browser identity plus a browser `Origin` already accepted by the global `FOUNDER_ALLOWED_ORIGINS` CORS boundary.
- `requestedBySurface` records where the request came from. It is audit metadata only and cannot authenticate the founder or name the authoritative decision surface.
- Until a registered console adapter supplies the attestation required by this document, the authoritative broker decision surface is derived server-side as `fcr`. A caller cannot label an FCR-browser decision as `chatgpt`, `claude`, or `perplexity`.
- A merge request must bind the exact owned repository, pull-request number, base SHA, and head SHA. The target is included in the request hash and the proposal `expectedHeadSha` must equal the target head.
- A recorded broker decision is deliberately non-authorizing: its decision record carries `executionAuthorized: false`. Exact action authority is still issued by the separately scoped FounderPermissionReceipt / execution-binding layer.
- Approved broker rows receive a bounded 20-minute decision window. Expired, revoked, or already-consumed rows do not satisfy founder permission.
- Consumption is an atomic one-time ledger transition bound to both the exact request hash and exact decision hash. Consuming a broker decision does not itself perform the external action.
- Founder revocation is a separate interactive transition from an approved browser origin. Revoked decisions cannot become satisfiable again.
- Founder permission and Independent Review remain separate gates. Neither one implies the other.

This distinction is load-bearing: the Ask-Founder broker records a current founder decision; it does not let a model, bearer token, browser cookie, or stored `approved` row manufacture reusable execution authority.

## Approved source consoles

Initial source-console identifiers:

- `chatgpt`
- `claude`
- `perplexity`
- `founder-control-room`

Adding another console requires an explicit founder decision and a registered adapter contract. A source console may carry Juss’s decision. It may not invent one.

## Portable approval packet v1

```json
{
  "version": "portable-founder-approval-v1",
  "decisionId": "fap_01JUSS...",
  "founderId": "founder-user-uuid",
  "decision": "approve",
  "sourceConsole": "chatgpt",
  "sourceConversationRef": "provider-stable-conversation-or-message-ref",
  "sourceAdapterRef": "registered-adapter-version-ref",
  "scope": {
    "action": "merge",
    "target": "jussray/founder-control-room",
    "branch": "codex/mirror-engine-api-20260730",
    "expectedCommitSha": "40-character-git-sha",
    "contentHash": "sha256:hex",
    "missionId": "mission-uuid-or-null",
    "commandId": "allowlisted-command-id-or-null",
    "environment": "repository-only"
  },
  "constraints": [
    "required checks must pass on expectedCommitSha",
    "no deployment",
    "no credential changes"
  ],
  "issuedAt": "2026-07-30T23:00:00.000Z",
  "expiresAt": "2026-07-31T00:00:00.000Z",
  "oneTime": true,
  "founderNote": "Approved from ChatGPT after review.",
  "attestation": {
    "type": "registered-adapter-signature",
    "keyId": "adapter-key-version-ref",
    "signature": "base64url-signature"
  }
}
```

## Required fields and meaning

- `decisionId`: globally unique idempotency identifier.
- `founderId`: authenticated founder identity, never inferred from writing style or model context.
- `decision`: `approve` or `deny`.
- `sourceConsole`: approved console identifier.
- `sourceConversationRef`: stable provider-side reference sufficient for audit and dispute review without storing the whole private conversation.
- `sourceAdapterRef`: exact registered adapter and version that authenticated and transformed the decision.
- `scope.action`: one action only, such as `run_command`, `apply_patch`, `merge`, `publish`, or `send`.
- `scope.target`: exact repository, provider object, draft, record, or other target.
- `scope.branch` and `scope.expectedCommitSha`: required for repository-changing actions.
- `scope.contentHash`: required for content, patch, message, publication, and other payload-sensitive actions.
- `scope.missionId`: required when the action belongs to a Founder Control Room mission.
- `scope.commandId`: required for Command Bridge execution.
- `constraints`: explicit retained boundaries. Missing authority is never implied.
- `issuedAt` and `expiresAt`: short-lived validity window.
- `oneTime`: must be `true` for mutation authority.
- `attestation`: verifiable adapter signature or equivalent trusted receipt.

## Validation rules

Founder Control Room must reject a packet when:

- the founder identity is absent, invalid, expired, or not allowlisted;
- the source console or adapter version is not registered;
- the signature or trusted provider receipt cannot be verified;
- the decision packet was copied as plain chat text without a trusted adapter attestation;
- the action, target, content hash, branch, commit SHA, mission, command, or environment differs from the proposed execution;
- the expected commit is not the current immutable head at execution time;
- the packet expired, was already consumed, was denied, or has a duplicate decision ID;
- required proof gates, checks, Playwright evidence, or release evidence are missing;
- a separately gated action such as deployment, credentials, billing, DNS, auth, RLS, deletion, or external communication is not explicitly in scope;
- the decision or execution audit cannot be persisted.

A valid founder decision authorizes only its exact scope. It does not make evidence green, fix a stale SHA, or carry into a different action.

## ChatGPT and Claude behavior

ChatGPT and Claude may:

- present the exact proposed action and evidence to Juss;
- capture Juss’s approve or deny decision through a registered authenticated adapter;
- transmit the resulting packet to Founder Control Room;
- request execution through the existing Approval Engine or Command Bridge;
- report the immutable decision and execution receipts.

They may not:

- self-approve based on their own recommendation;
- forge `founderId`, conversation references, hashes, signatures, or provider receipts;
- treat “continue,” a prior broad approval, or model memory as authorization for unrelated scope;
- turn a merge approval into deployment, publication, deletion, credential, or billing authority;
- bypass exact-head, evidence, rollback, idempotency, or audit requirements.

## Merge authority

The standing evidence-based merge decision in `docs/FOUNDER_MERGE_AUTHORITY.md` remains valid. Portable approval packets add a provider-independent way for Juss to give a new exact decision when a repository or mission requires one. They do not re-lock merge authority to a manual Founder Control Room screen.

A repository merge may proceed when either:

1. standing Founder Merge Authority applies and every listed evidence condition is satisfied; or
2. a valid exact-scope portable approval packet authorizes the merge and every evidence condition is satisfied.

Evidence is the lock. The approved conversational console is a command surface.

## Command Bridge integration

Command Bridge should store these additional references when a portable packet is used:

- `approval_decision_id`
- `approval_source_console`
- `approval_source_conversation_ref`
- `approval_source_adapter_ref`
- `approval_content_hash`
- `approval_expected_commit_sha`
- `approval_expires_at`
- `approval_consumed_at`
- `approval_attestation_key_id`

The executable payload still comes from the allowlisted terminal registry. The approval packet never carries raw shell strings, executables, environment variables, credentials, or unrestricted provider calls.

## Neura Relay and registry readiness

Neura Relay may review a proposed action and return a Decision Receipt. Its receipt is evidence about the reviewed policy path, not a substitute for Juss’s decision.

Before Neura can serve as a required approval validator, the participating console agent and capability version must be registered and resolvable. A `participant_not_found` or `capability_version_not_found` result is an integration blocker, not evidence that Juss lacks authority.

Until registration is complete:

- preserve the Neura receipt and trace reference;
- do not claim Neura approved the action;
- use direct authenticated founder authority plus existing repository gates for reversible branch work;
- do not use the missing registry entry to bypass separate merge, deploy, credential, publication, or destructive gates.

## Audit and privacy

Store the minimum decision evidence needed for authority and dispute resolution. Prefer hashes and stable references over entire private conversations.

Never place raw API keys, session tokens, private teen content, journals, voice recordings, family addresses, legal records, or unrelated conversation history inside approval packets, GitHub comments, public logs, or provider-visible metadata.

## Rollback

A consumed decision cannot be erased from history. Rollback creates a new auditable action that reverses the affected system state when possible.

For an unmerged repository patch, rollback is a revert commit or branch abandonment. Branch deletion remains a separate explicit deletion decision.
