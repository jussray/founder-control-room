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

If target lookup or invocation fails, keep the raw key sealed, retain the exact error, do not create duplicate keys automatically, record the blocker, and repair the invocation path before generating another GitHub trigger. If Actions runtime access is missing, create a bounded triage issue and record the missing Actions-capable connector or webhook/API path.