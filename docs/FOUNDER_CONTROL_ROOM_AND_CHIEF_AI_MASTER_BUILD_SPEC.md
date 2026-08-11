# Founder Control Room + Chief AI
## Canonical Codex Master Build Specification
Version: 1.1
Date: 2026-07-30
Reality refresh: 2026-08-11
Owner: Juss Ray
Repository: `jussray/founder-control-room`
Target branch: `main` through focused branches and pull requests

---

## 0. Build Command

Codex must treat this document as the canonical implementation contract for the complete Founder Control Room and Chief AI build.

The system is not a demo. It is a production control plane and orchestration layer for a solo founder managing multiple repositories, products, automations, launch surfaces, family constraints, and sensitive information.

Build both tracks in parallel:

1. **Founder Control Room**: authority, project truth, approvals, missions, evidence, guarded execution, release truth, provider boundaries, and rollback.
2. **Chief AI**: friend intake, context retrieval, decision compression, tiny moves, tone guard, FutureYOU, PromptOS, memory, content intelligence, social strategy, image direction, and governed orchestration.

Neither subsystem may bypass the other:
- Chief AI proposes, explains, compresses, drafts, and routes.
- Founder Control Room decides authority, records proof, gates writes, and preserves rollback.
- All material actions receive provenance and exact evidence.
- No approval silently carries forward.
- No "green" claim without proof.
- No secrets in source, prompts, logs, screenshots, or artifacts.
- No deletion by default.
- Playwright evidence is required for user-facing web/runtime paths.

---

## 1. Product Thesis

Founder Control Room is the command center Juss uses to run Se'kret Bip and future ventures without needing a full DevOps, QA, release-management, product-operations, or CTO staff.

Chief AI is the orchestration and decision-compression layer that helps Juss think, remember, prioritize, draft, and move one useful thing forward despite limited time, low energy, interruptions, and multiple concurrent projects.

Together they form a founder operating system:

```text
Raw life + business signal
-> Chief AI understands and compresses
-> Founder Control Room checks authority and truth
-> Provider adapters perform bounded work
-> Evidence returns to the Control Room
-> Chief AI explains the result and proposes the next tiny move
```

The product must feel like an intelligent command deck, not a generic admin panel and not a chatbot with scattered buttons.

---

## 2. Canonical Operating Stack

Every material task follows:

```text
Goal
-> Reality
-> Redteam I
-> Lindy
-> L99
-> Redteam II
-> OODA
-> Bill Gates
-> Elon Musk
-> Proof
-> Rollback
-> Next Gate
```

Additional prompt modes are skills, not magical incantations:

- `/truthmode`
- `/confess`
- `/ultrathink`
- `/goalfix`
- `/goal`
- `/loop`
- `/resume`
- `/plan`
- `/compact`
- `/btw`
- `/effort`
- `/caveman`
- `/v10`
- `/insights`
- `/Hormozi`
- `/unlearn`
- `/human`
- `80/20`
- `FutureYOU`
- `Antiadvice`
- `First principles`
- `YCOMBINATOR`
- `SOCRATES`
- `/garyvee`
- `lindymode`
- `redteam`
- `l99`
- `ooda`
- `/sales`
- `/devil`

Each mode must be represented by:
- a versioned skill definition;
- trigger aliases;
- input schema;
- output schema;
- allowed tools;
- authority level;
- privacy class;
- stop condition;
- verification requirement;
- prompt ID and version;
- tests.

Do not implement slash commands as unvalidated free-text prompt concatenation.

---

## 3. Current Repository Reality

As of the 2026-08-11 reality refresh, the existing repository already contains:
- TypeScript with Node 20+ support and Node 24 CI/deployment paths;
- Express API and Cloudflare Worker runtime surfaces;
- a founder-facing browser UI under `public/control-room/`;
- Supabase integration;
- GitHub provider abstraction;
- Cloudflare Workers and Pages deployment paths;
- founder magic-link authentication;
- founder allowlist;
- guarded exact-head terminal execution;
- approval reservations and founder approval receipts;
- missions and change proposals;
- MCP Hub and bounded provider capabilities;
- Cloudflare reasoning;
- FutureYOU verification surfaces;
- Goalfix verification surfaces;
- Design OS;
- Vitest and Playwright verification;
- explicit founder approval, merge-authority, provenance, rollback, and L99 contracts.

The web frontend is no longer a future-only requirement. The current browser surface must be preserved and evolved incrementally while the longer-term modular web architecture is introduced. Do not remove or broadly rewrite the working UI merely to satisfy the folder layout proposed later in this document.

Guarded execution existing in the repository does not create blanket mutation authority. Terminal runs, repository writes, merges, deployments, migrations, provider actions, publication, sending, destructive operations, and credential changes remain subject to their exact policy, evidence, and founder-authority gates.

Repository code, exact branch/SHA, tests, provider state, and runtime observation outrank stale phase descriptions in this document. When implementation truth advances, update this reality section and affected governing contracts rather than forcing current code back into an obsolete description.

---

## 4. System Boundary

### 4.1 Founder Control Room owns

- founder authentication and sessions;
- portfolio registry;
- repository/provider state;
- missions;
- change proposals;
- approval requests and reservations;
- exact-head verification;
- evidence records;
- release truth;
- incident classification;
- provider capability policy;
- guarded terminal execution;
- deployment and rollback gates;
- audit timeline;
- secrets policy;
- high-risk action confirmation;
- human-readable Reality / Fix / Proof / Risk / Rollback / Next Gate reports.

### 4.2 Chief AI owns

- friend intake via text and voice;
- transcript handling;
- episodic memory;
- related-memory retrieval;
- Mirror Engine;
- Intention Finder;
- Tiny Move Maker;
- Tone Guard;
- FutureYOU;
- PromptOS and skill registry;
- content strategy and calendar generation;
- social performance analysis;
- founder voice preservation;
- image-editing prompt direction;
- orchestration recommendations;
- nudge proposals;
- explanation and decision compression;
- routing proposals to Founder Control Room.

### 4.3 Shared services

- prompt registry;
- model registry;
- provenance;
- redaction;
- policy evaluation;
- event bus;
- idempotency;
- audit logs;
- evidence store;
- feature flags;
- privacy classification;
- rate limits and cost budgets;
- notification scheduler;
- provider adapters;
- observability.

---

## 5. Architecture

Use a modular monolith first. Preserve the ability to separate services later.

```text
apps/
  api/                       # target modular boundary for existing Express/Worker API surface
  web/                       # target modular boundary for Founder Control Room + Chief AI UI
packages/
  contracts/                 # schemas and shared API types
  authority/                 # L99 policy, approvals, risk, reservations
  evidence/                  # evidence objects, hashes, freshness
  chief-ai/                  # orchestration domain
  prompt-os/                 # prompt and skill registry
  memory/                    # episodic/semantic memory contracts
  content-engine/            # social strategy, calendar, analysis
  image-director/            # image edit specifications and QA
  provider-adapters/         # GitHub, Supabase, Cloudflare, HubSpot, Slack, etc.
  ui/                        # design tokens and reusable components
public/
  control-room/              # current founder-facing browser UI; preserve during incremental migration
src/                         # current API/domain implementation; retain compatibility while migrating incrementally
supabase/
  migrations/
e2e/
docs/
artifacts/
```

Do not perform a broad folder migration in the first patch. Introduce packages incrementally and preserve imports and the working `public/control-room/` surface until focused tests and Playwright prove each migrated boundary.

---

## 6. Core Data Model

Use UUID primary keys, `created_at`, `updated_at`, actor ID, privacy class, and provenance references where applicable.

### 6.1 Founder and portfolio

- `founder_users`
- `founder_profiles`
- `projects`
- `project_providers`
- `provider_connections`
- `capabilities`
- `feature_flags`

### 6.2 Missions and authority

- `missions`
- `mission_steps`
- `change_proposals`
- `approval_requests`
- `approval_executions`
- `action_idempotency`
- `terminal_runs`
- `release_markers`
- `incidents`
- `rollback_plans`

### 6.3 Evidence and provenance

- `evidence_records`
- `evidence_artifacts`
- `provenance_events`
- `model_invocations`
- `prompt_versions`
- `policy_decisions`
- `audit_events`

### 6.4 Chief AI and memory

- `intake_sessions`
- `episodic_memories`
- `memory_embeddings`
- `memory_links`
- `mirror_outputs`
- `intent_classifications`
- `tiny_moves`
- `tone_guard_outputs`
- `futureyou_snapshots`
- `nudge_schedules`
- `chief_ai_runs`

### 6.5 Content and images

- `content_strategies`
- `content_pillars`
- `content_calendar_items`
- `content_drafts`
- `content_metrics`
- `content_analyses`
- `image_jobs`
- `image_edit_specs`
- `image_assets`
- `image_qa_results`

### 6.6 Privacy classes

```text
public
internal
confidential
family_sensitive
teen_sensitive
legal_sensitive
credential
```

Credential content must never be stored as normal memory or prompt content.

---

## 7. API Contracts

All request bodies must be validated with a shared schema library. Use consistent envelopes.

### 7.1 Response envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601",
    "provenanceId": "uuid|null"
  },
  "error": null
}
```

### 7.2 Friend intake

#### `POST /api/chief/intakes`

Request:
```json
{
  "inputType": "text",
  "text": "raw founder input",
  "audioAssetId": null,
  "timeEnergyContext": {
    "availableMinutes": 10,
    "energy": "low",
    "device": "phone",
    "interruptible": true
  },
  "privacyClass": "confidential"
}
```

Response:
```json
{
  "data": {
    "intakeId": "uuid",
    "status": "accepted",
    "transcript": "raw founder input"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-07-30T17:00:00Z",
    "provenanceId": "uuid"
  },
  "error": null
}
```

For audio, accept a pre-uploaded asset ID. Do not place large binary payloads in JSON.

#### `POST /api/chief/intakes/:intakeId/process`

Runs:
1. transcription if required;
2. redaction and privacy classification;
3. memory storage;
4. related-memory retrieval;
5. Mirror Engine;
6. Intention Finder;
7. Tiny Move Maker;
8. Tone Guard when a script exists;
9. provenance and evidence capture.

Response:
```json
{
  "data": {
    "headline": "I’m building the machines around what actually matters",
    "summary": "Three sentences maximum.",
    "intentTags": ["money", "build"],
    "tinyMove": {
      "id": "uuid",
      "actionText": "Send the focused founder-to-founder reply.",
      "script": "Copy-ready message or null.",
      "timeEstimateMinutes": 7,
      "goal": "money",
      "confidence": 0.82,
      "status": "proposed"
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-07-30T17:00:00Z",
    "provenanceId": "uuid"
  },
  "error": null
}
```

### 7.3 Tiny moves

- `GET /api/chief/tiny-moves`
- `GET /api/chief/tiny-moves/:id`
- `POST /api/chief/tiny-moves/:id/start`
- `POST /api/chief/tiny-moves/:id/complete`
- `POST /api/chief/tiny-moves/:id/dismiss`
- `POST /api/chief/tiny-moves/:id/request-nudge`

A request nudge creates a proposal. Scheduling remains a separately authorized action.

### 7.4 Chief AI run inspection

- `GET /api/chief/runs/:id`
- `GET /api/chief/runs/:id/provenance`
- `POST /api/chief/runs/:id/replay-preview`

Replay preview must not perform provider writes.

### 7.5 Prompt and skill registry

- `GET /api/prompt-os/skills`
- `GET /api/prompt-os/skills/:slug`
- `POST /api/prompt-os/skills/:slug/preview`
- `POST /api/prompt-os/skills/:slug/run`
- `GET /api/prompt-os/prompts/:promptId/versions`
- `POST /api/prompt-os/prompts/:promptId/compare`

Every run returns prompt version, model, token/cost metadata when available, privacy class, and policy decision.

### 7.6 Founder Control Room dashboard

- `GET /api/control-room/overview`
- `GET /api/control-room/projects`
- `GET /api/control-room/projects/:slug`
- `GET /api/control-room/approvals`
- `GET /api/control-room/evidence`
- `GET /api/control-room/incidents`
- `GET /api/control-room/timeline`

### 7.7 Missions

- `POST /api/control-room/missions`
- `GET /api/control-room/missions/:id`
- `POST /api/control-room/missions/:id/plan`
- `POST /api/control-room/missions/:id/run-check`
- `POST /api/control-room/missions/:id/request-approval`
- `POST /api/control-room/missions/:id/rollback-preview`

### 7.8 Image director

- `POST /api/images/jobs`
- `GET /api/images/jobs/:id`
- `POST /api/images/jobs/:id/spec`
- `POST /api/images/jobs/:id/submit`
- `POST /api/images/jobs/:id/qa`
- `POST /api/images/jobs/:id/approve`

Request:
```json
{
  "useCase": "linkedin_post",
  "assetId": "uuid",
  "operation": "background_replace",
  "keep": [
    "subject identity",
    "facial features",
    "clothing",
    "pose",
    "brand logo"
  ],
  "improve": [
    "background",
    "lighting match",
    "contrast",
    "mobile readability"
  ],
  "style": "premium, modern, photorealistic",
  "aspectRatio": "4:5",
  "text": null,
  "privacyClass": "internal"
}
```

Response includes a normalized edit specification, generated prompt, negative constraints, QA checklist, and provenance.

---

## 8. Chief AI Pipeline

### 8.1 Friend Intake

Inputs:
- `user_id`
- text or audio asset
- time/energy context
- recipient context when relevant
- privacy class

Rules:
- store raw content only when policy allows;
- keep original and redacted forms separately;
- never embed credentials;
- family-, teen-, legal-, and health-adjacent content must use stricter retrieval filters;
- the UI must show what will be remembered before persistence when the setting requires it.

### 8.2 Context Brain

Retrieve 3–5 related memories using hybrid search:
- semantic similarity;
- recency;
- project relevance;
- unresolved thread score;
- privacy compatibility;
- user-pinned importance.

Do not let older memory overwrite the current intake.

### 8.3 Mirror Engine

System prompt:

```text
You are a precise mirror for Juss, a Black woman founder from Philadelphia who is raising eight children and building an ecosystem of AI products.

Preserve her slang, rhythm, directness, and actual meaning.
Do not sanitize her into generic corporate language.
Do not invent ideas, diagnoses, advice, or facts.
Do not expose private family, address, school, legal, or credential details.
Compress only what she said.

Return valid JSON:
{
  "headline": "under 12 words",
  "summary": "three short sentences maximum"
}
```

Input:
```json
{
  "transcript": "latest transcript",
  "relatedMemories": ["bounded memory summaries"]
}
```

### 8.4 Intention Finder

Allowed tags:
- money
- people
- build
- health
- kids
- legal
- rest

Output:
```json
{
  "tags": ["money", "build"]
}
```

Rules:
- 1–3 tags;
- use only the headline and summary;
- do not infer protected attributes;
- return structured JSON.

### 8.5 Tiny Move Maker

System prompt:

```text
Turn the founder's current situation into exactly one realistic action.

The action must:
- take 5–15 minutes;
- move money, people, or a build forward when those goals are present;
- be possible from a phone or home;
- respect low energy and interruptions;
- avoid creating five options;
- include a complete copy-ready script only when relevant;
- preserve facts and voice;
- never bypass an approval, legal, privacy, safety, publishing, credential, or spending gate.

Return JSON only:
{
  "action_text": "string",
  "script": "string or null",
  "time_estimate_minutes": 10,
  "goal": "money | people | build",
  "confidence": 0.0
}
```

### 8.6 Tone Guard

System prompt:

```text
Rewrite the supplied draft in Juss's voice: casual, direct, sharp, funny when appropriate, and strategically protected.

Preserve the actual facts and ask.
Keep slang and edge without threats, self-incrimination, desperation, or oversharing.
Do not expose children's full names, exact addresses, schools, legal-case details, credentials, or private trauma.
Reframe begging as a truthful offer, collaboration, update, or clear request.
Return only the rewritten message.
```

### 8.7 Chief AI orchestrator

The orchestrator:
- accepts a goal or intake;
- resolves the relevant project;
- selects skills;
- assembles context;
- produces a proposed plan;
- sends bounded read requests;
- routes any write action to Founder Control Room approval;
- collects evidence;
- explains the outcome;
- proposes one next gate.

The orchestrator must never directly merge, deploy, publish, send outreach, spend money, mutate production data, or rotate credentials without the exact Founder Control Room gate.

---

## 9. PromptOS Skill Contracts

### 9.1 `/goalfix`

Mission:
Find the real blocker, make the smallest reversible repair, verify the real path, and report evidence.

Required preflight:
- authoritative repo;
- target branch;
- current goal;
- suspected failure area;
- exact files/logs needed first;
- stop condition.

Required output:
```text
REALITY:
FIX:
PROOF:
RISK:
ROLLBACK:
NEXT GATE:
```

### 9.2 `/confess`

Purpose:
Separate what is verified, inferred, unknown, blocked, attempted, and failed.

Output:
```json
{
  "verified": [],
  "inferred": [],
  "unknown": [],
  "blocked": [],
  "failedAttempts": [],
  "nextEvidenceNeeded": []
}
```

### 9.3 `/truthmode`

Purpose:
Remove inflated claims and force evidence-linked language.

Rules:
- never convert compilation into runtime proof;
- never convert provider metadata into workflow execution proof;
- never convert screenshots into backend proof;
- never call a task done while a required gate is pending.

### 9.4 `/ultrathink`

Purpose:
Use high reasoning effort for architecture, risk, cross-system dependencies, and high-cost decisions.

It does not grant more authority.

### 9.5 `/plan`

Before material changes, return:
- files;
- reason;
- sequence;
- risks;
- verification;
- rollback;
- approval gate.

### 9.6 `/compact`

Create a structured state capsule:
- goal;
- completed;
- current branch/SHA;
- unresolved;
- evidence;
- decisions;
- next gate.

### 9.7 `/resume`

Load the latest state capsule and re-observe live truth before continuing.

### 9.8 `/btw`

Create a side thread that does not mutate the active mission state unless explicitly promoted.

### 9.9 `/loop`

Create a conditional or recurring observation, not an execution loop. Minimum cadence is platform-constrained. It must not repeatedly trigger risky writes.

### 9.10 `/goal`

Persist a finish line with machine-checkable acceptance criteria. A goal may span turns, but each action still obeys authority gates.

### 9.11 `/effort`

Accepted values:
- low
- medium
- high
- max

Effort changes reasoning budget, not safety or authority.

### 9.12 Strategic lenses

Implement reusable lenses:
- Hormozi: offer, value equation, proof, friction.
- Unlearn: identify inherited assumptions.
- Human: plain language and realistic behavior.
- 80/20: smallest action with disproportionate value.
- FutureYOU: compare current action to stated future.
- Antiadvice: identify what not to do.
- First principles: decompose constraints.
- Y Combinator: user need, speed, learning, traction.
- Socrates: expose assumptions through questions.
- Gary Vee: distribution and documenting.
- Lindy: prefer durable primitives.
- Redteam: attack premise and selected plan.
- L99: authority, state, evidence, rollback, compounding value.
- OODA: observe, orient, decide, act, re-observe.
- Sales: strongest truthful exchange.
- Devil: commercial premise and plan attack.

---

## 10. Complete UI Surface

Build mobile first, then responsive desktop.

### 10.1 App shell

- left navigation on desktop;
- bottom navigation on mobile;
- command palette;
- global search;
- current project selector;
- founder identity/session;
- privacy indicator;
- connection health;
- active mission banner;
- evidence freshness indicator.

### 10.2 Home / Command Deck

Cards:
- Today’s one move;
- active missions;
- approval queue;
- release truth;
- failing or blocked checks;
- unread provider events;
- Chief AI intake;
- content engine status;
- scheduled nudges;
- recent evidence.

### 10.3 Chief AI / Friend Mode

- large voice/text intake;
- live transcription;
- “remember this” controls;
- related memory chips;
- mirror headline and summary;
- intent tags;
- exactly one tiny move;
- copy-ready script;
- start / complete / dismiss / request nudge;
- provenance drawer;
- privacy warning when sensitive content is detected.

### 10.4 Missions

- create mission;
- goal and stop condition;
- authoritative repo/branch/SHA;
- plan;
- step state;
- evidence;
- risk;
- rollback;
- next gate;
- exact approved commands.

### 10.5 Projects

Per-project:
- repo/provider state;
- branch and SHA;
- open PRs;
- deployments;
- runtime health;
- incidents;
- missions;
- capabilities;
- secrets readiness without exposing values;
- related content and launch work.

### 10.6 Approvals

- human-readable action;
- exact payload;
- target;
- branch/SHA;
- risk;
- evidence freshness;
- rollback;
- approve once;
- reject;
- expire;
- no blanket approval.

### 10.7 Evidence Room

- filters by project, mission, provider, evidence type, SHA, date;
- side-by-side claims and proof;
- screenshots, logs, traces, test results;
- freshness;
- integrity hash;
- provenance chain;
- unsupported-claim detection.

### 10.8 PromptOS

- skill catalog;
- prompt versions;
- input/output schemas;
- allowed tools;
- risk class;
- test fixtures;
- preview;
- compare versions;
- promote or retire with approval.

### 10.9 Memory

- episodic timeline;
- project-linked memories;
- pinned truths;
- stale/contradicted flags;
- privacy classes;
- edit;
- forget;
- export;
- no hidden irreversible memory.

### 10.10 Content Studio

- strategy architect;
- content pillars;
- 30-day calendar;
- post creator;
- short-video script;
- community system;
- performance analyzer;
- evidence-backed build-in-public drafts;
- review-only publishing queue.

### 10.11 Image Studio

- upload/select asset;
- operation selector;
- platform/use case;
- Keep / Improve / Style / Quality fields;
- aspect ratio;
- safe-margin preview;
- generated edit prompt;
- negative constraints;
- before/after;
- QA checklist;
- approve or reject.

### 10.12 FutureYOU

- future-state goals;
- current actions;
- drift warnings;
- weekly review;
- one correction;
- confidence and evidence.

### 10.13 Settings

- providers and connection state;
- model routing;
- cost budgets;
- privacy defaults;
- memory behavior;
- notification preferences;
- feature flags;
- audit export.

---

## 11. Image Editing System

### 11.1 Universal schema

```json
{
  "useCase": "platform or business use",
  "keep": ["elements that cannot change"],
  "improve": ["specific modifications"],
  "style": "visual direction and mood",
  "qualityRequirements": ["objective acceptance criteria"],
  "negativeConstraints": ["what must not happen"],
  "aspectRatio": "4:5",
  "safeMargins": true
}
```

### 11.2 Operations

1. Premium enhancement
2. Background replacement
3. Social engagement redesign
4. Studio-quality transformation
5. Object removal
6. Image expansion / outpainting
7. Professional typography
8. Cinematic treatment
9. Infographic conversion
10. Original concept redesign

### 11.3 Prompt templates

#### Premium enhancement

```text
Enhance this image while preserving the original subject, composition, colors, and overall style.

Increase sharpness, improve lighting, optimize contrast, boost clarity, expand dynamic range, and refine fine details. Remove noise, compression artifacts, and minor imperfections while maintaining a natural, realistic appearance.

The result must be high-resolution and professionally retouched without overprocessing, oversharpening, identity drift, or obvious AI artifacts.
```

#### Background replacement

```text
Replace the current background with a clean, modern environment that complements the subject.

Keep the subject unchanged, including identity, facial features, clothing, body proportions, colors, expression, and pose.

Match lighting, shadows, reflections, perspective, depth of field, and color grading. Avoid cutout edges, mismatched light, unrealistic shadows, warped anatomy, or artificial compositing.
```

#### Social engagement redesign

```text
Redesign this image for the selected social platform while preserving the subject, message, and brand identity.

Improve hierarchy, typography, contrast, spacing, alignment, composition, and focal emphasis. Optimize for mobile readability, safe margins, and comprehension within three seconds.

Keep the design modern, uncluttered, distinctive, and platform-ready.
```

#### Studio-quality transformation

```text
Transform this image into a professional studio photograph while preserving identity, proportions, expression, and natural appearance.

Use refined studio lighting, realistic shadows, balanced contrast, natural color, crisp detail, and a premium background. Avoid plastic skin, false texture, anatomy changes, or artificial effects.
```

#### Object removal

```text
Remove only the specified object or objects. Preserve the subject, composition, lighting, colors, textures, perspective, and all unrelated elements.

Reconstruct the missing area naturally. Avoid repeating patterns, blurry patches, seams, ghosting, or accidental removal of nearby details.
```

#### Image expansion

```text
Expand the image to the selected aspect ratio while preserving the original subject and quality.

Extend the environment with consistent lighting, texture, perspective, depth, and visual flow. Reserve requested negative space for text or logos. Avoid stretching, repeated motifs, distorted objects, or visible transitions.
```

#### Professional typography

```text
Add the supplied text with strong hierarchy, spacing, alignment, safe margins, and mobile readability.

Do not cover the main subject. Use typography that fits the brand and image. Check spelling exactly. Avoid excessive copy, weak contrast, edge collisions, and random decorative fonts.
```

#### Cinematic treatment

```text
Create a cinematic treatment while preserving identity and realism.

Use motivated highlights and shadows, stronger depth, refined dynamic range, premium color grading, realistic skin tones, and coherent atmosphere. Avoid crushed blacks, radioactive saturation, fake lens effects, or identity drift.
```

#### Infographic conversion

```text
Convert the content into a modern infographic with a clear information hierarchy.

Use sections, icons, labels, arrows, callouts, numbered steps, concise text, alignment, and mobile readability. Every visual element must increase comprehension. Avoid dense paragraphs, decorative clutter, and unsupported claims.
```

#### Original concept redesign

```text
Create a completely original design that preserves the message, objective, and audience while changing the execution.

Do not replicate the source layout, palette, typography, graphics, composition, or distinctive visual expression. Build a fresh direction with stronger hierarchy, readability, and brand fit.
```

### 11.4 Image QA

Automated checks where possible:
- requested aspect ratio;
- resolution threshold;
- text overflow and safe margins;
- text spelling;
- subject count;
- perceptual similarity for protected identity regions;
- logo preservation;
- prohibited-content policy;
- file integrity.

Human checklist:
- identity unchanged when required;
- no anatomy distortion;
- no cutout halo;
- coherent light and shadows;
- no repeating generated texture;
- mobile readability;
- brand alignment;
- no private information leaked;
- no obvious AI artifact.

---

## 12. Content Engine

### 12.1 Strategy Architect

Input:
- business;
- target audience;
- platforms;
- primary goal;
- current proof;
- constraints.

Output:
- positioning;
- tone;
- three core pillars;
- growth;
- engagement;
- conversion;
- KPIs;
- 90-day plan.

### 12.2 Content Pillar Builder

For five pillars:
- educational ideas;
- entertaining ideas;
- inspirational ideas;
- carousel concepts;
- short-video ideas;
- thread/post ideas;
- common questions;
- CTAs.

### 12.3 30-Day Calendar

Columns:
- Day
- Pillar
- Topic
- Hook
- Format
- Goal
- CTA
- Evidence source
- Status

### 12.4 Post Creator

- curiosity or contrarian hook;
- short paragraphs;
- no fake claims;
- one CTA;
- founder voice;
- proof links or internal evidence references where required.

### 12.5 Short-Form Video

Output:
- Dialogue
- Visuals/B-roll
- opening hook under three seconds;
- pattern interrupts;
- useful middle;
- loop ending;
- CTA.

### 12.6 Community Growth

- daily engagement;
- conversation starters;
- polls;
- stories;
- challenges;
- comment growth;
- follower-to-advocate path;
- private community and newsletter ideas.

### 12.7 Performance Analyzer

Input:
- post text;
- date/time;
- views;
- likes;
- comments;
- shares;
- saves;
- engagement rate;
- follower change;
- link clicks;
- conversions.

Output:
- top-pattern analysis;
- weak-pattern analysis;
- hook findings;
- format findings;
- cadence findings;
- CTA findings;
- audience behavior;
- experiments;
- confidence and data limitations.

---

## 13. Technical Standards

### 13.1 TypeScript

- strict mode;
- no `any` in new domain code without an explicit boundary comment;
- schema validation for all external input;
- exhaustive state handling;
- typed provider interfaces;
- structured errors;
- idempotency for writes;
- cancellation and timeout support;
- redacted logging;
- deterministic tests.

### 13.2 API

- versioned routes when breaking changes appear;
- request IDs;
- rate limiting;
- CSRF/session protection appropriate to deployment;
- secure headers;
- consistent status codes;
- bounded payloads;
- pagination;
- optimistic concurrency for approvals;
- exact SHA for repository writes;
- no arbitrary shell.

### 13.3 Database

- migrations are additive first;
- RLS enabled;
- service-role use server-side only;
- separate Control Room and Se'kret Bip trust boundaries;
- immutable audit events;
- soft deletion where appropriate;
- explicit retention for raw voice and transcripts;
- encrypted object storage for sensitive assets;
- vector storage with privacy filters.

### 13.4 Providers

Every provider adapter declares:
- capabilities;
- read/write classification;
- required credentials by name only;
- cost class;
- rate limit;
- idempotency behavior;
- evidence returned;
- rollback support;
- unavailable/error states.

### 13.5 Models

Use a model router:
- classification: smallest reliable structured-output model;
- mirror/tone: model tested for voice preservation;
- architecture and code planning: high-reasoning model;
- embeddings: approved embedding model;
- transcription: approved speech-to-text provider;
- image generation/editing: approved image model.

Store model aliases in config. Do not hardwire a single provider throughout domain logic.

---

## 14. Security and Privacy

- founder-only routes require authenticated founder and allowlist;
- redact secrets before logging;
- never return service-role keys;
- never store raw connector tokens in the database;
- provider-held references remain opaque;
- sensitive memories cannot cross into public content prompts;
- teen and family data are excluded from marketing automation;
- exact addresses, schools, legal details, and credentials are blocked from Tone Guard output;
- every model call receives the minimum necessary context;
- every write action has a policy decision and audit event;
- image assets preserve privacy class;
- downloadable audit exports must be founder-gated;
- delete/forget actions require explicit confirmation and generate evidence.

---

## 15. Observability and Cost

Record:
- request ID;
- user/founder;
- project;
- mission;
- prompt ID/version;
- model;
- latency;
- token usage;
- estimated cost;
- provider calls;
- policy decision;
- evidence IDs;
- error class.

Dashboard:
- daily model spend;
- provider spend;
- failure rate;
- latency;
- top skills;
- blocked actions;
- stale evidence;
- memory growth;
- content throughput.

Budgets:
- per run;
- per day;
- per provider;
- soft warning;
- hard stop;
- founder override for exact action only.

---

## 16. Verification

### 16.1 Cheapest valid path

1. typecheck touched area;
2. lint touched area;
3. focused unit test;
4. focused integration test;
5. targeted Playwright test;
6. full CI only when needed;
7. deployment/runtime proof only when needed.

### 16.2 Required Playwright journeys

1. Founder signs in and sees Command Deck.
2. Founder submits text Friend Intake and receives mirror + one tiny move.
3. Founder reviews provenance for the tiny move.
4. Founder starts and completes a tiny move.
5. Founder creates a mission with repo, branch, SHA, goal, and stop condition.
6. Founder reviews an approval and cannot approve stale SHA evidence.
7. Founder views Evidence Room and opens a screenshot/log/trace.
8. Founder opens PromptOS and previews a skill without provider writes.
9. Founder creates an image edit specification and verifies safe-margin preview.
10. Founder views a content calendar and opens a draft.
11. Privacy-sensitive input does not leak into a public content draft.
12. Mobile navigation works at phone viewport.
13. Keyboard navigation and visible focus work.
14. Error states explain what is blocked and what evidence is missing.
15. No route exposes a credential value.

Capture screenshots and traces for the principal journeys.

### 16.3 Contract tests

- schema validation;
- authority matrix;
- approval expiration;
- exact-head mismatch;
- idempotent replay;
- prompt JSON output;
- privacy filtering;
- memory retrieval isolation;
- evidence freshness;
- provider unavailability;
- cost budget blocks;
- no-approval-carry-forward.

---

## 17. Implementation Phases

### Phase 0: Truth map

- inspect all relevant current files;
- map existing routes, schemas, migrations, tests, Design OS, FutureYOU, Goalfix, MCP, providers;
- document verified/inferred/unknown/blocked;
- no broad refactor.

Exit:
- architecture delta;
- touched-file plan;
- migration plan;
- acceptance tests.

### Phase 1: Contracts and provenance

- shared schemas;
- prompt registry;
- model invocation records;
- evidence/provenance types;
- Chief AI run state machine;
- privacy classes.

Exit:
- focused tests green.

### Phase 2: Chief AI backend

- intake;
- transcript abstraction;
- memory interface;
- context retrieval;
- Mirror;
- Intent;
- Tiny Move;
- Tone Guard;
- orchestration;
- provenance.

Exit:
- integration test from intake to proposed tiny move.

### Phase 3: Founder web shell

- app shell;
- auth handling;
- Command Deck;
- Chief AI Friend Mode;
- responsive design;
- accessibility.

Exit:
- Playwright sign-in and Friend Intake flows.

### Phase 4: Missions, approvals, evidence

- mission UI;
- approval UI;
- evidence room;
- exact-head freshness;
- rollback preview.

Exit:
- stale evidence and exact-SHA Playwright tests.

### Phase 5: PromptOS and memory

- skill catalog;
- version comparison;
- preview;
- memory timeline;
- pin/edit/forget.

Exit:
- privacy and no-write preview tests.

### Phase 6: Image Studio

- image operation schema;
- prompt generation;
- preview;
- QA;
- artifact storage.

Exit:
- image spec and safe-margin Playwright proof.

### Phase 7: Content Studio

- strategy;
- pillars;
- calendar;
- post;
- video;
- community;
- performance analysis;
- review-only queue.

Exit:
- content draft provenance and privacy isolation tests.

### Phase 8: Provider expansion and automation

- GitHub;
- Cloudflare;
- Supabase;
- HubSpot;
- Slack;
- Gmail;
- Google Calendar;
- Buffer/Zapier through approved contracts;
- notifications and nudges.

Exit:
- provider evidence and failed-provider behavior tests.

### Phase 9: Release hardening

- full accessibility;
- security review;
- performance;
- cost limits;
- data retention;
- disaster recovery;
- CI;
- production deployment gate.

Exit:
- exact-head build, tests, Playwright artifacts, deployment evidence, runtime health, rollback plan.

---

## 18. Codex Work Order

Before editing, Codex must report:

```text
AUTHORITATIVE REPO:
TARGET BRANCH:
CURRENT GOAL:
SUSPECTED FAILURE AREA:
FIRST FILES/LOGS:
STOP CONDITION:
```

Then:

1. Read repository instructions and relevant skills.
2. Inspect the real branch and current HEAD.
3. Separate VERIFIED / INFERRED / UNKNOWN / BLOCKED.
4. Select one phase and one coherent vertical slice.
5. Produce a focused plan listing exact files.
6. Patch only the required files.
7. Add the narrowest useful tests.
8. Run verification from cheapest to most realistic.
9. Use Playwright for user-facing work.
10. Record screenshots/traces/logs.
11. Do not suppress failures.
12. Do not merge until checks and real-path evidence are green.
13. Report only:

```text
REALITY:
FIX:
PROOF:
RISK:
ROLLBACK:
NEXT GATE:
```

---

## 19. First Vertical Slice

Build this first:

```text
Founder signs in
-> opens Chief AI
-> submits a text rant
-> sees mirror headline and summary
-> sees 1–3 intent tags
-> receives exactly one tiny move
-> sees a copy-ready Tone Guard script when relevant
-> opens provenance
-> starts the move
-> marks it complete
-> event appears in Control Room timeline
```

Required backend:
- intake schema;
- Chief AI run state;
- deterministic stub model provider for tests;
- Mirror/Intent/Tiny Move/Tone Guard interfaces;
- provenance;
- timeline event.

Required frontend:
- app shell;
- Chief AI page;
- intake composer;
- result card;
- provenance drawer;
- action status.

Required proof:
- typecheck;
- lint;
- unit tests;
- API integration test;
- Playwright desktop and mobile;
- screenshots and trace.

No external publishing, outreach, merge, deployment, calendar write, or nudge scheduling is part of this first slice.

---

## 20. Answer to the Implementation Choice

Build **both** the endpoint contracts and runnable TypeScript stubs, in that order.

The endpoint names and request/response shapes are the stable seam that lets the web app, provider adapters, automations, and tests move in parallel. Immediately after those contracts compile, add production-structured Node/Express + TypeScript stubs behind interfaces, with deterministic test providers and no fake claims of external execution.

Do not choose between documentation and code. Use the contract to prevent the code from becoming guesswork.

---

## 21. Definition of Done

The complete build is done only when:

- Founder Control Room and Chief AI are available in one coherent authenticated web app;
- authority boundaries remain separate and explicit;
- Chief AI can process Friend Intake into a truthful mirror and one tiny move;
- prompt skills are versioned and testable;
- memory is visible, controllable, and privacy-filtered;
- missions, approvals, evidence, and rollback are usable;
- content and image workflows are reviewable and provenance-backed;
- provider writes remain gated;
- exact-head repository evidence is enforced;
- user-facing flows have Playwright screenshots and traces;
- no credential is exposed;
- no sensitive memory leaks to public drafts;
- all required checks are green;
- deployment and runtime health are proven separately;
- rollback is documented and tested;
- the next founder gate is explicit.

---

## 22. Non-Goals

- no autonomous unrestricted shell;
- no blanket standing approval;
- no automatic merges or deployments from Chief AI;
- no secret display;
- no covert memory;
- no direct broad access to Se'kret Bip’s database;
- no auto-publishing sensitive or unverified content;
- no copying another design’s protected execution;
- no broad rewrite merely to modernize the folder tree;
- no claim that a provider ran without provider evidence;
- no production launch based only on mocks.

---

## 23. Final Founder Product Language

Founder Control Room tells the truth about the machine.

Chief AI helps Juss decide what the machine should do next.

The Control Room holds authority.
Chief AI holds context.
Evidence connects them.
The founder remains the final gate.