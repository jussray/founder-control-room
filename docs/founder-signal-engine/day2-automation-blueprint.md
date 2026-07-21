# Founder Signal Engine — Day 2 Automation Blueprint

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
GitHub update
→ OpenAI drafts Ray-style content
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

## ZAP 1 — GitHub Commit to LinkedIn Draft

### Trigger

App: GitHub  
Event: New Commit  
Repository: `jussray/Sekret-Bip`

### Action 1: OpenAI Draft

App: OpenAI / ChatGPT in Zapier  
Action: Generate text / conversation response

Prompt:

```text
You are writing for Ray, founder of Se’kret Bip and related GitHub projects.

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

GitHub update:
{{GitHub commit message / PR / issue / release data}}

Repo link:
{{GitHub repo URL}}
```

### Action 2: Buffer

App: Buffer  
Action: Add to Queue or Create Draft, depending on what the connected Buffer plan exposes.

Channel: LinkedIn first.

Safety rule: do not enable blind auto-posting until the first test draft is reviewed.

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
Trigger: GitHub commit
Generated channel: LinkedIn
Status: Review before publishing

Draft content:
{{OpenAI generated LinkedIn post}}

Proof link:
{{GitHub commit / repo link}}
```

Associate manually with HubSpot Deal: `Founder Signal Engine` if Zapier exposes association fields. If not, leave the deal name in the task body.

## ZAP 2 — Multi-Channel Draft Split

Only enable after Zap 1 works.

### Trigger

Same GitHub trigger.

### Action: OpenAI creates three drafts

```text
Create three platform-specific drafts from this GitHub update.

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

### Facebook
Use for:

- community story
- family/parent angle
- local/civic relevance
- founder struggle and progress

### Instagram
Use for:

- UI screenshots
- characters
- brand visuals
- before/after product progress
- short captions with proof links or link-in-bio CTA

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

## FIRST TEST SUCCESS CONDITION

Day 2 is done only when:

1. GitHub update triggers Zapier.
2. OpenAI generates a LinkedIn draft in Ray’s voice.
3. Buffer receives the draft or queue item.
4. HubSpot receives a review task or note.
5. Founder Control Room records the evidence.

## ROLLBACK

- Turn off Zap 1 in Zapier.
- Remove queued Buffer post if needed.
- Close or update HubSpot task if it was only a test.
- Revoke the dedicated OpenAI API key if credentials appear exposed.

## NEXT GATE

Run one controlled GitHub update against `jussray/Sekret-Bip` and confirm Zapier produces the LinkedIn draft without auto-publishing.
