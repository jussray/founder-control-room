# Model Capability Market

Status: bounded routing contract and source implementation.

Founder Control Room must not choose a model because a launch benchmark, provider claim, community leaderboard, or Council preference says it is "best." External benchmarks are useful discovery signals, but they are priors. FCR promotes an operator to primary routing only after fresh task-specific evidence from the founder's real workflows.

## What this adds

The capability market measures operators by task class rather than one global intelligence score. The first task classes are:

- repository repair
- architecture review
- business workflow
- scientific research
- public research
- cross-provider drift
- browser/runtime work
- founder synthesis
- multimodal generation

The implementation lives in `src/lib/modelCapabilityMarket.ts`.

## Feed: from relay receipts to observations

The market ranks from `CapabilityObservation` records. Its intended first receipt source is the operator relay: every relay response records which operator answered, the outcome status, the evidence references, whether authority was requested, and when it completed. `src/lib/capabilityObservationFeed.ts` folds those receipts into one observation per operator and task class, deterministically, so the observation can itself be receipted.

Today relay responses are returned to the caller and are not persisted anywhere in this repository. Persisting them is a separate gate. Until it lands, the fold has no stored population to read.

Fold rules:

- `accepted` receipts are in-flight, not outcomes, and are excluded from the sample
- receipts answered by another operator are ignored, never re-attributed
- exact duplicate receipts (same `responseHash`) count once; when one `relayId` has several outcome receipts, only the latest counts
- with a freshness window, receipts older than the window are excluded so stale evidence cannot ride on one fresh receipt; a receipt whose `completedAt` does not parse is always excluded
- a provider answering is not outcome proof: only receipts whose `relayId` an independent verifier confirmed contribute to `proofRate` and `evidenceRefs`; with no verifier the observation carries no evidence and the market's own gate keeps the operator in trial (adapter-proven is not provider-outcome-proven)
- a `completed` receipt with no evidence reference is a false green, even if it bypassed the relay validator
- any runtime `authorityRequested` other than the exact string `none` — including a missing or malformed value — is an authority violation
- `blocked` is an honest authority stop: it stays in the sample but is excluded from the success denominator, so stopping correctly never lowers a score
- cost and duration are not invented; the relay receipt does not carry them
- task classification is upstream — the caller names the task class, the fold does not infer it
- `evidenceRefs` inside an observation are Sauce-Guard-private routing evidence, never public content

Current state, in the repository's own capability vocabulary:

```text
contract-capable          market ranking + relay-receipt fold exist as tested source
configured / allowlisted  not yet — no live route calls the market; no store persists relay responses or observations; no outcome verifier exists
adapter-proven            not yet
provider-outcome-proven   not yet
```

Until a live route calls `buildCapabilityRoute` with observations folded from persisted, independently verified relay receipts, the market is advisory source, not enforced routing. Do not describe it in present tense as selecting operators.

## Evidence hierarchy

For routing decisions:

1. fresh local outcome receipts from the exact task class
2. fresh local proof quality, false-green rate, root-cause accuracy, cost, and duration
3. independent challenger evidence from a different provider family
4. current external benchmarks as a bounded prior only
5. model/provider reputation or historical preference

A public benchmark cannot by itself make an operator eligible for primary routing.

## Anti-leaderboard rules

The market deliberately scores failure modes that common benchmark tables usually omit:

- false-green claims are penalized
- any fresh authority-boundary violation blocks the candidate from primary routing
- stale local evidence expires instead of self-renewing
- cost and time are measured alongside correctness
- external benchmark influence is capped
- a different provider family is preferred for the challenger lane
- new or newly upgraded models enter as shadow trials until local receipts satisfy the sample gate

These rules are intended to make FCR stronger as outside models improve rather than forcing a rewrite every time a provider changes the leaderboard.

## Authority invariant

Routing is not authority.

Every ranked candidate and every route explicitly carries:

- `selectionAuthority: false`
- `executionAuthority: false`

The market may recommend a primary, challenger, and shadow trials. It cannot create credentials, approve a write, widen provider scopes, merge, deploy, publish, migrate, change DNS, spend money, or replace founder approval. Existing repository/provider/runtime gates remain authoritative.

## Promotion protocol

A new model or model version should enter as a trial candidate.

Promote it only when fresh local observations for the same task class meet the configured sample gate and contain evidence references. Recommended observations include:

- verified root-cause diagnosis
- focused patch result
- exact test/CI receipts
- Playwright/browser proof for user-facing work
- provider readback when Cloudflare/Supabase or another provider is load-bearing
- false-green incidents
- authority-boundary violations
- cost and duration

Provider-supplied or third-party benchmark results can be recorded as `ExternalBenchmarkPrior`, but they remain bounded priors.

## Council pattern

For a material task:

1. classify the task
2. rank eligible operators from fresh local evidence
3. choose one primary executor candidate
4. choose an independent challenger from a different provider family when available
5. run promising unproven models as shadow trials
6. serialize mutation through the existing authority membrane
7. collect receipts
8. feed those receipts back into the next routing decision

This creates a closed empirical loop:

`OUTSIDE CAPABILITY -> SHADOW TRIAL -> LOCAL RECEIPT -> ROUTING UPDATE -> EXECUTION -> PROOF -> DRIFT CHECK`

The goal is not permanent loyalty to any model. The goal is a system that can absorb better capabilities while remaining harder to fool, cheaper to operate, and easier to roll back.
