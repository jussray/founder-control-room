---
name: control-room-design-implementation
description: Implement approved Founder Control Room Figma nodes in repository code with responsive behavior, authority-safe states, Code Connect provenance, and exact-head Playwright proof.
---

# Founder Control Room Design Implementation

## Use this skill when

- translating an approved Figma frame or component into Founder Control Room source code;
- reconciling implementation drift against the canonical Figma source;
- mapping stable Figma components to repository components with Code Connect;
- verifying a completed design implementation.

## Required inputs

1. The canonical file and node-specific Figma URL from `docs/FIGMA_SOURCE_OF_TRUTH.md`.
2. Design context and screenshot for the exact node.
3. The exact repository branch and expected commit recorded in the handoff.
4. Existing components, tokens, routes, APIs, schemas, tests, security boundaries, and deployment configuration.
5. The relevant builder artifact and acceptance states.

Do not implement from a screenshot alone when an editable node exists.

## Implementation loop

### Observe

- read node metadata, design context, variables, component properties, and annotations;
- inspect existing implementation and reusable repository components;
- identify responsive targets, data contracts, access rules, loading/error states, and differences from current code.

### Orient

- map Figma components to existing code before creating new components;
- preserve repository architecture and provider boundaries;
- identify any visual behavior that would require a new API, schema, credential, permission, migration, or deployment change and keep that work behind its own approval gate.

### Decide

- select the smallest coherent implementation that satisfies the approved node;
- define file changes, component mappings, tests, accessibility checks, rollback, and proof;
- reject decorative fidelity that weakens privacy, authority, performance, responsiveness, or semantic accessibility.

### Act

- implement semantic, responsive code using repository tokens and components;
- include default, loading, empty, stale, partial, error, unauthorized, blocked, success, and rollback/recovery states required by the design;
- keep jurisdiction identity in data/configuration, never UI branching constants;
- add stable Code Connect mappings only after the code component and Figma component are both canonical;
- update the source-of-truth ledger with implementation files, commit SHA, proof, and drift status.

## Verification contract

Implementation is not complete until all applicable checks pass at the exact final head:

- repository typecheck;
- lint;
- unit/contract tests;
- Playwright functional coverage;
- visual comparison or design QA against the exact Figma node;
- responsive checks at documented breakpoints;
- keyboard, focus, semantics, and contrast checks;
- privacy and authority red-team checks;
- production build when the surface ships in a build artifact.

A GitHub job with no steps or logs is infrastructure-blocked, not passing or failing application evidence. Local proof must be labeled local and bound to exact file blobs or commit SHA.

## Prohibited behavior

- inventing missing product behavior to match a mockup;
- bypassing founder authorization, RLS, service-role, or provider boundaries;
- exposing credentials, raw operational payloads, private user data, or applicant data;
- creating city-specific component forks for data that belongs in jurisdiction configuration;
- treating Code Connect as runtime proof;
- merging, migrating, deploying, spending, or contacting external parties based only on design approval.

## Completion report

Report:

- Figma file and node IDs;
- source branch and exact commit;
- files and behavior changed;
- reused and new components;
- responsive and state coverage;
- Code Connect mappings, if any;
- checks run with provenance;
- failures, skips, and infrastructure blockers;
- privacy, security, migration, and deployment impact;
- rollback path;
- remaining drift and next approval gate.