# Portfolio Figma Build + Implementation Contract

## Purpose

Figma is the portfolio's editable design, review, design-system, and implementation-handoff surface. It is not a source of runtime truth, product data, approval authority, payment authority, migration state, deployment state, or release proof.

Every active repository owns a local `.agents/skills/figma-build-implement/SKILL.md` and `.figma/repository-profile.json`. The shared protocol below is stable; the local profile defines the actual runtime, data boundary, design targets, implementation paths, and proof commands.

## Repository matrix

| Repository | Figma role | Implementation boundary |
|---|---|---|
| `jussray/Sekret-Bip` | Mobile and responsive Expo product design | Expo Router, React Native, TypeScript; synthetic teen/family content only |
| `jussray/founder-control-room` | Founder dashboard and economic-intelligence control surfaces | Current TypeScript/Express/web contracts; no invented authority or false-green state |
| `jussray/l99-StoryEngine` | Creator studio, artifact review, video/shot planning | Current studio/runtime boundaries; Figma is not canon, renderer, event bus, or promotion proof |
| `jussray/chief-ai-machine` | Prompt-builder prototype and design governance | Current vanilla JavaScript SPA unless a separate architecture change is approved |
| `jussray/jussbeautifulhair-site` | Public responsive commerce | React/Vite public storefront and minimal Cloudflare checkout handoff only |
| `jussray/untold-stories-storefront` | Story-first responsive commerce | Shopify Hydrogen routes/components/fragments; Shopify remains product and checkout authority |
| `jussray/jbh-private` | Private local owner/admin | Loopback-only admin; private library; payment Worker remains API-only |

## Required skill routing

- `figma-use`: mandatory before every Figma write.
- `figma-generate-library`: mandatory for tokens, variables, themes, components, variants, or reusable libraries.
- `figma-generate-design`: first capture of an existing running web page only; editable design is rebuilt with `figma-use`.
- `figma-code-connect`: conditional on published components, eligible plan, exact node URL, and verified code props.
- Product Design design QA: only after a source visual and rendered implementation both exist.

## Shared operating sequence

```text
5W1H
-> Redteam I: attack the premise
-> Lindymode: retain durable primitives
-> L99: map authority, state, provenance, and rollback
-> scope lock
-> Figma foundations
-> reusable components
-> screens/flows
-> code implementation
-> Redteam II: attack the selected implementation
-> OODA verification loop
-> exact evidence + rollback + next gate
```

## Build contract

1. Inspect current code, Figma file, libraries, variables, components, and current runtime before creation.
2. Lock the exact v1 design scope and code target.
3. Reuse local components first, subscribed libraries second, wrappers third, and new components last.
4. Create variables before components and components before screens.
5. Make loading, empty, error, unauthorized, offline/degraded, stale, success, and rollback states explicit when applicable.
6. Use synthetic/redacted data according to the local repository profile.
7. Record exact Figma file and node identifiers.

## Implementation contract

1. Implement in the repository's verified current framework; do not add a framework merely to match a mockup.
2. Do not invent APIs, schema fields, products, inventory, auth rules, permissions, events, providers, or deployment behavior.
3. Preserve existing component, state, data, and provider boundaries.
4. Treat the Figma design as a specification that may be corrected by runtime truth.
5. Maintain an explicit design-to-code drift log.
6. Verify using the local profile's tests and exact-head proof rules.

## Code Connect gate

Do not claim Code Connect readiness or completion unless all conditions are true:

- the Figma component is published to a team library;
- the connected Figma plan supports Code Connect;
- a node-specific URL exists;
- the code component and props are verified;
- every variant is mapped exhaustively;
- examples contain no prohibited data;
- the repository has a reviewed Figma configuration and template location.

A component screenshot, instance, local component, or design-system search result is not Code Connect proof.

## Evidence states

- `design_ready`: editable design and state coverage validated.
- `implementation_ready`: exact code targets and mapping recorded.
- `implemented_local`: code executed locally against the matching design.
- `verified_exact_content`: executed proof is bound to matching repository blobs.
- `verified_exact_head`: trusted runner executed the exact commit.
- `deployed_observed`: deployed runtime and expected revision were independently observed.

Never collapse these states into a single green badge.

## Portfolio non-claims

This contract does not merge any branch, publish any Figma library, create Code Connect mappings, expose private data, apply migrations, deploy code, change billing, or authorize external communication. Those remain separate proof and approval gates.