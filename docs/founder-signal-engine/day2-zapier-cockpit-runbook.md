# Founder Signal Engine - Day 2 Zapier Cockpit Runbook

## Reality

Day 2 is not complete until the real Zapier path runs and produces proof.

Ray has clarified the operating model: the OpenAI step inside Zapier is the only reliable handle this chat can shape directly. So agents should treat OpenAI as the signal layer Zapier listens to, not as the posting destination.

## Goal

Make this chain run and prove it:

```text
GitHub evidence
-> Zapier trigger
-> OpenAI 5W1H send gate
-> Buffer draft or queue item
-> HubSpot deal-associated task or note
-> Founder Control Room evidence record
```

## Tool discovery rule

Before giving Ray manual Zapier UI steps, the acting agent must:

1. Check available tools/connectors for Zapier, automation, browser-control, MCP, OpenAI Developers, or equivalent workflow-control access.
2. If a usable connector exists, inspect or repair the Zap directly.
3. If no usable connector exists, use OpenAI Platform as the reachable signal check and give exact Zapier UI steps only for the missing dashboard action.

Manual handoff is fallback, not default.

## OpenAI Platform boundary

OpenAI Platform is the key/model layer for Zapier.

Canonical key intent:

```text
OpenAI Platform key name: zapier-founder-signal-engine
Purpose: let Zapier call OpenAI for Founder Signal Engine 5W1H analysis, draft generation, routing decisions, and HubSpot review-task content.
```

Known target:

```text
Organization: Personal
Organization ID: org-TSqG9R1rPqx8uRdkbrXyxEdN
Project: Default project
Project ID: proj_OojryPqVk2W5IIifEGLy9M7B
```

Rules:

- Use the existing key unless Ray explicitly approves key rotation.
- Never paste, commit, log, screenshot, or store the raw key in unsafe surfaces.
- If Zapier fails at OpenAI, verify the Zapier OpenAI connection is using the dedicated key.
- Do not claim OpenAI posted anything. OpenAI only produces/rates/routes the content Zapier consumes.

## Step 1 - GitHub trigger

Preferred trigger:

```text
App: GitHub
Event: New Pull Request or Updated Pull Request
Repo: jussray/Sekret-Bip
Scope: any branch, if available
Allowed events: opened, ready_for_review, synchronize, reopened
```

If only commit triggers are available:

```text
Repo: jussray/Sekret-Bip
Branch scope: any branch or selected test branch
Do not force-merge a smoke-test PR just to satisfy a main-only trigger.
```

Reference smoke-test proof:

```text
PR: jussray/Sekret-Bip#580
Commit: 5138c4e7e6d9214b67ddb82dd9b88e854e6f7daa
Branch: founder-signal-engine-smoke-test
Changed file: docs/founder-signal-engine/smoke-test-2026-07-21.md
```

## Step 2 - OpenAI 5W1H action

Zapier OpenAI action:

```text
App: OpenAI / ChatGPT
Connection: zapier-founder-signal-engine
Action: Generate text / conversation response
```

Prompt:

```text
You are writing for Ray, founder of Se’kret Bip.

Use /human and /confess: tell the truth without sounding corporate, fake, desperate, inflated, or generic.

Before writing anything, run the 5W1H send gate.

Return this exact structure:

5W1H:
- Who:
- What:
- Where:
- When:
- Why:
- How:
- Send decision: publish-draft, review-only, internal-only, or research-task
- Missing proof or missing context:

Rules:
- If Who, What, Where, When, Why, or How is incomplete, set Send decision to research-task.
- If the update is real but still needs Ray to review it, set Send decision to review-only.
- If the update is strong enough to queue as a draft but not blindly publish, set Send decision to publish-draft.
- Never claim the product is finished unless the GitHub evidence proves it.
- Never fake traction, customers, funding, demand, partnerships, or launch status.
- Mention the repo/project name.
- Explain what changed.
- Explain why it matters.
- Point back to proof.
- Keep the social draft under 1,300 characters.

GitHub evidence:
PR title: {{GitHub PR title}}
PR body: {{GitHub PR body}}
PR URL: {{GitHub PR URL}}
Commit SHA: {{GitHub commit SHA}}
Changed files: {{GitHub changed files}}

Write the LinkedIn draft only if Send decision is publish-draft or review-only.
```

## Step 3 - Filter before Buffer

```text
Continue only if OpenAI Send decision contains publish-draft or review-only.
Do not continue to Buffer if Send decision is internal-only or research-task.
```

Fallback path model:

```text
Path A: publish-draft -> Buffer + HubSpot review task
Path B: review-only -> Buffer draft + HubSpot review task
Path C: internal-only/research-task -> HubSpot task only, no Buffer
```

## Step 4 - Buffer action

```text
App: Buffer
Action: Create Draft or Add to Queue
Channel: LinkedIn first
Content: OpenAI generated LinkedIn draft
Safety: first test must stay review-first, not blind auto-publish
```

## Step 5 - HubSpot association

Known deal:

```text
Deal name: Founder Signal Engine
Deal ID: 337185466050
Owner ID: 95470536
```

Use:

```text
Find Deal: Founder Signal Engine
Create Task or Note
Associated object: Deal
Associated deal: 337185466050
Owner: 95470536
Status: NOT_STARTED
```

Task title:

```text
Review Founder Signal Engine draft from GitHub proof
```

Task body:

```text
Source repo: jussray/Sekret-Bip
Source PR: {{GitHub PR URL}}
Commit: {{GitHub commit SHA}}
Changed files: {{GitHub changed files}}

5W1H:
Who: {{OpenAI Who}}
What: {{OpenAI What}}
Where: {{OpenAI Where}}
When: {{OpenAI When}}
Why: {{OpenAI Why}}
How: {{OpenAI How}}

Send decision: {{OpenAI Send decision}}
Missing proof/context: {{OpenAI Missing proof or missing context}}

Draft:
{{OpenAI LinkedIn draft}}

Proof:
{{GitHub PR URL}}
```

## First post test

The first post test should be:

```text
review-only or publish-draft
```

It must not be a blind public post. The test passes if Buffer receives a draft/queue item and HubSpot records the review proof attached to the deal.

## Pass/fail check

Day 2 passes only if:

1. GitHub proof is detected by Zapier.
2. OpenAI returns the 5W1H block.
3. Buffer receives a LinkedIn draft or queue item only when the send decision allows it.
4. HubSpot creates a task or note attached to Founder Signal Engine deal `337185466050`.
5. No raw OpenAI key appears in logs, GitHub, HubSpot body, screenshots, or chat.
6. Founder Control Room records the evidence.

## Failure triage

| Failure | Likely cause | Fix |
|---|---|---|
| Zapier does not fire | Trigger watches only `main` or only commits | Use PR trigger, Updated PR trigger, or any-branch commit trigger. |
| OpenAI step fails | Zapier OpenAI connection missing or wrong key | Reconnect OpenAI in Zapier using the dedicated key. |
| Buffer step does not run | Send decision is internal-only/research-task or filter mapping wrong | Check OpenAI output field mapping and filter logic. |
| HubSpot task floats | HubSpot association missing | Find Deal first, then create task/note associated to deal `337185466050`. |
| Agent says it cannot access Zapier | Tool discovery not completed | Search for Zapier/control connectors before manual handoff. |

## Evidence capture template

```text
Zapier run status:
OpenAI 5W1H output:
Buffer draft/queue result:
HubSpot task/note URL:
Founder Control Room evidence link:
```

## Next gate

Use the OpenAI action as the reachable Zapier signal, then verify whether Zapier moved that signal into Buffer and HubSpot.
