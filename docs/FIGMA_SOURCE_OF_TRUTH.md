# Founder Control Room Figma Source of Truth

Last reviewed: 2026-07-17

## Canonical design file

- Name: `Johnstown Economic Opportunity Command Center`
- File key: `QevLkXHXSzXfEsqsZltGRJ`
- Canonical URL: `https://www.figma.com/design/QevLkXHXSzXfEsqsZltGRJ`
- Repository: `jussray/founder-control-room`
- Active implementation branch: `agent/johnstown-opportunity-command-center`
- Active pull request: `#37`
- Current design status: `concept_in_progress`

This file is the approved editable design workspace for the economic-intelligence and founder-command-center surfaces. It does not replace repository source, API contracts, migrations, runtime evidence, or founder approval gates.

## Authority order

1. `GLOBAL_AI.md`, `AGENTS.md`, privacy/security contracts, and founder approvals.
2. Repository runtime, schemas, API contracts, tests, and exact-head evidence.
3. Approved Figma nodes and annotations for visual behavior and interaction.
4. Screenshots, exported assets, and presentation artifacts.

When these disagree, mark the handoff `drifted`; do not silently choose whichever source is easier to implement.

## Required skills

Any Figma write must load:

- `.agents/skills/control-room-figma-builder/SKILL.md`

Any design-to-code or implementation verification must load:

- `.agents/skills/control-room-design-implementation/SKILL.md`

All runs also load the repository-wide contracts in `GLOBAL_AI.md` and `AGENTS.md`.

## Current command-center contract

The design must represent the city-agnostic economic-intelligence primitives already implemented on PR #37:

- jurisdiction;
- organization;
- source and provenance;
- program;
- opportunity;
- signal;
- deterministic score and score version;
- outcome;
- mission and evidence;
- separate approval, migration, integration, deployment, and rollback gates.

Johnstown is the reference jurisdiction, not a component type or UI fork. Synthetic portability fixtures must remain visibly labeled.

## Required initial screens

1. Founder mission overview and proof-gate status.
2. Jurisdiction and source-health overview.
3. Opportunity queue with provenance, score signals, confidence, owner, and next action.
4. Funding/program routing workspace.
5. Outcome and public-investment ledger.
6. Evidence detail with exact source, observed time, authority, and staleness.
7. Approval drawer for separately gated actions.
8. Responsive/mobile review surface.

## Node ledger

| Surface | Figma page/node | Status | Repository mapping | Proof |
| --- | --- | --- | --- | --- |
| Command-center overview | Pending creation | concept_in_progress | Pending implementation | Pending screenshot/metadata review |
| Opportunity queue | Pending creation | concept_in_progress | `src/economic-intelligence/` contract | Playwright contract proof exists; UI proof pending |
| Evidence detail | Pending creation | concept_in_progress | Supabase economic-intelligence migration | Rollback-only migration validation passed; UI pending |
| Approval states | Pending creation | concept_in_progress | Existing approval/proof-gate routes | Pending implementation review |
| Responsive view | Pending creation | concept_in_progress | Pending implementation | Pending responsive Playwright/design QA |

Update this table after every approved Figma creation, implementation, drift review, or retirement.

## Privacy and data rules

Never place these in Figma:

- provider credentials or service-role values;
- raw GitHub, Cloudflare, Supabase, or runner payloads;
- teen, parent, journal, voice, media, or safety content;
- applicant-private records;
- unreleased partner or vendor data;
- real personal data used merely to make a mockup look realistic.

Use synthetic fixtures and label them.

## Proof and release boundary

A completed design requires metadata inspection, screenshots, state coverage, accessibility review, and a red-team pass. A completed implementation additionally requires exact-head typecheck, lint, tests, Playwright, design QA, responsive verification, and production build where applicable.

Design approval does not carry forward to repository integration, database migration, deployment, spending, rollback, or external communication.