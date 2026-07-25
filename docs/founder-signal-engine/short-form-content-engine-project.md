# Founder Short-Form Content Engine

## Goal

Turn verified GitHub and product milestones into proof-first short-form video packages for Instagram Reels, TikTok, YouTube Shorts, and Facebook Reels, with later channels joining through the same evidence, approval, and receipt rules.

## Day-one channels

1. Instagram Reels
2. TikTok
3. YouTube Shorts
4. Facebook Reels

Instagram is first-class from the start. Every package must include an Instagram-specific hook, cover frame, caption, safe-zone check, account identity, and publication receipt requirement.

## Later adapters

Later channels may be added only through adapters that preserve the same source manifest and authority boundaries:

- LinkedIn native video
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
→ OpenAI script package
→ storyboard + shot list
→ founder-camera, screen-proof, character-story, kinetic-text, or hybrid production
→ 1080x1920 master
→ platform-specific variants
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
- proof links;
- approved and blocked assets;
- founder voice profile;
- character-canon profile;
- target channels and accounts;
- approval state;
- generation, render, schedule, and publication receipts.

A merge, connected account, generated draft, or scheduler configuration is not proof of publication or traction.

## Required content package

OpenAI produces:

- three hooks;
- 10–15 second, 25–35 second, and 45–60 second scripts;
- scene storyboard;
- B-roll and screenshot list;
- founder-camera directions;
- voiceover transcript;
- timed on-screen captions;
- cover-frame brief;
- Instagram Reel caption;
- TikTok caption;
- YouTube Shorts title and description;
- Facebook Reel caption;
- one call to action;
- claim-to-proof map;
- disclosure of unfinished work.

## Visual production modes

- Founder camera
- Screen proof
- Se’kret Bip character story
- Kinetic text
- Hybrid founder + product + story

For Se’kret Bip, current canon is required: Night left, Suhana center, Sy right, Cloud companion, approved parent and family designs, and no unapproved name, face, costume, relationship, or character-role drift.

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

Use Se’kret Bip PR #599 and merge commit `f4573d360a8fea99b301f33a2a21192525725f7b` to produce:

- one 15-second teaser;
- one 30-second founder-build Reel;
- one 45–60-second proof/story version;
- Instagram, TikTok, YouTube Shorts, and Facebook Reel variants;
- one cover concept;
- one voiceover;
- one production manifest;
- one complete proof bundle.

## Completion gate

The project is not complete until one real invocation can be linked to:

- reachable deployed Founder Signal Engine bridge;
- invocation receipt;
- matching Zapier run ID;
- verified OpenAI output;
- approved voice and visual assets;
- Canva or equivalent render artifact;
- platform-specific review artifacts;
- scheduling or publication receipts for each target channel;
- separately authorized HubSpot evidence;
- Founder Control Room proof.
