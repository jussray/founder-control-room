# ChatGPT OpenAI Developers Zapier Bridge

## Use this skill when

- ChatGPT must invoke or verify the Founder Signal Engine Zapier workflow.
- A native Zapier connector is not available in the active ChatGPT environment.
- The existing provider-held key reference `zapier-founder-signal-engine` is already established.
- Zapier's GitHub integration is available for repository metadata, but GitHub Actions runtime operations require another path.
- Another approved agent such as Claude may have direct Zapier access, while ChatGPT needs the OpenAI Developers fallback.

Read [`docs/founder-signal-engine/zapier-github-metadata-contract.md`](../../../docs/founder-signal-engine/zapier-github-metadata-contract.md) before using Zapier's GitHub app for diagnosis or repair.

## Canonical route

```text
ChatGPT
-> @OpenAI Developers / OpenAI Platform secure key reference
-> approved Founder Signal Engine Catch Hook, webhook, or named bridge target
-> Zapier
-> OpenAI 5W1H
-> Buffer
-> HubSpot
-> Founder Control Room
```

## Critical distinction

The raw API key is never a chat-visible control token. “Call the key” means invoke the provider-held key reference through an approved Zapier invocation path. The Catch Hook, webhook, or named bridge supplies workflow invocation. The key authenticates the OpenAI side.

A key reference without an approved invocation path cannot inspect Zap history, edit Zap steps, or prove a run. A bridge response without a Zapier run ID is not proof that Zapier executed.

Zapier's GitHub app is a read/write metadata layer, not the GitHub Actions workflow-runtime layer. A repository, file, branch, issue, pull-request, or comment receipt does not prove Actions jobs, logs, artifacts, checks, or reruns.

## L99 Founder-Ops operating card v2

```text
PUBLISH_ALLOWED = false
```

This card authorizes nothing. It makes evidence, freshness, target verification, rollback, and approval boundaries machine-readable so the same operating mistakes are not re-derived each run.

### Claim-status gate

Every operational claim must carry one of these states:

- `VERIFIED`: read from the authoritative layer during the current run, with the source, exact object, run ID, record ID, branch, or SHA retained.
- `INFERRED`: reasoned from verified evidence, with the reasoning named.
- `UNKNOWN`: the authoritative layer could not be read, returned an ambiguous result, or the current tool cannot reach that layer. State the reason.

A failed lookup is not proof of absence. A null, empty, timed-out, permission-denied, or structurally unsupported lookup is `UNKNOWN`, never `VERIFIED absence`. Do not report that a deal, PR, branch, file, deployment, migration, or record was deleted, moved, stale, or missing until an authoritative current-run read proves that conclusion.

When an important lookup returns null or empty:

1. retain the exact query, target, connector, and returned status;
2. verify that the tool can structurally read the requested evidence layer;
3. retry through the same authoritative reader only when the query or identifier was wrong;
4. otherwise switch to the reader for that layer;
5. keep the conclusion `UNKNOWN` until positive evidence proves absence.

### Tool-to-evidence-layer routing

Use the reader that owns the layer of truth. Equivalent authoritative connectors are allowed when the named capability is not exposed, but a weaker layer must not be promoted into proof.

| Layer of truth | Reliable reader | Do not infer from |
|---|---|---|
| Private repository files, PRs, and branches | Zapier GitHub `Get File Contents`, `Find Pull Request`, `Find Branch`, or an authenticated GitHub connector | unauthenticated web fetches, cached summaries, or branch-name memory |
| Applied database migrations, schema, and RLS drift | Supabase MCP `list_migrations`, `get_advisors`, or an equivalent authenticated Supabase reader | migration files in the repository alone |
| Live Cloudflare deployment and Worker state | Cloudflare MCP `workers_list`, `workers_get_worker`, or an equivalent authenticated Cloudflare reader | CI status alone |
| GitHub Actions jobs, logs, artifacts, and exact error text | authenticated GitHub Actions run page, Actions API, or an Actions-capable connector | Zapier's GitHub metadata actions |
| HubSpot deal or CRM state | HubSpot MCP `search_crm_objects` plus identifier-based readback when available | a single null search result |

When one tool structurally cannot reach a layer, switch tools. Do not convert the missing capability into a product-state conclusion.

### Blocker-to-workaround routing

| Blocker | Required route |
|---|---|
| Zapier cannot edit an existing GitHub file because the blob SHA is unavailable | use an authenticated GitHub contents/API path that reads the current blob SHA before update; do not overwrite blindly |
| Zapier cannot read GitHub Actions logs | use an authenticated Actions run page or Actions-capable connector; a Gmail failure notification is triage evidence only |
| Zapier resolves an issue, PR, comment, or record to the wrong target | pass the explicit numeric identifier and verify the returned `resolvedParams` plus a readback of the written object before trusting the write |
| HubSpot write returns `No approval received` | stop at the founder approval gate; the agent cannot self-approve |
| Required GitHub environment secret is unset | record the exact secret name and repository environment; founder-side configuration is required |

Surface the blocker and exact route. Do not fake progress around a founder-side gate or a wrong-tool boundary.

### Freshness and target-verification gates

Immediately before a conclusion, mutation, PR body, issue comment, or evidence record:

1. re-read the authoritative state;
2. pin the finding to an immutable run ID, record ID, commit SHA, deployment version, migration identifier, or equivalent exact object;
3. do not pin a mutable branch head when the run or event has its own SHA;
4. compare the fresh read with the evidence already collected and downgrade stale conclusions to `UNKNOWN` or `INFERRED` as appropriate.

Before trusting any write:

1. use an explicit target identifier;
2. inspect the returned `resolvedParams` or equivalent resolved target;
3. verify repository, object type, numeric ID, and branch or record association;
4. read the target back after the write;
5. report the write as `VERIFIED` only when the readback matches the requested target and content.

A successful connector response without target verification is not proof that the intended object changed.

### Write-authority ladder

- Reversible documentation-only changes, tracker issues, and evidence comments may move only when the current repository's standing authority already covers that exact action.
- Production deploys, database migrations, secret or credential changes, external sends, publication, and gated CRM writes require explicit approval for the exact change.
- Never merge, deploy, publish, send, delete, or mutate a gated path merely because this card or skill exists.
- A documentation merge must not silently carry a gated runtime, credential, data, or external-communication action.

### Required report shape

```text
REALITY:   what is VERIFIED right now
FIX:       what changed, with files, commit, PR, record, or "nothing, and why"
PROOF:     tests, logs, run IDs, advisor output, readbacks, screenshots, or traces
RISK:      what could still be wrong in the next evidence layer
ROLLBACK:  how to reverse safely
NEXT GATE: one exact founder decision or next action
```

“Nothing to write, nothing to merge” is also a claim. It requires a fresh authoritative read and must be reversed when the evidence changes.

## Deterministic GitHub procedure

For one-shot repository reads, prefer the exact exposed lookup actions:

```text
Find Repository
-> Get File Contents
-> Find Issue or Find Pull Request
-> Find Branch when required
```

Retain file SHA and returned metadata. Do not claim repository contents were verified when the controlling file was not read through a live GitHub lookup or another authoritative GitHub connector.

Use polling `New ...` triggers only for live automations. Zapier deduplication makes them unsuitable as deterministic one-shot reads because a previously seen object may correctly produce no new trigger item.

For bounded writes, use only explicitly exposed and authorized actions such as:

- Create Issue;
- Create Comment;
- update pull-request metadata when supported.

These writes do not authorize merge, deploy, branch deletion, ruleset changes, credential changes, or bypassing protection checks.

## Actions failure triage

When the active Zapier GitHub action set cannot read workflow logs or rerun jobs:

```text
GitHub Actions or deploy failure email
-> Gmail lookup
-> ChatGPT structured summary
-> deterministic GitHub repository/PR lookup
-> Create Issue or Create Comment
-> Founder Control Room evidence
```

Capture repository, branch, exact head SHA, workflow, run URL, run ID when known, failing job or stage, safe error excerpt, classification, impact, and first repair gate.

An email summary is triage evidence. Use a GitHub Actions API, Actions-capable GitHub connector, or GitHub's Actions UI for exact job logs, artifacts, checks, and rerun operations.

## Required bridge procedure

1. Discover a native Zapier or equivalent control connector.
2. If one exists, use it within its declared Zapier workflow scope.
3. Do not mistake the Zapier GitHub app for Zapier workflow administration or GitHub Actions administration.
4. If no Zapier control connector exists, discover the approved Founder Signal Engine Catch Hook, webhook, or named OpenAI Developers bridge target.
5. Use the existing key reference `zapier-founder-signal-engine`; do not create, rotate, or duplicate it merely because direct Zapier tooling is absent.
6. Send the complete invocation envelope.
7. Require a Zapier run ID or retain the exact provider error.
8. Capture OpenAI, Buffer, HubSpot, and Founder Control Room evidence.
9. Do not claim the end-to-end chain passed until every required artifact exists.

## Invocation envelope

```text
Invocation path or bridge identifier:
Key reference: zapier-founder-signal-engine
Zap ID or workflow name:
Requested action:
Source repository:
Source PR / commit SHA:
Steering grant ID:
Audit path:
Founder approval ID, when required:
Rollback or disable step:
```

## Allowed standing actions

- perform deterministic GitHub metadata lookups through exposed Find/Get actions;
- create a bounded GitHub issue or comment for failure triage when authorized;
- invoke or test the scoped workflow through the approved bridge;
- test the OpenAI step when the provider-held key reference is active;
- queue review-first Buffer content when the send decision permits it;
- prepare deal-associated HubSpot evidence within an approved CRM-write scope;
- record proof and blockers in Founder Control Room.

Inspection of Actions logs, workflow reruns, arbitrary Zap edits, credential changes, and billing changes require a connector or API that explicitly exposes that capability. Bridge invocation does not silently grant Zapier administration.

## Sensitive repository rule

Teen wellness, family, journal, voice, media, and other sensitive repositories remain on the GitHub/Gmail/ChatGPT evidence path unless a separate privacy-safe marketing contract is approved. Do not route private or sensitive content to HubSpot, Buffer, or public promotion.

For `jussray/founder-control-room`, stage issues, comments, and review tasks only. Do not auto-merge because Actions checks and protection gates are outside the Zapier GitHub metadata layer.

## Separate founder approval required

- external publishing or sending;
- new CRM mutations outside an already approved scope;
- credential creation, rotation, or replacement;
- billing or paid-plan changes;
- blind auto-publishing;
- merge or deployment;
- deletion of Zaps, runs, drafts, records, files, branches, or evidence.

## Pass evidence

- deterministic GitHub repository/PR/file evidence, including file SHA when relevant;
- Zapier run ID and status;
- OpenAI 5W1H output and send decision;
- Buffer draft, queue, schedule, or publish artifact;
- HubSpot task or note associated with deal `337185466050`;
- Founder Control Room record linked to the exact GitHub SHA;
- GitHub Actions logs from an Actions-capable path when runtime failure is claimed;
- no raw key in any artifact.

## Failure behavior

If target lookup or invocation fails, keep the raw key sealed, retain the exact error, classify the result as `UNKNOWN`, and do not create duplicate keys automatically. Verify that the current connector can reach the requested evidence layer, switch to the authoritative reader when it cannot, record the blocker, and repair the invocation path before generating another GitHub trigger. If Actions runtime access is missing, create a bounded triage issue and record the missing Actions-capable connector or webhook/API path. A null lookup must never be reported as verified deletion, movement, staleness, or absence.