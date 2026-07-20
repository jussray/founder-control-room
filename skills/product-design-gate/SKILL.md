---
name: product-design-gate
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
last_reviewed: 2026-07-19
---

# Product Design Gate Skill

## Who

This skill is for AI operators and repository agents coordinating Product Design work with GitHub, Supabase-aware product flows, Founder Control Room, and managed project repositories.

The founder remains the final authority. Product Design evidence may support a design decision, prototype decision, or UX repair, but it never authorizes merge, deployment, destructive writes, spending, external publication, database mutation, schema changes, RLS changes, auth changes, or access changes by itself.

## What

Use this skill to:

- route explicit `@Product Design` requests to the correct Product Design workflow;
- separate design exploration from production code edits;
- require screenshot-grounded audits for product-flow critique;
- require source visual plus rendered implementation for design QA;
- connect Product Design findings to the next smallest GitHub patch;
- preserve release, privacy, Supabase, evidence, and project-boundary gates.

Do not use this skill as a substitute for TypeScript audit, Supabase review, release gate, privacy review, Playwright, or exact-head checks.

## When

Invoke this skill when work touches:

- product flows, onboarding paths, dashboards, checkouts, settings, prototypes, visual QA, Figma, screenshots, mockups, source visuals, URL-to-code, image-to-code, or design critique;
- Supabase-backed UI behavior where Auth, RLS, Realtime, Storage, Edge Functions, or client data fetching could affect what the user sees;
- PR claims based on visual correctness or prototype fidelity.

## Required with

- `portfolio-control-plane`
- `typescript-audit` when Product Design work may affect repository code
- `typescript-root-cause-debugger` when the visible product issue has expected-vs-actual behavior
- `typescript-behavior-tests` when behavior or flow coverage is needed
- `typescript-minimal-patch` when a code repair is authorized
- `typescript-strict-review` before merge-ready or ready-for-review claims

For Supabase-backed product work, also apply the relevant Supabase local contract: migrations, RLS, Auth, Storage, Realtime, Edge Functions, client keys, service-role keys, and database evidence must be reviewed through Supabase-specific guardrails. Product Design screenshots are not proof that the database policy is correct.

## Core rule

Product Design evidence is design evidence. It is not merge proof, deployment proof, privacy proof, auth proof, Supabase proof, Playwright proof, or production readiness.

A Product Design pass can inform the next GitHub patch, but it does not waive exact-head checks, release gates, privacy review, Supabase schema/RLS/Auth verification, or Founder Control Room evidence.

## Chat mode boundary

If Product Design is invoked in a chat that cannot run Product Design Work Mode tools, do not pretend the Product Design workflow ran. Say the Product Design workflow itself requires Work Mode, and provide the repo-facing plan or skill contract only.

Do not claim screenshots, browser captures, Figma boards, rendered prototypes, or QA passes unless those artifacts were actually produced and inspected.

## Audit contract

For UX, product-flow, onboarding, checkout, settings, or screen audits:

1. identify the product or surface;
2. identify the flow or task;
3. capture evidence from the actual flow;
4. inspect the screenshots before accepting them;
5. tie every finding to a screenshot, step, or named blocker;
6. state what screenshots alone cannot prove.

No screenshot evidence means no completed audit. Indirect docs, memories, old captures, or vibe checks are research, not audit evidence.

## Design QA contract

Use design QA only after both artifacts exist:

- source visual target: Figma node, image, screenshot, mockup, or source capture;
- rendered implementation: local URL, deployed URL, app screen, component, or screenshot.

If either artifact is missing, blocked, stale, or not the same state, write the QA result as blocked.

Before handoff, explicitly evaluate:

- fonts and typography;
- spacing and layout rhythm;
- colors and visual tokens;
- image and asset fidelity;
- app-specific copy and content;
- responsiveness and visible accessibility risks.

A QA result must be `passed` only when no actionable P0, P1, or P2 issues remain. P3 polish may remain as follow-up.

## Supabase boundary

For Supabase-backed product surfaces:

- use synthetic users, synthetic workspace/project data, and synthetic media for design captures;
- never expose service-role keys, JWTs, refresh tokens, anon or publishable keys copied from private environments, connection strings, bucket secrets, or signed URLs;
- never infer RLS correctness from UI visibility alone;
- require database/Auth/RLS/Edge Function evidence when the visible behavior depends on Supabase access control or server logic;
- do not change migrations, policies, storage rules, or Edge Functions from a Product Design workflow unless a separate Supabase gate authorizes it.

## No visual target, no build

Do not scaffold, edit files, or start a prototype build when there is no URL, screenshot, Figma frame, mockup, source image, existing code target, or selected visual option.

For new design exploration, route through Product Design context and ideation first, then wait for a selected visual direction before implementation.

## Output

When Product Design work informs a repo change, report:

1. product surface and flow;
2. source visual or capture evidence;
3. implementation or prototype evidence;
4. audit or QA result: `passed`, `blocked`, or `research only`;
5. Supabase dependency status: `none`, `client-only`, `auth/RLS-backed`, `edge-backed`, or `unverified`;
6. top issues by severity;
7. smallest code/design next step;
8. verification still required before merge.

## Forbidden shortcuts

Do not:

- use Product Design as a reason to bypass GitHub checks;
- claim visual QA from code review alone;
- claim accessibility compliance from screenshots alone;
- infer Supabase Auth/RLS/schema correctness from screenshots alone;
- replace real screenshots with memory or old artifacts;
- broaden a small annotation into a redesign;
- mix design exploration, production deployment, database mutation, and merge approval into one gate;
- use real private user data in captures or prototypes;
- merge a design-driven PR without release-gate evidence.