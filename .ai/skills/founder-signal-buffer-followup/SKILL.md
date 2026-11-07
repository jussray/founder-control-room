---
name: founder-signal-buffer-followup
description: Create a truthful build-in-public follow-up asset and hand it to the existing Founder Signal Engine Buffer draft-only review lane without publishing.
version: 1.1.0
scope: founder-control-room
status: candidate
---

# Founder Signal Engine — Buffer Test Follow-Up

## Trigger
Use when the founder asks to follow up a Buffer test, make a FCR / PromptOS build-in-public reel, or turn a proven engineering event into a Buffer review draft. This skill is an execution checklist **under** `AGENTS.md`, the Founder Signal Engine contract, `docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`, and the current `config/buffer-provider-contract.json`. A skill is not a provider permission grant.

## Actual outcome
Create a usable, vertical 10-second reel (MP4 + cover), accurate channel caption, source/claim ledger, media file SHA-256, and an optional **verified Buffer Drafts** receipt if a separately authorized live connector is available. Deliver the local assets even when the provider is unavailable; never pretend the draft was sent.

## Run sequence
1. **Scope and provenance:** identify the user's authorized repo, exact source commit, public-safe proof URL and real date of the referenced test. A user's statement that a test was posted is user-reported until platform readback confirms it.
2. **Skills:** apply `skills/outcome-first/SKILL.md`, `skills/fact-check-every-claim/SKILL.md`, the existing `.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md` for ChatGPT without native Zapier access, and the media/visual and founder-control-room operator rules when relevant.
3. **Script:** first 0–3 seconds introduces why the test was made; 3–10 seconds shows only authentic, authorized screens or original graphics labeled as illustrations. If the real camera/Buffer recordings are unavailable, HOLD the reel rather than substitute synthetic scenery, simulated dashboard content, AI-generated founder speech, or typography-only slides.
4. **Caption:** describe the workflow as a goal or review-draft capability until current provider and platform receipts prove real automation. End with a specific audience question. Never claim that FCR or PromptOS auto-posts unless independently verified.
5. **Media validation:** render and decode an MP4, inspect representative frames, verify 9:16 orientation and approximately 10-second duration, calculate SHA-256, and reject any screen showing tokens, private data, dashboards, customer details or unrelated project content. Verify media rights/approvals separately; a hash is not a license.
6. **Handoff:** use only the existing authenticated FCR Founder Signal Engine bridge and its source/content/authorization firewall. The authoritative contract currently requires explicit Buffer provider `method: draft`, `saveToDraft: true`, `publish_allowed: false` and no schedule. Do not call a Buffer action directly to bypass FCR.
7. **Provider proof:** after an authorized call, obtain the real Buffer draft ID, channel, exact submitted text and media reference, and independent Drafts readback. If the bridge or provider is absent, keep `provider_status: UNKNOWN`; create no fake ID, schedule or publication receipt.
8. **Stop:** deliver the local media and caption; leave any verified draft for founder review. Do not publish, share-now, queue, schedule, merge, deploy, alter grants, or spend based on this skill alone.

## Free-first video production: no subscription

Use this **first-party, local-process** implementation for a Buffer/FCR footage follow-up:

```bash
node scripts/free_buffer_video.mjs   --intro /approved/actual-camera.mp4   --screen /approved/real-buffer-screen.mp4   --voiceover /approved/recorded-voiceover.m4a   --world /approved/jussco-world.png   --output /local/fcr-buffer-reel.mp4
node --test scripts/test_free_buffer_video.mjs
```

Omit `--voiceover` only when the real screen recording already has audio. Omit `--world` if the brand-approved still is not available; use the **real screen capture** as backdrop. No subscription or provider generation credit is required for this FFmpeg operation. Local compute and storage still have costs.

Do not use the old synthetic Pillow/NumPy mountains, generic DejaVu title slides, faux Buffer interface, or fabricated voice bed. The FCR `FfmpegTimelineSpec` timeline renderer is for **graphic animation**, not a replacement for authentic footage. StoryEngine /LEEVIZE and other render workers remain separately governed; use them only after checking available runtime, canon, rights and cost approval. Match the previously founder-approved YouTube visual references when real assets are available; never invent the style by assertion.

The renderer produces H.264/AAC MP4 with decoded output verification, file hashes, required privacy/visual/rights review, and `publish_authority: false`. Its regression tests use **synthetic fixtures solely for testing**, never as promotional footage. Do not infer brand approval from successful encoding. Publish remains blocked until native Buffer and Facebook receipt correlation, explicit founder release approval, and the current publication authority gates.

## Evidence packet
Record `asset_sha256`, `asset_duration_seconds`, `asset_dimensions`, `source_repository`, `source_commit_sha`, `claim_status`, `connector_status`, `buffer_draft_id` (null unless read back), `public_post_url` (null absent platform proof), `owner_review_required: true`, and `next_gate`.

## Negative controls
- Simulated Buffer dashboard or invented test post: HOLD.
- Missing or unverified test date: remove yesterday/today language; HOLD claims of prior publication.
- Auto-post wording with no live proof: rewrite to **working toward draft-assisted updates**.
- Provider method queue, schedule, publish or implicit default: DENY.
- Draft API accepted without provider-native draft readback: UNKNOWN, not delivered.
- Founder silence or skill invocation: NEVER publication authority.

## Relationship to existing work
Use the campaign planner and media review from PR #1027 where available. Preserve its open-PR continuity and conflict gates; do not fork a new publication engine. This skill does not supersede the current live authority contract.
