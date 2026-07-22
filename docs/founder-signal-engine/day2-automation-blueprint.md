# Founder Signal Engine - Day 2 Automation Blueprint

## Reality

Ray reports the core Day 2 accounts and connections are already wired through Zapier:

- GitHub
- Zapier
- OpenAI Platform key for Zapier
- Buffer
- HubSpot
- LinkedIn
- Facebook
- Instagram, likely connected or ready

This file does not claim direct Zapier UI control. It documents the controlled automation path and the evidence required to prove it.

## Goal

Create and verify the first review-first automation path:

```text
GitHub evidence
-> Zapier trigger
-> OpenAI 5W1H analysis and draft
-> Buffer draft or queue item
-> HubSpot task/note associated with Founder Signal Engine deal
-> Founder Control Room evidence
```

## Current control truth

| Layer | Purpose | Boundary |
|---|---|---|
| GitHub | Creates proof events and stores source-of-truth docs. | GitHub evidence alone does not prove Zapier ran. |
| OpenAI Platform | Supplies the model/key layer Zapier calls. | OpenAI is not the posting tool. |
| Zapier | Routes GitHub events through OpenAI, Buffer, and HubSpot. | Direct Zapier control depends on connector/browser access. |
| Buffer | Holds the social draft or queue item. | First run must be review-first, not blind auto-publish. |
| HubSpot | Stores CRM proof and review tasks. | Task/note must attach to the Founder Signal Engine deal. |
| Founder Control Room | Records the evidence chain. | Do not mark Day 2 complete without downstream proof. |

## OpenAI key intent

```text
OpenAI Platform key name: zapier-founder-signal-engine
Purpose: let Zapier call OpenAI for 5W1H analysis, draft generation, routing decisions, and HubSpot review-task content.
```

Rules:

- Use the existing Zapier OpenAI key unless Ray explicitly asks to rotate or create a new one.
- Never publish, commit, log, paste, screenshot, or store the raw key in GitHub, HubSpot, Founder Control Room, chat-visible docs, PR bodies, issues, screenshots, or logs.
- Treat OpenAI as the reachable signal layer for Zapier. If we cannot inspect Zapier directly, shape and verify the OpenAI output Zapier consumes.

## 5W1H send gate

Every post, DM, email, investor note, partner note, civic outreach, or social draft must pass this gate before it is sent, queued, or logged as ready.

| Gate | Required answer | Failure behavior |
|---|---|---|
| Who | Audience, person type, named recipient, or HubSpot segment. | Do not send. Create a research/review task. |
| What | Exact GitHub proof, commit, PR, issue, screenshot, or demo. | Do not send. Ask for proof or use internal-only. |
| Where | LinkedIn, Facebook, Instagram, Gmail, HubSpot, or internal-only. | Do not send. Route to internal review. |
| When | Why now: milestone, fix, test, market timing, or follow-up window. | Do not send. Keep as draft or schedule later. |
| Why | Recipient/audience-specific value, white space, risk solved, or opportunity. | Do not send. Create positioning task. |
| How | Clear next action: review, comment, connect, book call, test, partner, fund, or follow. | Do not send. Add a clearer call to action. |

Send decision values:

```text
publish-draft
review-only
internal-only
research-task
```

If any 5W1H field is incomplete, Zapier must not publish. It should create a HubSpot research/review task instead.

## Zapier path

### Step 1 - GitHub trigger

Preferred trigger:

```text
App: GitHub
Event: New Pull Request or Updated Pull Request
Repo: jussray/Sekret-Bip
Scope: any branch, if available
Allowed events: opened, ready_for_review, synchronize, reopened
```

If Zapier only exposes a commit trigger, use any branch or the selected test branch. Do not merge a test PR just to satisfy a main-only trigger.

### Step 2 - OpenAI action

```text
App: OpenAI / ChatGPT inside Zapier
Connection: zapier-founder-signal-engine
Action: Generate text / conversation response
```

Prompt core:

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
- Never claim the product is finished unless GitHub evidence proves it.
- Never fake traction, customers, funding, demand, partnerships, or launch status.
- Mention the repo/project name.
- Explain what changed.
- Explain why it matters.
- Point back to proof.
- Keep the social draft under 1,300 characters.

GitHub evidence:
{{GitHub PR title}}
{{GitHub PR body}}
{{GitHub PR URL}}
{{GitHub commit SHA}}
{{GitHub changed files}}

Write the LinkedIn draft only if Send decision is publish-draft or review-only.
```

### Step 3 - Filter before Buffer

```text
Continue only if OpenAI Send decision contains publish-draft or review-only.
Do not continue to Buffer if Send decision is internal-only or research-task.
```

If Zapier filter OR logic is awkward, use paths:

```text
Path A: publish-draft -> Buffer + HubSpot review task
Path B: review-only -> Buffer draft + HubSpot review task
Path C: internal-only/research-task -> HubSpot task only, no Buffer
```

### Step 4 - Buffer

```text
App: Buffer
Action: Create Draft or Add to Queue
Channel: LinkedIn first
Content: OpenAI generated LinkedIn draft
Safety: first live test remains review-first
```

### Step 5 - HubSpot

Known CRM anchor:

```text
Deal name: Founder Signal Engine
Deal ID: 337185466050
Owner ID: 95470536
```

Preferred path:

```text
Find Deal -> Founder Signal Engine
Create Task or Note
Associated object: Deal
Associated deal: 337185466050
Status: NOT_STARTED
```

Task body should include:

```text
Source repo:
Source PR:
Commit:
Changed files:

5W1H:
Who:
What:
Where:
When:
Why:
How:

Send decision:
Missing proof/context:

Draft:

Proof:
```

## First post test

The first post test is not an auto-publication test. It is a review-first draft test:

1. GitHub creates a real proof event.
2. Zapier catches the event.
3. Zapier calls OpenAI through `zapier-founder-signal-engine`.
4. OpenAI returns 5W1H + draft.
5. Zapier sends the draft to Buffer as review-first.
6. Zapier creates a HubSpot task/note attached to deal `337185466050`.
7. Founder Control Room records the evidence.

## Repo-to-audience map v0

| Repo | Primary angle | Best audience | First channel |
|---|---|---|---|
| `jussray/Sekret-Bip` | Teen/family AI companion, safety, emotional support, identity-safe architecture | investors, family-tech builders, AI safety people, creators, civic partners | LinkedIn |
| `jussray/founder-control-room` | Founder operating system, proof tracking, repo intelligence, build discipline | operators, technical founders, investor scouts, AI workflow people | LinkedIn |
| `jussray/l99-StoryEngine` | Story systems, AI narrative engine, creator content infrastructure | creators, media, entertainment tech, creator economy investors | LinkedIn + Instagram |
| `jussray/chief-ai-machine` | AI agent command layer / founder execution machine | builders, automation people, AI tooling partners | LinkedIn |
| `jussray/untold-stories-storefront` | Commerce/storytelling/storefront wedge | creators, brand partners, commerce investors | Instagram + Facebook |
| `jussray/jussbeautifulhair-site` | Beauty commerce and local brand web presence | beauty buyers, local customers, creator commerce partners | Instagram + Facebook |

## Pass condition

Day 2 is complete only when:

1. GitHub evidence is detected by Zapier.
2. OpenAI returns a 5W1H block and send decision.
3. Buffer receives a review-first draft or allowed queue item.
4. HubSpot creates a task/note attached to Founder Signal Engine deal `337185466050`.
5. Founder Control Room records the evidence.
6. No raw OpenAI key appears anywhere unsafe.

## Rollback

- Turn off the Zap.
- Remove or pause the Buffer draft/queue item.
- Close or update the HubSpot test task/note.
- Revoke the dedicated OpenAI key only if it is exposed.
- Close the PR if the docs are superseded.

## Next gate

Use the OpenAI step as the reachable signal into Zapier, then verify whether Zapier carried that signal into Buffer and HubSpot.
