# Founder Short-Form Content Engine

## Goal

Turn verified GitHub and product milestones into proof-first, wonder-rich short-form media packages for Instagram Reels, TikTok, YouTube Shorts, Facebook Reels, LinkedIn, and later channels without flattening the idea into literal proof cards.

Accuracy is necessary but not sufficient. The media must earn attention, create curiosity or feeling, preserve comprehension and human agency, and make proof part of the scene rather than using the receipt itself as the whole scene.

## Canonical visual contract

All founder-content stills, moving clips, covers, carousels, and product-derived launch visuals must pass `tools/founder-content-contracts/visual-wonder-contract.cjs`.

The contract has two stages:

```text
thesis + human outcome
→ emotional intent
→ native form
→ visual hook
→ scene / metaphor
→ proof object + truth boundary
→ generation / production
→ Attack 2000 artifact gate
→ founder review
```

`Attack 2000` is a two-pass falsification pressure budget. It is not a claim that 2,000 external tests or actions ran.

Pass 1 attacks the concept before generation: premise, literalism, visual curiosity gap, emotional pull, proof fit, human outcome, native format, brand/canon fit.

Pass 2 attacks the rendered artifact: proof integrity, nonliteral interpretation, accessibility, canon integrity, human agency, scroll-stop power, beauty, wonder, meaning, platform nativeness, memorability, brand fit, clutter, safe zones, reduced motion where applicable, legibility, AI-slop tells, and visual proof overclaim.

A truthful but dull artifact fails. A beautiful but misleading artifact fails. A visually impressive artifact that merely restates the caption fails the nonliteral gate.

## Day-one channels

1. Instagram Reels
2. TikTok
3. YouTube Shorts
4. Facebook Reels

Instagram is first-class from the start. Every package must include an Instagram-specific hook, cover frame, caption, safe-zone check, account identity, and publication receipt requirement.

## Later adapters

Later channels may be added only through adapters that preserve the same source manifest, visual-wonder contract, and authority boundaries:

- LinkedIn native video and 4:5 hero stills
- Pinterest video pins
- Snapchat Spotlight
- Threads video
- X video
- website hero loops
- email teaser thumbnails
- HubSpot landing-page video assets

## Pipeline

```text
verified milestone
→ immutable evidence packet
→ Chief strategy + fresh-angle gate
→ Visual Wonder brief
→ OpenAI script package
→ scene / metaphor + storyboard + shot list
→ founder-camera, cinematic-proof, character-story, kinetic-text, dream-product, or hybrid production
→ 1080x1920 master and/or 4:5 hero still
→ platform-specific variants
→ Attack 2000 artifact gate
→ founder review
→ approved scheduler or native publish path
→ execution receipts
→ HubSpot + Founder Control Room proof
```

## Source manifest

Each package must record:

- project and repository;
- source PR, reviewed head SHA, and merge SHA;
- verified and unverified claims;
- proof links and the exact truth boundary they support;
- approved and blocked assets;
- founder voice profile;
- character-canon profile;
- target channels and accounts;
- selected creative mode and native form;
- emotional intent and human outcome;
- visual hook, scene/metaphor, motion language, and memory line;
- Attack 2000 concept and artifact verdicts;
- approval state;
- generation, render, schedule, and publication receipts.

A merge, connected account, generated draft, scheduler configuration, beautiful render, or platform upload is not proof of publication, runtime equivalence, or traction.

## Required content package

OpenAI produces:

- three hooks;
- 10–15 second, 25–35 second, and 45–60 second scripts when moving media is selected;
- one selected emotional intent pair at most;
- one nonliteral scene or metaphor direction;
- one first-second visual hook;
- scene storyboard;
- B-roll and screenshot/proof-object list;
- founder-camera directions when applicable;
- voiceover transcript;
- timed on-screen captions;
- motion language and loop/close behavior;
- cover-frame brief;
- 4:5 hero-still brief when useful;
- Instagram Reel caption;
- TikTok caption;
- YouTube Shorts title and description;
- Facebook Reel caption;
- LinkedIn caption/hero variant when selected;
- one call to action;
- one memory line;
- claim-to-proof map;
- disclosure of unfinished work;
- human-output statement: what the viewer should understand, feel, or be more capable of after consuming it.

## Creative modes

Use one primary mode rather than defaulting every proof story to a dashboard:

- `cinematic-proof` — real evidence staged inside a compelling visual world;
- `mythic-founder` — worldview, ambition, identity, or founder thesis expressed through symbolic imagery;
- `dream-product` — product possibility shown as an emotionally legible future moment;
- `character-story` — canon-preserving character narrative;
- `product-experience` — actual product experience where interaction/motion carries meaning.

The proof object is a prop or anchor inside the story. It should not automatically become the entire visual composition.

## Short-form motion grammar

For 6–15 second social-native clips, default to:

```text
0–1s   scroll-stopping visual event
1–4s   thesis lands
4–8s   proof object or product truth enters
8–12s  meaning twist / human significance
12–15s memory line / loop-close
```

The timing may change when the idea demands it, but a moving clip must have an intentional motion language. Static slides exported as video do not satisfy the contract merely because the file format is MP4.

## Visual production modes

- Founder camera
- Cinematic proof
- Screen proof used as an ingredient, not the default art direction
- Se’kret Bip character story
- Dream-product visualization
- Kinetic text
- Hybrid founder + product + story

For Se’kret Bip, current canon is required: Night left, Suhana center, Sy right, Cloud companion, approved parent and family designs, and no unapproved name, face, costume, relationship, or character-role drift. Wonder may strengthen canon; it may not overwrite it.

## /human visual gate

Before approval, answer:

- What does this leave the human understanding that they did not understand before?
- What feeling opens the door to that understanding without manipulating them?
- Does the visual preserve choice, context, dignity, and truth?
- Is the piece rewarding to encounter even before the viewer reads the full caption?
- Does beauty clarify meaning, or is it hiding weak substance?

A technically correct artifact that is visually dead is incomplete. A beautiful artifact that reduces comprehension or overstates proof is rejected.

## Key and bridge rule

Use the existing protected key reference `zapier-founder-signal-engine`. Do not create a duplicate key unless the founder separately authorizes rotation or replacement.

The key is the credential path. The Founder Signal Engine bridge is the callable path. The matching Zapier run is execution proof. Raw secrets must never appear in GitHub, chat, HubSpot, Buffer, Canva, screenshots, logs, or evidence artifacts.

## Existing-key health test

The first safe test is authentication-only and non-mutating:

```bash
bash scripts/test-openai-key-health.sh
```

The script reads `OPENAI_API_KEY` from the environment, calls the OpenAI Models endpoint, prints only HTTP status and a redacted result, and never prints the key. A successful authentication test proves only that the key is accepted by OpenAI. It does not prove Zapier, Buffer, HubSpot, social publishing, or the Founder Signal Engine bridge executed.

## First pilot

Use Se’kret Bip PR #599 and merge commit `f4573d360a8fea99b301f33a2a21192525725f7b` only as historical pilot provenance unless fresh current evidence authorizes reuse. A new production package must bind its own current source subject.

A complete pilot package contains:

- one 15-second teaser;
- one 30-second founder-build Reel;
- one 45–60-second proof/story version;
- Instagram, TikTok, YouTube Shorts, and Facebook Reel variants;
- one 4:5 hero still where useful;
- one cover concept;
- one voiceover;
- one production manifest;
- one Visual Wonder brief;
- one Attack 2000 artifact verdict;
- one complete proof bundle.

## Completion gate

The project is not complete until one real invocation can be linked to:

- reachable deployed Founder Signal Engine bridge;
- invocation receipt;
- matching workflow/provider run ID when that adapter is used;
- verified OpenAI output;
- approved voice and visual assets;
- Canva or equivalent render artifact when used;
- platform-specific review artifacts;
- Visual Wonder / Attack 2000 verdict;
- scheduling or publication receipts for each target channel;
- separately authorized HubSpot evidence;
- Founder Control Room proof.

Visual approval, source proof, provider execution, publication, and audience outcome remain separate evidence layers.
