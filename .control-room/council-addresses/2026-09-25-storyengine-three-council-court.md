# Council Address — StoryEngine Three-Council Court

Status: founder-addressed proposal for Council deliberation
Date: 2026-09-25
Authoritative control room: `jussray/founder-control-room`
Observed FCR main before address: `0d9b09613cf60c432743635fcdf6633ca86dd7be`
Owning product for implementation: `jussray/StoryEngine`
Authority ceiling: advise, challenge, reconcile, and specify. Do not merge, deploy, publish, spend, or mutate StoryEngine production from this address alone.

This Court address also inherits `docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md`. The Court may discover a repeatable creative workflow, but the durable product surface belongs in FCR/StoryEngine. Court deliberation must not become a permanent chat ritual or a fourth execution authority plane.

## Founder address

Council,

StoryEngine is being shaped as a creator-first environment where structure accelerates expression but never traps the creator. The user-facing product must preserve freedom to express, revise, override, combine, or completely redirect a project at any stage.

The current StoryEngine interaction canon includes:

- StoryEngine is what creators see; L99 remains backstage infrastructure.
- The front door is cinematic and minimal: `What do you want to create?`, one Base Context creative canvas, and `Begin creating`.
- The Base Context is durable creative intent, not disposable prompt text.
- The next screen shapes the idea while preserving the Base Context visibly.
- Structured choices must provide escape hatches: presets for speed plus `Other` / `Custom` / free-text input where the creator may need language outside the preset set.
- For `What should it feel like?`, include `Other` and reveal a free-text field such as `Describe the feeling you want…`.
- Important creative choices remain editable later. No early selection should silently become a permanent lock.
- The permanent UX principle is: **Structure should accelerate expression, never restrict it.**

## Proposal: three domain councils under FCR

Create three distinct StoryEngine domain councils that remain governed by the existing Founder Council contract rather than becoming separate authority planes.

### 1. Writers Council

Jurisdiction: story craft and reader experience.

This council must not be limited to famous writers. It should be capability-based and dynamically staffed from roles such as:

- Story Architect
- Developmental Editor
- Scene Writer
- Character Editor
- Dialogue Specialist
- Worldbuilder
- Genre Specialist
- Audience / age specialist
- Line Editor
- Research Editor
- Continuity Editor
- Screenwriter
- Comics writer
- Narrative game designer
- Lyricist / poet
- Publishing / commercial reader
- Beta / first-reader lens
- optional historical-author craft lenses used as principles, not imitation targets

Primary question: **Does this work as a story for this creator, medium, audience, and intent?**

### 2. AI Council

Jurisdiction: reasoning quality, evidence, model/tool routing, independent challenge, and reconciliation.

Use the existing FCR Founder Council membership and capability market. Eligible seats may include ChatGPT/Codex, Claude/Claude Code/Cowork, Gemini, Perplexity, Muse, DeepSeek, local models, and future providers when current FCR policy and verified capability evidence allow.

Stable functional roles matter more than provider brands:

- primary thinker
- independent thinker
- researcher
- critic
- synthesizer
- model router

Primary question: **Are we reasoning well, using the right evidence and tools, preserving uncertainty, and considering stronger alternatives?**

A provider seat is `live` only when its actual connector/API/runtime call is verified. Simulated roles must be labeled simulated.

### 3. Production Council

Jurisdiction: turning imagination into coherent visual, audio, and video media.

Seats may include:

- Creative Director
- Art Director
- Cinematographer
- Storyboard Artist
- Production Designer
- Character / continuity guardian
- Image-generation specialist
- Video-generation specialist
- Motion Director
- Editor
- Sound Designer
- Voice Director
- Caption / typography specialist
- Media Router
- `/MAKEVIDEO`
- `/LEEVIZE`
- visual canon / continuity system

Primary question: **Can this idea become a coherent media experience without losing the creator's intent or story truth?**

## Court behavior

When a consequential creative decision crosses jurisdictions, convene the smallest relevant combination of the three councils as a **Court**.

Do not wake every seat for every task. Route by the decision being made.

Examples:

- THINK / IMAGINE: AI Council + Writers Council lead, Production lightweight unless needed.
- WRITE: Writers Council leads; AI Council challenges/researches; Production joins only when the writing has material visual/audio consequences.
- VISUALIZE: Production Council leads; Writers protects story meaning and canon; AI handles multimodal comparison, evidence, and routing.
- `/MAKEVIDEO`: full three-council Court when the task is substantial.

## Independent-first deliberation

Each council should form its first findings independently enough to reduce anchoring and fake consensus.

Then reconcile:

`CREATOR INTENT -> BASE CONTEXT + PROJECT CANON -> RELEVANCE ROUTER -> INDEPENDENT COUNCIL FINDINGS -> /DEVIL CROSS-EXAMINATION -> DISSENT + CONTRADICTIONS -> SYNTHESIS -> CREATOR RULING -> EXECUTION -> VERIFY -> LEARN`

Agreement is not proof.

## /DEVIL

`/DEVIL` is the Court's cross-examination pass, not a fourth authority plane.

It must attack at least:

- whether the Court is solving the wrong problem;
- whether a beautiful output weakened the story;
- whether the AI invented or drifted canon;
- whether a writer/editor is protecting convention instead of creator intent;
- whether tool availability is steering the creative decision;
- whether the creator needs an option that the presets do not provide;
- whether apparent consensus is merely shared anchoring;
- whether the simplest creative path was overlooked.

## Creator authority and freedom

The creator remains the ruling authority for creative choices.

Every meaningful Council recommendation should preserve user escape routes such as:

- Accept
- Keep mine
- Blend
- Try another direction
- Ask another council
- Challenge the ruling
- Custom direction / free text

Council recommendations may expand options and identify risks. They may not silently narrow creator authority.

**Court invariant: the councils expand possibility; the creator makes the ruling.**

## Tool and authority boundary

LLMs, MCPs, SDKs, databases, memory systems, media routers, and model runtimes are capabilities, not authority.

`tool capability != permission`

MCP may expose Story Memory, project files, research, GitHub, approved data, media assets, and publishing/export capabilities according to policy. Access to a capability never authorizes canon mutation, publication, spend, deploy, deletion, or cross-project writes.

Provider credentials remain provider-scoped capability. An OpenAI or Anthropic API key does not become GitHub, Supabase, publishing, or unrelated service authority merely because the provider can reason about those systems.

## Court workflow graduation

A Court session remains one-off deliberation unless the pattern proves reusable.

When the same jurisdiction routing repeatedly serves a stable creator outcome, Chief may compile it into a `juss/fcr-workflow-candidate@v1` for FCR/StoryEngine. The candidate must preserve:

- plain user-facing outcome label;
- Base Context and project canon boundaries;
- smallest relevant Court quorum;
- independent-first findings;
- `/DEVIL` cross-examination;
- creator override/ruling;
- real-vs-simulated provider labels;
- required proof;
- privacy/cost limits;
- failure/stop behavior; and
- rollback without damaging the creator's project or canon.

The creator should not have to type the internal Court stack every time. The graduated workflow owns that composition behind the product surface.

Productization never authorizes publication, canon mutation, spend, deploy, or other separately gated action and never removes creator ruling.

## Proposed StoryEngine court receipt

For substantial sessions, leave a compact receipt:

```text
COURT SESSION
Project:
Creative intent:
Decision:

WRITERS
recommendation:
dissent:

AI
recommendation:
evidence:
uncertainty:

PRODUCTION
recommendation:
continuity risks:

DEVIL
strongest challenge:

CREATOR RULING
chosen direction:
rejected options:
custom instruction:

CANON EFFECT
none / proposed / approved:

WORKFLOW
one-off / existing workflow id / candidate id:
public outcome:
graduation evidence:

NEXT ACTION
...
```

## Council questions

Please deliberate and return one FCR synthesis packet using the existing Council output contract:

- `REALITY`: what existing FCR/StoryEngine architecture already supports this without duplication?
- `COUNCIL`: strongest arguments from Writers, AI, and Production jurisdictions, including dissent.
- `FIX`: the smallest reversible implementation that makes the three-council Court real in StoryEngine while keeping FCR as authority/control plane.
- `PROOF`: exact evidence required to prove routing, creator override, free-text escape hatches, canon protection, and real-vs-simulated provider labels.
- `RISK`: orchestration bloat, cost/latency, fake consensus, over-editing, voice flattening, provider lock-in, canon corruption, user trapping, and any additional failure modes discovered.
- `ROLLBACK`: how to disable Court routing without damaging a creator's project or canon.
- `NEXT GATE`: one exact founder decision or smallest implementation action.
- `WORKFLOW`: whether this remains one-off, maps to an existing FCR workflow, or should become a Chief-compiled workflow candidate.

Do not treat this address as merge/deploy approval. Do not create duplicate authority systems. Prefer extension of FCR's resident Council, capability market, task routing, receipts, StoryEngine's existing memory/canon paths, and the shared work-productization contract.
