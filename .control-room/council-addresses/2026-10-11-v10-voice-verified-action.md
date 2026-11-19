# Council Address — V10 Voice-to-Verified-Action Authority Seam

Status: founder-authorized council review artifact; NOT execution or release approval.
Scope: FCR FutureYou/Me V10, existing Council/Court transport, L99 interactive authority.
Source of truth: current repository main; re-resolve exact SHA before any mutation.

## Goal
Accept a voice or text request as *untrusted intent*, translate it to a bounded council question, and return an evidence-bound advisory result. Do not create a parallel council bus, authority service, or OS.

## Existing contracts to reuse
- `src/lib/v10DecisionAuthorityGate.ts`: V10 decision receipt and reason-only authority ceiling.
- `docs/l99-interactive-authority.md`: typed capability, SHA-256 identity binding, monotonic derivation, fail-closed execution.
- `.control-room/council-addresses/2026-10-05-v10-ultrathink-upgrade-court.md`: existing court/council workflow and V10 progression.

## Proposed bounded contract
`voice_intent@v1` fields: requestId, actorId, workspaceId, transcriptDigest, sourceKind (voice|text), observedAt, goal, repository, branch, expectedHeadSha, requestedOperations, evidenceRefs, riskClass, approvalState (unapproved), councilQuestion.

The transcript is evidence of *what was heard*, never founder approval. Reject unknown fields, malformed digests, and unsupported operations at runtime. The intent compiler must not set executionAuthorized=true.

`council_response@v1` fields: requestId, providerSeat, providerInvocationRef, simulated, findings, dissent, evidenceRefs, proposedNextGate, authorityCeiling (reason), executionAuthorized (false).

No provider can claim another provider's witness or transform advice into approval.

## Red Team Twin
Twin A before change: challenge duplication, scope, transcript ambiguity, privacy, model/provider independence, and whether the change is necessary.
Twin B after change: test forged speaker approval, prompt injection, stale SHA, expired grant, replayed request, provider spoofing, fabricated receipts, missing Playwright proof, and denied capability widening.

## Lindy / OODA / L99
Reuse durable contracts. Observe exact head and current routing; orient on one gap; decide smallest reversible seam; act only within approved scope; verify focused tests and real browser path when UI is involved; preserve receipts and rollback. Identity hashes never grant authority.

## Implementation gates
1. Inspect current council transport and V10 receipt tests on exact head.
2. Add a parser/validator for the non-authorizing voice-intent envelope, with negative tests.
3. Route through existing council transport; preserve provider witness class and dissent.
4. Prove denied execution without a separate founder-bound L99 receipt.
5. Test real UI with Playwright before claiming functional completion.
6. Request separate exact-head review and founder approval before merge or deployment.

## Stop condition
Stop if existing contract already covers the use case, source identity changes, required provider evidence is unavailable, or authority would be widened. No merge, deploy, credential access, or production mutation is authorized by this address.

## Required council return
REALITY / FIX / PROOF / RISK / ROLLBACK / NEXT GATE, with VERIFIED / INFERRED / UNKNOWN / BLOCKED labels. Keep dissent visible.
