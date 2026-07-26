# FutureYou V8 Mission Control

## Purpose

FutureYou V8 gives the founder one read-only answer to one durable question:

> What is the highest-leverage verified next action right now?

It does not create a second CRM, a second mission table, or a second execution path. It reads the existing governed `missions`, sanitized `project_events`, and project labels, then produces a ranked executive brief.

## Truth boundary

The V8 score is operational urgency, not money, expected value, close probability, or a promise of business impact. Until a verified revenue feed exists, the brief must display that blind spot rather than inventing financial confidence.

A priority is not an approval. A recommendation is not execution. Drafted, approved, attempted, delivered, and verified remain distinct states.

## Decision filters

### FutureYou

The surface must remain legible when the founder manages dozens of products, repositories, providers, deals, and AI agents. Provider names are evidence sources, not the information architecture.

### Red Team

The brief exposes missing project labels, stale observations, absent revenue evidence, and missing activity. It never converts an estimate or draft into completed reality.

### OODA

1. **Observe:** read governed mission state and sanitized operational events.
2. **Orient:** score state, risk, staleness, and recent failures.
3. **Decide:** surface one explicit next move per priority.
4. **Act:** use existing mission, approval, provider, and proof-gate paths.
5. **Verify:** read back external state and attach evidence before completion.

### Lindy Mode

The product is organized around durable founder decisions: sell, ship, grow, verify, and manage risk. GitHub, HubSpot, Supabase, Cloudflare, and future providers remain replaceable adapters.

### L99

Every priority declares an authority level and boundary:

- **L1:** observe or verify only.
- **L2:** prepare analysis, drafts, tests, or sandbox work.
- **L3:** founder decision required.
- **L4:** execution remains separately and explicitly approval-gated.

No approval carries into the next action.

## Runtime surfaces

- API: `GET /futureyou/v8/brief`
- UI: `/control-room/futureyou-v8.html`
- Pure ranking contract: `src/futureyou/missionControl.ts`

The API is protected by the existing founder session and allowlist middleware. It performs no mutations.

## Ranking inputs

Mission scoring uses:

- governed mission status;
- declared risk level;
- elapsed time since the mission changed;
- durable work domain inferred from the mission text.

Actionable event scoring uses:

- critical or error severity;
- recent failure, drift, blocking, rollback, payment, or delivery signals;
- observation recency.

The score is intentionally bounded to 0–100 and is only used to order founder attention.

## Proof required before merge

- TypeScript build passes.
- FutureYou V8 unit tests pass.
- Existing test suite remains green.
- The route remains founder-gated and read-only.
- The static verification contract confirms the route, UI, authority labels, blind-spot language, and package script exist.
- A rendered browser check confirms the cockpit does not label recommendations as executed or financially verified.

## Rollback

Remove the `/futureyou` mount and the V8 public files. No database rollback is required because V8 introduces no migration or persistent state.
