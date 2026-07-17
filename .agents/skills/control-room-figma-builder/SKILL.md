---
name: control-room-figma-builder
description: Build and maintain canonical Founder Control Room interfaces in Figma with repository-bound provenance, reusable components, complete states, and explicit handoff evidence.
---

# Founder Control Room Figma Builder

## Use this skill when

- creating or changing a Founder Control Room dashboard, command center, workflow, evidence surface, or economic-intelligence interface in Figma;
- translating a repository brief, API contract, schema, or approved artifact into editable frames and components;
- updating the canonical Figma source recorded in `docs/FIGMA_SOURCE_OF_TRUTH.md`.

## Required context

Read before writing to Figma:

1. `GLOBAL_AI.md` and `AGENTS.md`;
2. `docs/FIGMA_SOURCE_OF_TRUTH.md`;
3. `docs/REPO_STACK_POLICY.md`;
4. the exact repository branch, pull request, and implementation contract being represented;
5. relevant privacy, authority, provenance, migration, deployment, and rollback artifacts.

For the economic-intelligence command center also read the city-agnostic artifacts under `artifacts/` and the contract in `src/economic-intelligence/`.

## Builder contract

1. Use the official Figma MCP and the canonical file key from the source-of-truth document.
2. Search subscribed design systems before creating components. Reuse suitable library components and variables; create mission-specific components only when no valid match exists.
3. Treat jurisdiction, organization, source, program, opportunity, signal, score, outcome, mission, evidence, approval, and release as data-driven primitives. Never encode a city name as a component contract or branching rule.
4. Design all material states: default, loading, empty, stale evidence, partial evidence, error, unauthorized, blocked, awaiting approval, approved, failed, rolled back, and offline/degraded where applicable.
5. Preserve founder-only boundaries. Do not place credentials, service-role values, raw provider payloads, teen or parent content, applicant-private data, or unreleased third-party information in Figma.
6. Do not invent backend behavior, permissions, integrations, or production status. Visually label synthetic fixtures and unimplemented concepts.
7. Name pages, frames, components, and variants deterministically. Use annotations for data source, authority, responsive behavior, interaction, and implementation status.
8. Record the repository branch and exact commit represented by the design. A later code change invalidates the handoff until drift is reviewed.

## Required output

Every builder run must produce or update:

- editable desktop and responsive/mobile frames where the workflow requires both;
- reusable components and variants;
- token or variable references;
- interaction and navigation notes;
- accessibility and contrast notes;
- permission and data assumptions;
- exact Figma page/node IDs;
- exact repository branch and commit SHA represented;
- a handoff status: `concept`, `approved_for_implementation`, `implemented`, `drifted`, or `retired`.

## Proof

Before calling a design complete:

- inspect metadata for expected frame/component structure;
- capture screenshots of the canonical frames;
- run a visual red-team pass for hidden authority, misleading status, data leakage, missing states, inaccessible contrast, and city-specific assumptions;
- update `docs/FIGMA_SOURCE_OF_TRUTH.md` with node IDs and current evidence.

A polished frame is not implementation proof and does not authorize repository changes, migration, integration, deployment, spending, or external communication.