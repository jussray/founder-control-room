# ChatGPT Operator Workflow

Last reviewed: 2026-08-30

## Purpose

ChatGPT may operate as a Founder Control Room external console for evidence gathering, continuity, proposal construction, and explicit founder-decision relay. The pre-decision workflow is intentionally non-authorizing.

Base44 may run in parallel as a connector/evidence surface. A Base44 connector record, OAuth grant, cache row, fingerprint, or callback success is evidence only and is not a Founder Control Decision.

## Parallel workflow

```text
ChatGPT read path -------------------------------\
                                                  -> exact evidence binding
Base44 connector / cache evidence ---------------/          |
                                                             v
                                                operator continuity receipt
                                                             |
                                                             v
                                                     exact proposal
                                                             |
                                                             v
                                                    Ask-Founder request
                                                             |
                                      explicit authenticated founder decision
                                                             |
                                                             v
                                             bounded execution envelope
                                                             |
                                                             v
                                              receipt + re-verification
```

ChatGPT may also use other approved read providers to acquire current source/provider evidence. The provider does not become the authority merely because it supplied the observation.

## Operator continuity contract

`src/lib/operatorContinuity.ts` defines `juss-v10/operator-continuity@v1` for pre-decision evidence from:

- `chatgpt`
- `base44`
- `manus`

Each receipt binds:

- exact project slug;
- exact `owner/repository` identity;
- full observed Git SHA;
- bounded evidence references;
- observation and expiry timestamps;
- optional predecessor fingerprint; and
- whether runtime proof was separately observed.

The receipt always fixes these authority values:

```text
browserCookie = false
authorizing = false
standingMergeAuthority = false
approvalCarryForward = false
founderDecisionRequired = true
```

Changing the exact SHA, evidence set, source, lifetime, runtime-proof state, or predecessor changes the deterministic SHA-256 continuity fingerprint.

## ChatGPT authority boundary

`chatgpt` is already a supported `FounderControlSurface`, but that means only an explicit founder decision may be relayed through `FounderControlDecision` after an exact proposal exists.

The following do not count as founder approval:

- ChatGPT analysis or recommendation;
- a tool result;
- a GitHub App installation;
- a Base44 OAuth connection;
- a Base44 `ConnectorContinuity` or `FcrTruthCache` row;
- a continuity fingerprint;
- a proof cookie or browser session cookie;
- a passing test, CI check, deployment response, or Playwright screenshot by itself.

No silence, inferred intent, prior approval, stale conversation state, connector status, or continuity predecessor may be promoted into a new founder decision.

## Cookie boundary

Operator continuity is non-cookie audit metadata. It must never be emitted with `Set-Cookie` or written into browser cookie storage.

The real founder browser capability remains the same-origin HttpOnly `__Host-fcr_session` contract. That browser capability authenticates a current FCR session only; it does not itself supply Founder Final, merge, deploy, provider, database, billing, publication, deletion, or credential authority.

## Runtime and Playwright proof

For UI/runtime changes, Playwright evidence is required before the operator workflow may describe the changed runtime path as verified. A continuity receipt may record `runtimeVerified=true` only after separate runtime/browser proof exists, and even then the receipt remains non-authorizing.

Source truth, CI truth, provider truth, deployment truth, runtime truth, browser truth, founder authority, and final outcome truth remain separate planes.

## Fail-closed rules

The operator workflow must stop or reacquire evidence when:

- repository, target branch, PR, base, head, or relevant diff moved;
- the continuity lease expired;
- required evidence is missing or contradictory;
- the requested action differs from the founder-approved proposal;
- the decision surface cannot prove an explicit authenticated founder decision;
- runtime/browser proof is required but absent; or
- a provider/connector asks for broader authority than the current task needs.

A fresh observation creates a new fingerprint. It does not renew an old approval.


## Chat ↔ Work task continuation (repository contract only)

The existing `juss-v10/operator-continuity@v2` receipt recognizes both `chatgpt` and
`work` sources. Its state fingerprint deliberately excludes the observing
surface so the same project evidence can be checked across modes. The additive
`juss-v10/operator-execution-continuation@v1` contract in
`src/lib/operatorContinuity.ts` links that receipt to an active task:

- `taskId` and `intentRef` identify the ongoing goal without embedding raw chat;
- `contextRefs` point to previously authorized, access-controlled conversation
  history and artifacts;
- `completedSteps` require evidence references, while `remainingStepIds`,
  `nextActionRef`, and `pendingDecisionRefs` retain the unfinished execution path;
- the packet fingerprint is mode-independent and does not grant action,
  approval, cookie, merge, or deployment authority;
- a fresh matching observation yields `CURRENT`, while moved or expired
  evidence yields `REVALIDATE` without erasing the conversational context;
- Chat is **not** treated as read-only. Tools are determined by the actual
  current surface, connection, and separate action authority, not by mode name.

The source references must resolve in an existing authorized persistence
service. The candidate founder-authenticated API provides:

- `POST /operator/continuity` with `{ "continuation": <validated packet> }`;
- `GET /operator/continuity?projectSlug=...&repositoryFullName=...&limit=10` for
  bounded founder-only task discovery, returning reference-only metadata;
- `GET /operator/continuity/:taskId?projectSlug=...&repositoryFullName=...`;
- server-only storage in existing `public.continuity_records`, using a
  reviewed additive migration for `task_id`, `execution_state`, and
  `checkpoint_observed_at`; concurrent same-time versions are unique and stale
  writes return HTTP 409 without replacing newer work;
- responses explicitly marked `PERSISTED_NOT_REVALIDATED` and
  `currentEvidenceVerified: false`; no replayed approval or execution permit;
- strict founder authentication, existing same-origin browser CSRF rules,
  project/repository binding, reference-only canonicalization, and readback.

Task checkpoints are excluded from the legacy project-shell and Truth Console
proof views. The unverified checkpoint does not extend `valid_until`.

The integration still does **not** listen for native ChatGPT mode changes, fetch
private ChatGPT/Work transcripts, or make unapproved provider actions. Clients
must explicitly send and retrieve authorized task-reference packets through the
API. An approved storage migration, review, deployment and live authentication
readback are required before any production claim.

Execution, provider writes, CI, Playwright, approval and release still pass
through their ordinary independent gates. An expired snapshot can preserve
discussion momentum but cannot resurrect an expired approval or green check.

Repeatable local Playwright proof: `npm run verify:operator-continuation-auth`.
It runs two Chromium checks: anonymous requests must fail closed on the real FCR
Express server, and an isolated synthetic Supabase Auth/PostgREST fixture must
pass founder-bound save, list, read, duplicate, stale-write, and non-founder
rejection through the real HTTP client. The synthetic fixture uses no real
accounts, production database writes, Cloudflare preview or browser login.
Passing it is not real founder authentication, live persistence, native ChatGPT
mode-switch integration, deployment evidence, or production approval.
