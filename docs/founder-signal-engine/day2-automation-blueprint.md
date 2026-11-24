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
| What | What changed or what proof exists? Include repo, commit, PR, issue, screenshot, or demo link when the post makes a product-progress claim. For conversation/research posts, name the question, observation, or founder experience instead. | Do not send if the content intent cannot be stated. Ask for proof for product-progress claims; otherwise create a research task. |
| Where | Where should this go? LinkedIn, Facebook, Instagram, Gmail, HubSpot note, or internal-only. | Do not send. Route to internal review. |
| When | Why now? New commit, milestone, demo, risk fixed, civic timing, trend timing, founder observation, or follow-up window. | Do not send. Schedule later or keep as draft. |
| Why | Why does this recipient/audience care? State the white space, value, risk solved, opportunity, or useful question. | Do not send. Create positioning task. |
| How | How should they act? Comment, connect, review repo, book call, fund, partner, test, answer a question, or simply follow along. | Do not send. Add a clearer call to action. |

Send rule: if the 5W1H check is incomplete, the automation should create a HubSpot task instead of sending or publishing.

## CONTENT INTENT + FRESHNESS GATE

Before drafting, classify exactly one content intent:

- `proof-update`: a verified product, repo, runtime, launch, fix, metric, or milestone claim;
- `conversation-research`: a founder observation or open question intended to learn from the audience, without claiming unverified product progress;
- `personal-founder`: a first-person founder experience or lesson;
- `offer`: a clear service, product, partnership, or sales ask.

Do not force every content intent into the `proof-update` shape.

For `proof-update`, evidence stays mandatory for every material public claim. A public proof link remains editorially optional unless the specific post needs the link to make the claim understandable or auditable.

For `conversation-research`:

- do not require the repo/project name in the public copy;
- do not require a public proof link when the post makes no product-progress claim;
- anchor the post in one concrete founder observation, tension, or repeated behavior;
- end with one answerable question;
- treat useful replies as research evidence, never as publication authority;
- keep internal evidence and approval boundaries unchanged.

Before drafting LinkedIn content, create a lightweight content fingerprint from the recent post set:

- primary thesis;
- opening mechanism;
- dominant vocabulary cluster;
- content intent;
- CTA type.

If the proposed post repeats the same primary thesis and dominant vocabulary cluster as recent posts, change the angle before drafting. Do not solve repetition by swapping synonyms while preserving the same conclusion.

Current LinkedIn anti-repetition rule: consecutive posts should not repeatedly collapse into the same `proof / authority / exact-head / receipt / verify` thesis cluster unless new evidence materially changes the story.

LinkedIn conversation-post defaults:

- human/founder observation before architecture language;
- plain-language hook before internal terminology;
- at most one internal workflow term unless the term itself is the subject;
- one primary question, not multiple competing CTAs;
- 3-5 relevant hashtags maximum;
- no mandatory repo link, project name, or proof appendix when no product-progress claim is made.

The content fingerprint is a non-secret continuity marker only. It may guide freshness and learning but cannot authorize publishing, renew approval, or override Current You.

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

Before writing anything, run the 5W1H send gate and the Content Intent + Freshness Gate.

Return this structure:

5W1H:
- Who:
- What:
- Where:
- When:
- Why:
- How:
- Content intent: proof-update, conversation-research, personal-founder, or offer
- Content fingerprint: primary thesis | opening mechanism | dominant vocabulary cluster | content intent | CTA type
- Freshness decision: fresh, revise-angle, or hold
- Send decision: publish-draft, review-only, internal-only, or research-task
- Missing proof or missing context:

Then write the LinkedIn draft only if the freshness decision is fresh and the send decision is publish-draft or review-only.

Write in Ray’s voice:
- direct
- human
- founder-led
- emotionally honest
- technical but understandable
- broke-founder energy without sounding desperate
- urgent in a good way: early, real, worth paying attention to

Turn this GitHub update or founder observation into the correct LinkedIn content intent.

Shared rules:
- Do not sound corporate.
- Do not sound like generic marketing.
- Do not fake traction.
- Do not promise the product is finished if the repo is still being built.
- Explain why the subject matters in plain language.
- Keep it under 1,300 characters.

If Content intent = proof-update:
- Mention the repo/project name when it improves clarity.
- Explain what changed.
- Bind every product-progress claim to verified internal evidence.
- A public proof link is optional editorially; include it when it materially improves auditability or context.
- End with one appropriate soft call to action.

If Content intent = conversation-research:
- Start from one concrete founder observation, tension, or repeated AI/product behavior.
- Do not force the repo/project name into the public copy.
- Do not force a public proof link when there is no product-progress claim.
- Prefer plain language over internal workflow vocabulary.
- End with one answerable conversation question.
- Use 3-5 relevant hashtags maximum.
- Do not reuse the same primary thesis plus dominant vocabulary cluster as the recent-post fingerprint.

GitHub evidence, when relevant:
{{GitHub PR title}}
{{GitHub PR body}}
{{GitHub PR URL}}
{{GitHub head commit SHA}}
{{GitHub changed files}}

Recent content fingerprints, when available:
{{Recent LinkedIn content fingerprints}}
```

### Action 2: Buffer

App: Buffer  
Action: Add to Queue or Create Draft, depending on what the connected Buffer plan exposes.

Channel: LinkedIn first.

Safety rule: do not enable blind auto-posting until the first test draft is reviewed.

Zapier filter before Buffer:

```text
Only continue if OpenAI Freshness decision equals fresh and OpenAI Send decision equals publish-draft or review-only.
Do not continue if Freshness decision equals revise-angle or hold.
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
Content intent: {{OpenAI Content intent}}
Content fingerprint: {{OpenAI Content fingerprint}}
Freshness decision: {{OpenAI Freshness decision}}
Send decision: {{OpenAI Send decision}}
Missing proof/context: {{OpenAI Missing proof or missing context}}

Draft content:
{{OpenAI generated LinkedIn post}}

Proof, when the content intent requires it:
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
Create three platform-specific drafts from this GitHub update or founder observation.

Use the 5W1H send gate and Content Intent + Freshness Gate first:
- Who is the audience or contact segment?
- What proof changed, or what founder observation/question is being explored?
- Where should this go?
- When should this be sent or queued?
- Why does this audience care?
- How should they act?
- What is the content intent?
- What is the content fingerprint?
- Is the angle fresh relative to recent posts?

If any required 5W1H field is weak or missing, label the draft review-only or internal-only.
Never auto-send incomplete outreach.
Never publish a revise-angle or hold freshness decision.

1. LinkedIn
Audience: builders, investors, technical partners, operators, and AI/product people.
Tone: strategic, human, technical when useful, and proof-led only when the content intent is proof-update.
Length: under 1,300 characters.
For conversation-research, use one concrete observation, one thesis, one answerable question, and 3-5 relevant hashtags maximum.

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

GitHub update, when relevant:
{{GitHub data}}

Repo link, when relevant:
{{GitHub repo URL}}

Recent content fingerprints, when available:
{{Recent platform content fingerprints}}
```

## CHANNEL ROUTING RULES

### LinkedIn
Use for:

- investor narrative
- technical progress
- GitHub proof
- partnership signal
- founder execution updates
- founder observations and conversation-led product research

Required 5W1H emphasis:

- Who: builders, investors, operators, AI/product people, civic or family-tech partners
- Why: white space, proof of execution, strategic opportunity, or a useful founder/product question
- How: comment, connect, answer the question, review the repo, book a call, or follow the build

For conversation-research posts, optimize for a clear discussion doorway rather than forcing project proof into the copy. Replies may update research evidence but never publication authority.

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
- Every product-progress claim must bind to proof. Conversation-research and personal-founder posts do not need a public proof link unless they make a material progress claim.
- If the project is unfinished, say it is being built, not launched.
- Every outbound message must pass the 5W1H send gate.
- Every social draft must pass the Content Intent + Freshness Gate.
- If Who, Why, or How is weak, create a HubSpot research task instead of sending.

## FIRST TEST SUCCESS CONDITION

Day 2 is done only when:

1. A GitHub pull request opened or updated event triggers Zapier.
2. OpenAI generates a LinkedIn draft in Ray’s voice.
3. The draft includes a 5W1H block, content intent, content fingerprint, freshness decision, and send decision.
4. Buffer receives the draft or queue item only if the freshness and send decisions allow it.
5. HubSpot receives a deal-associated review task or note with the 5W1H and content-freshness fields.
6. Founder Control Room records the evidence.

## ROLLBACK

- Revert the focused `fix(content): separate LinkedIn conversation posts from proof updates` commit if the content-intent split causes regressions.
- Turn off Zap 1 in Zapier.
- Remove queued Buffer post if needed.
- Close or update HubSpot task if it was only a test.
- Revoke the dedicated OpenAI API key if credentials appear exposed.

## NEXT GATE

Inspect the live Zap name/ID, enabled state, GitHub trigger event, selected repository, and branch/event scope. Use Zapier’s built-in test trigger first. Do not emit another GitHub proof PR until the trigger contract matches this blueprint. After the built-in trigger passes, run one controlled draft event and confirm Zapier produces the LinkedIn draft with the 5W1H block, content intent, content fingerprint, freshness decision, and no blind auto-publishing. For a conversation-research fixture, verify that the public draft can omit the repo name and proof link while preserving internal evidence and approval boundaries.