# Founder Signal Engine - Day 2 Automation Blueprint

## REALITY
Ray has connected:

- HubSpot
- GitHub
- Zapier
- Buffer
- OpenAI Platform API key for Zapier
- LinkedIn
- Facebook
- Instagram, likely connected or ready to connect

The build now moves from account setup to a controlled first live workflow.

## GOAL
Create the first working automation path:

```text
GitHub PR evidence
→ Zapier receives a PR opened or updated event
→ OpenAI drafts Ray-style platform content
→ Buffer receives the approved social draft
→ HubSpot tracks the review/outreach task
→ Founder Control Room stores evidence
```

## SOURCE OF TRUTH

- GitHub proof source: `jussray/Sekret-Bip`
- Project control source: `jussray/founder-control-room`
- CRM source: HubSpot Deal `Founder Signal Engine`
- Social queue: Buffer
- AI drafting layer: OpenAI Platform key connected inside Zapier

## 5W1H SEND GATE

Every post, DM, email, investor note, partner note, or civic outreach must pass a 5W1H check before it is queued, sent, or logged as ready.

The engine must answer:

| Gate | Required answer | Failure behavior |
|---|---|---|
| Who | Who is this for? Name the audience, person type, or HubSpot contact segment. | Do not send. Create a research task. |
| What | What changed or what proof exists? Include repo, commit, PR, issue, screenshot, or demo link. | Do not send. Ask for proof or use a softer build-in-public post. |
| Where | Where should this go? LinkedIn, Facebook, Instagram, Gmail, HubSpot note, or internal-only. | Do not send. Route to internal review. |
| When | Why now? New commit, milestone, demo, risk fixed, civic timing, trend timing, or follow-up window. | Do not send. Schedule later or keep as draft. |
| Why | Why does this recipient/audience care? State the white space, value, risk solved, or opportunity. | Do not send. Create positioning task. |
| How | How should they act? Comment, connect, review repo, book call, fund, partner, test, or simply follow along. | Do not send. Add a clearer call to action. |

Send rule: if the 5W1H check is incomplete, the automation should create a HubSpot task instead of sending or publishing.

## ZAP 1 - GitHub Pull Request Event to LinkedIn Draft

### Trigger

App: GitHub  
Event: New Pull Request or Updated Pull Request  
Repository: `jussray/Sekret-Bip`  
Branch scope: any branch, if available  
Allowed actions: `opened`, `ready_for_review`, `synchronize`, `reopened`

If Zapier exposes only a commit trigger, scope it to any branch or the controlled proof branch. Do not leave the Zap main-only.

### Action 1: OpenAI Draft

App: OpenAI / ChatGPT in Zapier  
Action: Generate text / conversation response

Prompt:

```text
You are writing for Ray, founder of Se’kret Bip and related GitHub projects.

Use /human and /confess: tell the truth without sounding corporate, fake, desperate, or inflated.

Before writing anything, run the 5W1H send gate.

Return this structure:

5W1H:
- Who:
- What:
- Where:
- When:
- Why:
- How:
- Send decision: publish-draft, review-only, internal-only, or research-task
- Missing proof or missing context:

Then write the LinkedIn draft only if the send decision is publish-draft or review-only.

Write in Ray’s voice:
- direct
- human
- founder-led
- emotionally honest
- technical but understandable
- broke-founder energy without sounding desperate
- urgent in a good way: early, real, worth paying attention to

Turn this GitHub update into a LinkedIn post.

Rules:
- Do not sound corporate.
- Do not sound like generic marketing.
- Do not fake traction.
- Do not promise the product is finished if the repo is still being built.
- Mention the repo/project name.
- Explain what changed.
- Explain why it matters.
- Point back to proof.
- End with a soft call to action for builders, funders, partners, or people who understand the opportunity.
- Keep it under 1,300 characters.

GitHub evidence:
{{GitHub PR title}}
{{GitHub PR body}}
{{GitHub PR URL}}
{{GitHub head commit SHA}}
{{GitHub changed files}}
```

### Action 2: Buffer

App: Buffer  
Action: Add to Queue or Create Draft, depending on what the connected Buffer plan exposes.

Channel: LinkedIn first.

Safety rule: do not enable blind auto-posting until the first test draft is reviewed.

Zapier filter before Buffer:

```text
Only continue if OpenAI Send decision equals publish-draft or review-only.
Do not continue if Send decision equals internal-only or research-task.
```

### Action 3: HubSpot Task

App: HubSpot  
Action: Create Task

Task title:

```text
Review GitHub-generated LinkedIn post for Se’kret Bip
```

Task body:

```text
Source repo: jussray/Sekret-Bip
Source PR: {{GitHub PR URL}}
Trigger: GitHub pull request opened or updated
Generated channel: LinkedIn
Status: Review before publishing

5W1H:
Who: {{OpenAI Who}}
What: {{OpenAI What}}
Where: {{OpenAI Where}}
When: {{OpenAI When}}
Why: {{OpenAI Why}}
How: {{OpenAI How}}
Send decision: {{OpenAI Send decision}}
Missing proof/context: {{OpenAI Missing proof or missing context}}

Draft content:
{{OpenAI generated LinkedIn post}}

Proof:
PR: {{GitHub PR URL}}
Commit: {{GitHub head commit SHA}}
Changed files: {{GitHub changed files}}
```

Before creating the task, use a Find Deal step for `Founder Signal Engine`, then associate the task with deal `337185466050`. Do not create a floating task.

## ZAP 2 - Multi-Channel Draft Split

Only enable after Zap 1 works.

### Trigger

Same GitHub PR-aware trigger.

### Action: OpenAI creates three drafts

```text
Create three platform-specific drafts from this GitHub update.

Use the 5W1H send gate first:
- Who is the audience or contact segment?
- What proof changed?
- Where should this go?
- When should this be sent or queued?
- Why does this audience care?
- How should they act?

If any 5W1H field is weak or missing, label the draft review-only or internal-only.
Never auto-send incomplete outreach.

1. LinkedIn
Audience: builders, investors, technical partners, operators.
Tone: strategic, technical, proof-led.
Length: under 1,300 characters.

2. Facebook
Audience: community, family, local supporters, people following Ray’s founder story.
Tone: personal, clear, founder journey.
Length: under 900 characters.

3. Instagram
Audience: visual-first followers.
Tone: short, punchy, caption-style.
Length: under 700 characters.
Include 3–6 hashtags.

Shared voice:
- Ray-style
- human
- direct
- emotionally honest
- not corporate
- not desperate
- no fake traction
- no finished-product claims unless verified

GitHub update:
{{GitHub data}}

Repo link:
{{GitHub repo URL}}
```

## CHANNEL ROUTING RULES

### LinkedIn
Use for:

- investor narrative
- technical progress
- GitHub proof
- partnership signal
- founder execution updates

Required 5W1H emphasis:

- Who: builders, investors, operators, AI/product people, civic or family-tech partners
- Why: white space, proof of execution, strategic opportunity
- How: comment, connect, review the repo, book a call, or follow the build

### Facebook
Use for:

- community story
- family/parent angle
- local/civic relevance
- founder struggle and progress

Required 5W1H emphasis:

- Who: local community, family, parents, friends, everyday supporters
- Why: human stakes, teen/family relevance, local economic possibility
- How: share, comment, support, follow progress, introduce a helpful person

### Instagram
Use for:

- UI screenshots
- characters
- brand visuals
- before/after product progress
- short captions with proof links or link-in-bio CTA

Required 5W1H emphasis:

- Who: visual-first followers, creators, teen/family audience, brand watchers
- What: screenshot, character, screen, demo, before/after proof
- How: follow, tap link, comment, share, watch the build

### Gmail or Direct Outreach
Use only after social draft quality is proven.

Required 5W1H emphasis:

- Who: named person or clear segment
- What: specific repo/update/proof
- Where: email or DM
- When: milestone, follow-up timing, or urgent market/civic window
- Why: recipient-specific value, not generic attention-seeking
- How: one clear ask

If the message cannot name the recipient-specific Why, do not send. Create a HubSpot research task.

## REPO-TO-AUDIENCE MAP V0

| Repo | Primary Angle | Best Audience | First Channel |
|---|---|---|---|
| `jussray/Sekret-Bip` | Teen/family AI companion, safety, emotional support, identity-safe product architecture | investors, family-tech builders, AI safety people, creators, civic partners | LinkedIn |
| `jussray/founder-control-room` | Founder operating system, proof tracking, repo intelligence, build discipline | operators, technical founders, investor scouts, AI workflow people | LinkedIn |
| `jussray/l99-StoryEngine` | Story systems, AI narrative engine, content infrastructure | creators, media people, entertainment tech, creator economy investors | LinkedIn + Instagram |
| `jussray/chief-ai-machine` | AI agent command layer / founder execution machine | builders, automation people, AI tooling partners | LinkedIn |
| `jussray/untold-stories-storefront` | Commerce/storytelling/storefront wedge | creators, brand partners, commerce investors | Instagram + Facebook |
| `jussray/jussbeautifulhair-site` | Beauty commerce and local brand web presence | beauty buyers, local customers, creator commerce partners | Instagram + Facebook |

## OUTREACH RULES

- Draft first. Human review before send.
- Never spam.
- Match each person to a repo thesis before contact.
- Every contact needs a reason: funding, partnership, distribution, engineering, media, civic value, or creator reach.
- No auto-emailing investors until message quality is proven.
- Every post or outreach should point to proof.
- If the project is unfinished, say it is being built, not launched.
- Every outbound message must pass the 5W1H send gate.
- If Who, Why, or How is weak, create a HubSpot research task instead of sending.

## FIRST TEST SUCCESS CONDITION

Day 2 is done only when:

1. A GitHub pull request opened or updated event triggers Zapier.
2. OpenAI generates a LinkedIn draft in Ray’s voice.
3. The draft includes a 5W1H block and a send decision.
4. Buffer receives the draft or queue item only if the send decision allows it.
5. HubSpot receives a deal-associated review task or note with the 5W1H block.
6. Founder Control Room records the evidence.

## ROLLBACK

- Turn off Zap 1 in Zapier.
- Remove queued Buffer post if needed.
- Close or update HubSpot task if it was only a test.
- Revoke the dedicated OpenAI API key if credentials appear exposed.

## NEXT GATE

Inspect the live Zap name/ID, enabled state, GitHub trigger event, selected repository, and branch/event scope. Use Zapier’s built-in test trigger first. Do not emit another GitHub proof PR until the trigger contract matches this blueprint. After the built-in trigger passes, run one controlled PR event against `jussray/Sekret-Bip` and confirm Zapier produces the LinkedIn draft with the 5W1H block and without blind auto-publishing.
