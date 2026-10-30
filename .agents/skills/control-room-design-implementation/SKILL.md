---
name: control-room-design-implementation
description: Execute bounded project design commands and implement approved Founder Control Room Figma nodes in repository code with product-native grammar, responsive behavior, authority-safe states, Code Connect provenance, and exact-head Playwright proof.
---

# Founder Control Room Design Implementation

## Use this skill when

- executing any command in the canonical 23-command project design language;
- translating an approved Figma frame or component into Founder Control Room source code;
- reconciling implementation drift against the canonical Figma source;
- mapping stable Figma components to repository components with Code Connect;
- verifying a completed design implementation.

The canonical command registry is `src/design-os/commands.ts`. The commands are **23 bounded operations of this one shared capability**, not 23 independent skills and not 23 sources of authority.

## 23-command project design language

| Command | Owns |
| --- | --- |
| `/intent` | user, job, desired outcome, consequence level, stop condition |
| `/critique` | evidence-backed diagnosis and the smallest valid repair chain |
| `/hierarchy` | attention order and visual priority |
| `/flow` | task sequence from entry through result and recovery |
| `/information` | information architecture, grouping, sections, navigation |
| `/copy` | interface wording, labels, helper text, errors, CTAs |
| `/typeset` | typography scale, weight, measure, line height, wrapping |
| `/layout` | grid, containers, alignment, composition, placement |
| `/spacing` | gaps, padding, margins, density, vertical rhythm |
| `/color` | palette application, semantic colors, contrast, surfaces |
| `/components` | reusable component consistency and variants |
| `/states` | default, focus, active, selected, loading, disabled, success, warning, error |
| `/forms` | field order, labels, defaults, validation, submission confidence |
| `/responsive` | deliberate viewport reflow and responsive prioritization |
| `/touch` | touch targets, mobile ergonomics, gestures, keyboards, reach |
| `/accessibility` | semantics, keyboard/focus, labels, contrast, reduced motion |
| `/motion` | animation purpose, timing, continuity, feedback, reduced motion |
| `/feedback` | progress, confirmation, failure explanation, next action |
| `/empty` | zero-data, first-use, offline, missing, not-configured states |
| `/recovery` | cancel, undo, retry, destructive confirmation, safe exits |
| `/brand` | product-native visual grammar, tone, metaphor, signature details |
| `/polish` | final optical alignment, borders, radii, icons, visual noise |
| `/prove` | exact-head rendered browser evidence and design receipt |

### Command law

1. A command may mutate **only the design dimension it owns** unless another command is explicitly invoked.
2. `/intent` and `/critique` are observational. They do not authorize code changes.
3. `/critique` chooses the smallest valid command chain. Do not run all 23 by default.
4. Every mutating command requires founder approval through the existing FCR authority path. The slash command itself never creates, renews, or broadens authority.
5. Every project keeps its native grammar. Shared usability laws may transfer; another project's aesthetic, metaphor, density, motion language, or brand signature may not.
6. `/polish` cannot conceal unresolved structural, accessibility, truth, flow, or recovery findings.
7. `/prove` is closure, not a design mutation. UI/runtime completion claims require exact-head Playwright evidence across applicable viewports and states.
8. Continuity fingerprints, proof cookies, screenshots, traces, and receipts may update or invalidate truth bidirectionally. They are non-secret state markers and evidence only; they never authorize implementation, merge, deploy, or external action.
9. Approval is project-, subject-, scope-, and evidence-bound. No approval carries across projects.

## Required inputs

1. The selected project/repository and exact expected head.
2. The explicit design command or command chain and target surface.
3. The current rendered evidence for that target when the command depends on visual/runtime state.
4. The canonical file and node-specific Figma URL from `docs/FIGMA_SOURCE_OF_TRUTH.md` when Figma is the design source.
5. Existing components, tokens, routes, APIs, schemas, tests, security boundaries, deployment configuration, and product-native design grammar.
6. For mutation, the founder-approved scope and rollback boundary.

Do not implement from a screenshot alone when an editable canonical node exists. Do not invent a design source when the repository/runtime is authoritative for the requested repair.

## Implementation loop

### Observe

- run `/intent` or establish the equivalent outcome and stop condition;
- use `/critique` when diagnosis is needed before mutation;
- read node metadata, design context, variables, component properties, annotations, and current rendered evidence where applicable;
- inspect existing implementation and reusable repository components;
- identify responsive targets, data contracts, access rules, loading/error/recovery states, and differences from current code;
- classify VERIFIED / INFERRED / UNKNOWN / BLOCKED before recommending a mutation.

### Orient

- map the requested command to its exact ownership boundary in `src/design-os/commands.ts`;
- map Figma components to existing code before creating new components;
- preserve repository architecture, product-native grammar, and provider boundaries;
- identify any visual behavior that would require a new API, schema, credential, permission, migration, external action, or deployment change and keep that work behind its own approval gate.

### Decide

- select the smallest coherent command chain that satisfies the founder goal;
- define file changes, component mappings, tests, accessibility checks, rollback, and proof;
- reject decorative fidelity that weakens privacy, authority, performance, responsiveness, semantic accessibility, or product truth;
- stop when the requested command's owned dimension is repaired and verified. Do not opportunistically redesign adjacent dimensions.

### Act

- implement semantic, responsive code using repository tokens and components;
- include default, loading, empty, stale, partial, error, unauthorized, blocked, success, and rollback/recovery states required by the design;
- keep jurisdiction identity in data/configuration, never UI branching constants;
- add stable Code Connect mappings only after the code component and Figma component are both canonical;
- update the relevant continuity/evidence state only from actual observed changes and receipts.

## Verification contract

Implementation is not complete until all applicable checks pass at the exact final head:

- repository typecheck;
- lint;
- focused unit/contract tests;
- Playwright functional coverage;
- desktop and mobile rendered proof when the surface supports both;
- visual comparison or design QA against the exact canonical target;
- responsive checks at documented breakpoints;
- keyboard, focus, semantics, and contrast checks;
- privacy and authority red-team checks;
- production build when the surface ships in a build artifact.

A GitHub job with no steps or logs is infrastructure-blocked, not passing or failing application evidence. Local proof must be labeled local and bound to exact file blobs or commit SHA.

## Prohibited behavior

- inventing missing product behavior to match a mockup;
- treating slash commands, fingerprints, cookies, Figma approval, or screenshots as execution authority;
- bypassing founder authorization, RLS, service-role, or provider boundaries;
- exposing credentials, raw operational payloads, private user data, or applicant data;
- creating city-specific component forks for data that belongs in jurisdiction configuration;
- treating Code Connect as runtime proof;
- allowing `/polish` or `/brand` to override accessibility, truth, recovery, or authority semantics;
- merging, migrating, deploying, spending, publishing, or contacting external parties based only on design approval.

## Completion report

Report:

- project, repository, branch, and exact commit;
- command chain used and target surface;
- source design/Figma node when applicable;
- files and behavior changed;
- reused and new components;
- responsive and state coverage;
- Code Connect mappings, if any;
- checks run with provenance, including Playwright screenshots/traces where applicable;
- failures, skips, and infrastructure blockers;
- privacy, security, migration, and deployment impact;
- continuity fingerprint/cookie changes caused by verified evidence;
- rollback path;
- remaining drift and one next approval gate.
