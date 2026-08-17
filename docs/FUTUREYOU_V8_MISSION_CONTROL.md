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

The brief exposes missing project labels, stale observations, absent revenue evidence, and missing activity. It never converts an estimate or draft into completed reality. A malformed or future-dated clock is treated as an anomaly to expose, never as a fresh, trustworthy signal — see Observation trust below.

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

## Observation trust

Structural evidence and observational trust are different questions. A record can have every evidence string present (`evidenceCoveragePercent: 100`) while its timestamp is unusable — that combination must stay visible, not collapse into a single confidence number.

Every mission or event observation is classified into one `observationState`:

- **fresh** — parses to a valid time, at most 3 days old (`FRESH_OBSERVATION_DAYS`).
- **stale** — valid time, 3 or more days old. Still shown, never counted as fresh decision evidence.
- **invalid** — the timestamp does not parse at all.
- **future** — parses, but is more than a 5-minute clock-skew allowance (`FUTURE_CLOCK_SKEW_MS`) ahead of `now`.

Rules that follow from that classification:

- `invalid` and `future` observations always force machine `confidence` to `low`. They never inherit `high`/`medium` confidence and never count toward `recentCompletions`.
- `stale` observations remain visible and can still raise operational urgency (a stale blocker is still a blocker), but they are excluded from `trustedObservationPercent` and from `recentCompletions`.
- A non-critical/error event with an `invalid` or `future` timestamp is not made actionable by that alone — severity and the existing risk-keyword match still gate whether it surfaces. A genuinely critical/error event stays actionable even with a broken clock, but with confidence forced low.
- `evidenceCoveragePercent` (legacy, structural — does a record have evidence strings) is preserved unchanged alongside the new `trustedObservationPercent` (does the record's own observation time hold up). Neither metric implies the other.

`MissionControlBrief.summary` additionally reports `trustedObservationPercent`, `staleObservations`, `invalidObservationTimes`, and `futureObservationTimes`. The cockpit (`public/control-room/futureyou-v8.html`) renders an observation-trust pill next to the confidence pill on every priority card, and summary tiles for Trusted observations / Stale observations / Time integrity gaps alongside the legacy Structural evidence tile. None of this changes authority: FutureYou remains read-only and cannot merge, deploy, publish, send, spend, or self-promote regardless of observation state.

## Proof required before merge

- TypeScript build passes.
- FutureYou V8 unit tests pass.
- Existing test suite remains green.
- The route remains founder-gated and read-only.
- The static verification contract confirms the route, UI, authority labels, blind-spot language, and package script exist.
- A rendered browser check confirms the cockpit does not label recommendations as executed or financially verified.

## Rollback

Remove the `/futureyou` mount and the V8 public files. No database rollback is required because V8 introduces no migration or persistent state.
