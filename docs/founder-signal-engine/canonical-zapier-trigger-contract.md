# Founder Signal Engine — Canonical Zapier Trigger Contract

## Status and precedence

This document is the canonical source of truth for the Founder Signal Engine GitHub trigger.

It supersedes the `New Commit` trigger described in `day2-automation-blueprint.md`. The PR-aware trigger in `day2-zapier-cockpit-runbook.md` remains correct and is restated here to remove ambiguity.

Until platform-owned runtime evidence is captured, `FCR-AUTOMATION-001` remains `partial`.

## Reality

Two controlled source events were successfully emitted from `jussray/Sekret-Bip`:

- PR #593: `Founder Signal Engine live review-first proof`
- PR #599: `Trigger Day 3 Founder Signal Engine promotion proof`

Neither event produced a captured Zapier run ID, OpenAI 5W1H output, Buffer artifact, or automatic HubSpot task/note. HubSpot inspection found no matching associated or floating task/note for either proof window.

GitHub OAuth authorization for Zapier existed before both tests. Therefore, the leading failure domain is the live Zap definition or enabled state, not absence of GitHub authorization.

## Canonical GitHub trigger

Configure the live Founder Signal Engine Zap as follows:

```text
App: GitHub
Event: New Pull Request or Updated Pull Request
Repository: jussray/Sekret-Bip
Branch scope: any branch, if exposed
Allowed actions:
- opened
- ready_for_review
- synchronize
- reopened
```

The Zap must be enabled and published, not left as an unpublished draft.

### Fallback only when Zapier lacks a PR-aware trigger

```text
App: GitHub
Event: New Commit
Repository: jussray/Sekret-Bip
Branch scope: any branch or the controlled proof branch
```

Do not use a `main`-only commit trigger for review-first proof PRs.

## Required source payload

The trigger output must expose or derive:

```text
repository_full_name
pull_request_number
pull_request_title
pull_request_body
pull_request_url
pull_request_action
head_branch
head_sha
changed_files, when available
event_timestamp
```

The OpenAI step must not rely on a commit message alone when a PR body and URL are available.

## Downstream contract

```text
GitHub PR event
-> OpenAI 5W1H send gate
-> decision filter
-> Buffer review draft or queue item when allowed
-> HubSpot task/note associated with deal 337185466050
-> Founder Control Room evidence record
```

### OpenAI pass contract

OpenAI must return:

```text
5W1H:
- Who:
- What:
- Where:
- When:
- Why:
- How:
- Send decision: publish-draft, review-only, internal-only, or research-task
- Missing proof or missing context:
```

### Routing rules

- `publish-draft` or `review-only`: Buffer review draft/queue item plus HubSpot review record.
- `internal-only` or `research-task`: HubSpot task only; do not send to Buffer.
- Missing or malformed send decision: fail closed and create no public artifact.

### Buffer safety

The first successful run must remain review-first. Do not enable blind publication.

### HubSpot association

```text
Deal: Founder Signal Engine
Deal ID: 337185466050
Owner ID: 95470536
```

A floating task or note does not satisfy the pass condition.

## Runtime proof windows

Use these historical windows when inspecting Zapier Task History:

```text
PR #593: 2026-07-22T15:45Z–15:50Z
PR #599: 2026-07-24T03:31Z–03:39Z
```

Record whether each window contains:

1. no run;
2. a filtered/skipped run;
3. a failed run and first failed step; or
4. a successful run.

## Required completion evidence

The engine passes only when one controlled run retains:

```text
Zap name and Zap ID
Zap enabled/published state
GitHub trigger event and selected repository
Zapier run ID, timestamp, and status
Sanitized GitHub trigger payload
Complete OpenAI 5W1H output and send decision
Buffer draft/queue artifact and status
HubSpot deal-associated task/note URL
Founder Control Room evidence link
Rollback/disable instructions
```

Repository merges alone do not satisfy this contract.

## Hold rule

Do not create another trigger PR until the live Zap's name/ID, enabled state, trigger event, repository, and branch scope have been inspected and recorded in Founder Control Room issue #97.

## Secret boundary

Never place a raw OpenAI API key, Zapier credential, Buffer token, GitHub token, or HubSpot token in GitHub, HubSpot, screenshots, logs, or chat-visible evidence.
