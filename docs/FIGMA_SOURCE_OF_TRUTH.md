# Founder Control Room Figma Source of Truth

Last truth reconciliation: 2026-09-19

## Canonical design file

- Name: `Johnstown Economic Opportunity Command Center`
- File key: `QevLkXHXSzXfEsqsZltGRJ`
- Canonical URL: `https://www.figma.com/design/QevLkXHXSzXfEsqsZltGRJ`
- Repository: `jussray/founder-control-room`
- Historical implementation branch: `agent/johnstown-opportunity-command-center`
- Historical implementation pull request: `#37` (merged 2026-07-22)
- Design status: `historical_concept_workspace`

The Figma file remains an approved editable design workspace for the economic-intelligence and founder-command-center surfaces. The branch/PR above are historical provenance, not an active implementation carrier. Current implementation authority is the repository default branch plus the exact active candidate, if any, observed from GitHub at execution time.

The September 2026 Johnstown AI Center City Hall initiative is a newer execution goal. Its evidence/gate truth belongs to the repository economic-intelligence initiative contract and current external receipts. It must not be inferred from the older Figma concept or PR #37.

This file does not replace repository source, API contracts, migrations, runtime evidence, external City evidence, or founder approval gates.

## Authority order

1. `GLOBAL_AI.md`, `AGENTS.md`, privacy/security contracts, and founder approvals.
2. Repository runtime, schemas, API contracts, tests, and exact-head evidence.
3. Current authoritative external evidence for a civic initiative, including City/program documents and confirmed communications.
4. Approved Figma nodes and annotations for visual behavior and interaction.
5. Screenshots, exported assets, and presentation artifacts.

When these disagree, mark the handoff `drifted`; do not silently choose whichever source is easier to implement.

## Required skills

Any Figma write must load:

- `.agents/skills/control-room-figma-builder/SKILL.md`

Any design-to-code or implementation verification must load:

- `.agents/skills/control-room-design-implementation/SKILL.md`

All runs also load the repository-wide contracts in `GLOBAL_AI.md` and `AGENTS.md`.

## Current command-center contract

The design may represent the city-agnostic economic-intelligence primitives integrated from historical PR #37:

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

The current repository contract also supports evidence-bound initiative execution state:

- initiative;
- evidence receipt and freshness;
- distinct gate status;
- distinct blockers;
- proof required to clear each gate;
- a non-secret continuity fingerprint that never grants authority.

Johnstown is the reference jurisdiction, not a component type or UI fork. Synthetic portability fixtures must remain visibly labeled.

## Historical proposed screens

These remain optional design work, not launch blockers for the current Johnstown AI Center City Hall initiative:

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
| Command-center overview | Pending creation | historical_concept | Pending implementation | No current UI proof |
| Opportunity queue | Pending creation | historical_concept | `src/economic-intelligence/` contract | Historical Playwright portability proof; UI proof absent |
| Evidence detail | Pending creation | historical_concept | Economic-intelligence evidence contract | Current UI proof absent |
| Approval states | Pending creation | historical_concept | Existing approval/proof-gate routes | Current UI proof absent |
| Responsive view | Pending creation | historical_concept | Pending implementation | Current responsive proof absent |

Update this table only when an approved Figma creation, implementation, drift review, or retirement materially changes design truth. Do not hard-code a volatile active PR/head as durable design authority.

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

Design approval does not carry forward to repository integration, database migration, deployment, spending, rollback, external communication, City sponsorship, or financing approval.
