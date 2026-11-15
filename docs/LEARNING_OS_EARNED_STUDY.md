# Learning OS | Earned Outcome Study Contract v1

Status: SOURCE KERNEL ONLY on FCR PR #1055. No independent service, durable store, deployed API, UI, or autonomous action authority is claimed.

## Two systems, two responsibilities

FCR governs execution and truth: state -> evidence -> claim. Submission, validation, approval, execution, provider acceptance, and observed outcome remain different facts. An action is earned only if its exact proposal, approval, receipt, and required outcome proof survive independent gates. Execution alone does not prove success.

Learning OS studies verified experience: earned outcome -> observed -> interpreted -> learned candidate -> retained -> applied -> improved (or challenged/revised).

These are separate state machines, not one field. Learning OS consumes independently verified FCR outcomes. It cannot issue or renew approval, merge, deploy, publish, spend, write providers, or change FCR truth. Chief and DeepSeek may propose but cannot self-certify learning or application.

## Honesty rules

- SUBMITTED != VALIDATED != APPROVED != EXECUTED.
- PROVIDER ACCEPTED != VERIFIED OUTCOME.
- EARNED != UNDERSTOOD. INTERPRETED != ESTABLISHED KNOWLEDGE.
- The learned *phase* is a candidate, not demonstrated learning.
- RETAINED != APPLIED. Until independently proven later application, learningDemonstrated remains false.
- APPLIED != IMPROVED. Verified reuse does not demonstrate better results.
- OBSERVED IMPROVEMENT != CAUSAL ATTRIBUTION; stronger causal claims require suitable evidence.
- A challenged or revised study cannot keep presenting old application/improvement as current.

A verified failed outcome is eligible for study. Its result remains failed even if useful lessons emerge.

## Existing source and boundary

- src/learning-os/learningOs.ts: independent pure transition kernel.
- src/founder-os-lab/outcomeObservation.ts: existing FCR outcome data contract.
- src/lib/v10ClosedLoopOutcome.ts: existing receipt and source-head binder, not live runtime proof.
- src/lib/canonKnowledge.ts: historical verified canon reducer on PR #1055, not a Learning OS database, live-truth lease, or separate authority.
- docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md: independent proposal-only instructor.

beginLearningStudy requires a valid, independently verified V10 result (success or failure), exact project/head, receipt, source timestamp, and trusted verifier. Its verifyOutcome callback must check the authoritative FCR/provider receipt identity, project, exact head, proof, freshness, and provenance. NEVER use an unconditional true callback in production or treat model-supplied proof as independent.

advanceLearningStudy requires trusted verifyStep for every transition. For applied, require a distinct, independently verified later outcome receipt bound to the exact target project/head. For improved, require independently measured baseline, current metric, and a justified better direction. Callback acceptance is a server-side trust boundary, not a caller-supplied boolean.

Events are sequenced and SHA-256 hash-linked. Source identity includes result, receipt, observation time, evidence refs, plan hash, and verifier. A hash is local tamper evidence, NOT source authentication, an authorization grant, or an immutable durable store.

Durable production storage requires atomic append-and-compare, tenant/project scoping and row-level security, replay protection, independent provider verification, audit, redaction, retention controls, and trusted anchoring of the prior event. Never place secrets, raw customer/teen records, or unrelated private content in lesson statements or receipts.

## Lifecycle and stop behavior

Normal: observed -> interpreted -> learned -> retained -> applied -> improved.
Challenge/revision is separate: challenged -> revised -> retained, then independently test a fresh application.

Illegal transition, stale timestamp, tampered event/source, missing proof, source-receipt self-reuse, and failed independent verification must fail closed for the affected action only.

## Verification and production limits

- FCR default Vitest discovers src/learning-os/learningOs.test.ts.
- Standalone adversarial tests are in tests/learningOs.node.test.mjs and require node --import tsx --test tests/learningOs.node.test.mjs when dependencies are installed.
- Source readback is not typecheck, test, deploy, runtime, or outcome proof. No UI currently exists, so no Playwright UI claim is made.
- Before production, implement a separate access-controlled study store, trusted receipt verifiers, persisted replay/tenant tests, read-only study presentation, and one traced real cross-project reuse plus later measured result.
- The Learning OS must not create another event bus or competing FCR approval gate. Any later authorized project action still belongs to FCR and that project's real control plane.

Acceptance criterion: a proven original result becomes a scoped candidate; an independently proven later application demonstrates reuse; independent measurements test improvement. Otherwise the honest status is retained candidate.

## Canonical FCR database and authenticated authority integration (verified 2026-11-06)

The connected FCR Supabase project has `public.missions`, `public.approval_executions`,
`public.outcomes`, and `public.founder_permission_requests`. It does **not** have
`public.fcr_receipts` or a `missions.domain` column. Do not create a fake
`fcr_receipts` prerequisite or silently backfill a guessed taxonomy. The
additive migration uses `learning_mission_domains` with explicit source references.

FCR already has `src/http/middleware/requireFounder.ts` exporting
`requireFounder` and `requireInteractiveFounder`. The latter authenticates
a current opaque founder browser session and verifies the canonical founder
allowlist. Future high-consequence Learning OS routes must reuse this middleware
and FCR's exact-action decision receipt; `LearningController` is not an HTTP
authorization boundary and cannot independently certify its caller.

## Study-to-ledger mapping

The study kernel and SQL ledger represent different aspects of experience.
`src/learning-os/lifecycle.ts` has an observation-only compatibility
projection; a matching vocabulary does **not** prove a verified outcome:

| Study phase | SQL ledger | Interpretation |
| --- | --- | --- |
| observed | OUTCOME_RECORDED | Exact earned outcome still needs independent verification |
| interpreted | INTERPRETED | SQL requires separate signal and hypothesis records |
| learned | INTERPRETED | Candidate hypothesis, **not** demonstrated learning |
| retained | RETAINED | Retained knowledge, not reused |
| applied | APPLIED | Independently proved new mission reuse required |
| improved | REVISED | SQL means *application review*; measured improvement requires an independent downstream outcome |
| challenged | no representation | Hold; cannot silently retain disputed knowledge |
| revised | no representation | Hold; do not confuse with SQL REVISED application review |

A future durable challenge/revision event and trusted source-to-ledger receipt
binding are required before operational synchronization of all phases. Never
translate a model claim, receipt-shaped string, or successful CI job into
founder authority or learning demonstration.

### Exact-head validation and open preview gate

This PR's new migration was checked in a rollback-only transaction against the
existing FCR Supabase schema; the production migration was not applied.
`Create/Delete Branch for Pull Request` failed on head
`125d52272cf09af8cc7d74d021cbbf4cafef0b4c`: its **Neon preview**
had no `public.missions` table. FCR production does have this table. The
Neon preview must be provisioned from a trustworthy canonical schema (or its
independent integration proof path must be made explicit) before this is green.
Do not delete the FK, replace it with a stub table, or skip the failing
migration merely to pass CI. New exact-head proof supersedes the cited historic
head.
