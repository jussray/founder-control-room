# Product Design Parallel Build Contract

Version: 1.0
Date: 2026-07-30
Owner: Juss Ray
Companion to: `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`

## Purpose

Product Design is a required parallel workstream for Founder Control Room and Chief AI. It is not a styling pass performed after engineering decisions have hardened.

Founder Control Room and Chief AI must share one coherent design language while preserving separate jobs:

- Founder Control Room is exact, calm, trustworthy, evidentiary, and operational.
- Chief AI is conversational, protective, quick, context-aware, and human.
- Both must feel like one founder operating system.

## Required workflow

```text
Product brief
-> intended user outcome
-> research when it can change a decision
-> exactly three distinct visual directions
-> founder selects one visual target
-> responsive implementation
-> source-to-render design QA
-> accessibility review
-> Playwright interaction proof
-> exact-head screenshots and traces
```

Do not scaffold a new surface before a visual target is selected. Focused repairs to an existing authoritative interface may skip new ideation only when the requested change is narrow.

## Design brief gate

Before ideation or implementation, record:

- primary user and job;
- entry point and critical path;
- intended outcome and success signal;
- required information and actions;
- authority, privacy, and risk states;
- target devices and accessibility requirements;
- brand references and existing design sources;
- authoritative source and stop condition.

## Research and ideation

Research only high-signal questions that can change the product, including context loss, approval confidence, evidence freshness, sensitive-memory comprehension, one-handed mobile use, and the difference between Command Deck information and deeper evidence.

For every new major surface, create exactly three genuinely different visual directions. Each must show layout, navigation, hierarchy, interaction model, mobile behavior, critical states, strengths, and risks. Three palettes on one layout do not count.

No implementation begins until one direction is selected as the visual target.

## Shared design system

```text
packages/ui/
  tokens/
    color
    typography
    spacing
    radius
    elevation
    motion
    breakpoints
  components/
    app-shell
    navigation
    evidence-badge
    status-chip
    approval-panel
    command-input
    timeline
    provenance-drawer
    privacy-indicator
    empty-state
    error-state
    loading-state
  patterns/
    command-deck
    mission-detail
    approval-review
    evidence-inspection
    friend-intake
    tiny-move
    prompt-preview
    memory-control
    image-edit-spec
```

Use semantic tokens, light and dark themes, compliant contrast, reduced motion, visible keyboard focus, minimum touch targets, non-color status cues, and a phone-tested type scale.

## Complete state design

Every critical screen must include loading, empty, populated, partial-data, stale-evidence, disconnected-provider, permission-blocked, policy-blocked, validation-error, provider-failure, retryable-failure, destructive-confirmation, and success states. A polished happy path alone is incomplete.

## Command Deck and Chief AI hierarchy

The Command Deck must answer within five seconds:

1. What matters now?
2. What is blocked?
3. What needs founder approval?
4. What changed?
5. What is the safest next move?

Use one dominant next action, then active mission, approvals, release truth, Chief AI intake, provider health, and recent evidence. Avoid a wall of equal-weight cards.

Friend Mode requires one obvious voice/text intake, explicit memory controls, a visible processing state, mirror content separated from advice, 1-3 intent tags, exactly one tiny move, a copy-ready script when relevant, careful confidence language, provenance access, and start/complete/dismiss/request-nudge controls.

## Approval and evidence design

Approval views must separately display the proposed action, target, project, repository, branch, exact SHA, evidence freshness, risk, consequences, rollback, and founder decision. Stale or mismatched evidence must disable approval.

Evidence Room must support claim-to-proof pairing, logs, screenshots, traces, test results, integrity, freshness, source/model provenance, filtering, and unsupported-claim warnings.

## Mobile-first and accessibility

Primary viewport is a modern phone in portrait orientation.

Requirements:

- bottom navigation and one-handed primary actions;
- sticky next gate where appropriate;
- sheets or drawers for provenance and advanced details;
- no horizontal overflow;
- copy/expand controls for SHAs and logs;
- inputs visible above the software keyboard;
- safe-area support;
- voice intake reachable without desktop controls;
- WCAG 2.2 AA target;
- semantic landmarks and logical headings;
- keyboard-complete workflows and visible focus;
- accessible dialogs, drawers, errors, live regions, captions, and transcripts;
- reduced-motion support;
- no color-only or drag-only interaction.

Accessibility failures on a critical path block completion.

## Source-to-render Design QA

After implementation, compare the rendered product to the selected source visual. Inspect structure, spacing, typography, color, contrast, components, hierarchy, responsive behavior, states, overflow, alignment, focus, animation, empty states, and errors.

Classify every difference as:

- accepted intentional deviation;
- defect to fix;
- blocked by a technical constraint;
- founder decision required.

Do not claim visual fidelity without source-to-render evidence.

## Product Design Playwright proof

Capture desktop and mobile proof for:

- Command Deck;
- Friend Intake;
- Mirror and Tiny Move;
- provenance drawer;
- mission detail;
- stale-SHA approval blocking;
- Evidence Room;
- PromptOS preview;
- memory controls;
- Image Studio;
- Content Studio;
- provider-disconnected state;
- keyboard-only flow;
- reduced-motion behavior.

Every artifact must include viewport, test name, timestamp, branch, and exact SHA.

## Product Design definition of done

A surface is complete only when:

- the brief and intended outcome are explicit;
- a selected visual target exists;
- responsive implementation matches it or deviations are recorded;
- critical states exist;
- accessibility gates pass;
- Playwright passes;
- screenshots and traces are exact-head evidence;
- design proof is not confused with backend, database, provider, authentication, or deployment proof;
- the next founder design decision is explicit.
