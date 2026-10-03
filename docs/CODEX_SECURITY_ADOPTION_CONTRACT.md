# Codex Security Adoption Contract

Status: **source contract candidate**
Owner: Founder Control Room
Applies to: OpenAI Advanced Cyber Deployment training inputs, Codex Security scan evidence, Daybreak Blue / Daybreak Red evidence, GitHub Actions security artifacts, application-security workflows, runtime stop/refusal evidence, and future provider readback adapters.

## Decision

OpenAI cyber-deployment material is an external capability and training input. It does not replace Founder Control Room, Chief AI, PromptOS, the Council, repository truth, or founder-final authority.

The adoption rule is:

```text
external training / provider capability
-> Chief evaluates relevance
-> FCR validates bounded evidence
-> existing authority membrane remains in force
-> exact-subject proof is recorded
-> founder/repository merge and deploy gates remain separate
```

Codex Security and Daybreak are therefore **evidence/capability providers**, not a second control plane.

## Secure SDLC / AppSec fit

Security belongs inside the software-delivery loop rather than being deferred until production. FCR treats these as representative pre-ship security workflows:

1. **continuous code scanning** — scan current source/candidate state and bind findings to the exact repository, head, and scope;
2. **scanning in a test environment** — observe the built/running candidate in a bounded non-production environment and keep runtime evidence separate from source evidence;
3. **security-finding validation** — independently confirm whether a reported finding is reproducible, applicable, stale, false-positive, or still `UNKNOWN`;
4. **security patch automation** — propose or apply the smallest bounded repair only through separately granted write authority, then reacquire exact-head and runtime proof.

A scanner result can supply evidence. It cannot grant merge, deploy, remediation, provider-write, or production authority. Automated patching must preserve the exact finding, changed files, diff identity, tests, rollback, and the authority receipt that allowed the write.

## Current implementation state

```text
contract-capable            yes — bounded receipt evaluator + runtime-stop diagnosis exist in source
configured / allowlisted    no — no live Codex Security provider route is configured here
adapter-proven              source/unit-test only
provider-outcome-proven     no
merge-authority             unchanged / separately gated
production-deploy-authority unchanged / separately gated
```

Do not promote this lane beyond those states without fresh evidence.

## Bounded proof adapter

`src/lib/codexSecurityProofAdapter.ts` accepts only a normalized `juss/codex-security-scan@v1` receipt and compares it with a separately supplied expected proof subject.

The receipt must bind:

- exact repository;
- exact 40-character head SHA;
- exact scope fingerprint;
- scan identity;
- evidence source;
- SHA-256 artifact digest;
- start, completion, and observation timestamps;
- terminal scan state;
- finding counts;
- external-write declaration/evidence; and
- explicit authorization + scope references for Daybreak Red evidence.

The adapter does **not** call OpenAI, Codex Security, GitHub, a shell, or any external provider. Provider wiring remains a separate future step after the actual supported provider/API/CLI surface is independently observed.

## Proof planes

The adapter keeps these evidence planes distinct:

| Evidence source | Normalized proof level | What it can prove |
| --- | --- | --- |
| GitHub Actions artifact | `exact-head` | a scan artifact is bound to the expected candidate subject |
| provider readback | `provider-observation` | the provider reported the normalized scan state for the bound subject |

Neither proof level by itself proves merge approval, deploy approval, external-write approval, runtime safety, remediation success, or a user/business outcome.

## Runtime stop/refusal evidence

`src/lib/runtimeStopEvidence.ts` implements the evidence-first stop contract.

Before interpreting a refusal, error, monitor stop, or tool failure, preserve the internal evidence record containing:

- the exact request;
- selected model;
- product surface;
- organization and user references;
- intended defensive outcome;
- the actual notice, error, or response rather than a remembered template;
- available request IDs and timing;
- boundary-by-boundary receive/forward evidence;
- which tools ran;
- what those tools changed;
- rollback references when they exist; and
- which requested work is complete versus incomplete.

The exact request/response remain private evidence. A review packet must be redacted through the approved review route: no credentials, no raw request/response by default, no unnecessary organization/user identifiers, and no unrelated sensitive content.

### Diagnose where the request stopped

Use the ordered execution chain:

```text
CLIENT
-> EDGE
-> APPLICATION
-> PROVIDER_API
-> MODEL
-> TOOL
-> POST_PROCESSING
```

For each boundary, record `received`, `forwarded`, and evidence references. Diagnose the **last boundary proven to have received the request** and the **first transition whose successful forward progress is not proven**. Do not infer the producer of a customer-visible response from text alone.

A refusal-looking message does not prove a model refusal. A model refusal requires independent evidence that model execution occurred and that the completion itself produced the refusal. An upstream service error remains a possible system-refusal path when model execution is not proven.

### Real-world stop examples

**Example A — upstream outcome**

An engineer submits a defensive request about an owned staging system and receives a service error instead of a useful completion. Preserve the exact request, status/error, selected model, organization/user context, intended defensive outcome, request IDs, timing, and boundary evidence. Classify it as a **possible system-refusal path** unless model execution is independently proven. Do not attribute it to the model from HTTP status or message text.

**Example B — model response**

A request reaches the model and the completion declines to execute an exploit against a live target while redirecting toward defensive validation/remediation. When model execution and the model completion are both evidenced, classify it as a **model-refusal path**. Preserve the request, completion, identity context, intended outcome, and request/trace evidence.

**Example C — monitored stop after an action**

An approved security review is stopped by monitoring after a tool writes a file. Preserve the monitor error, request IDs, tool record, exact changed-file evidence, and remaining incomplete work. The stop does not complete the review and does not restore the file. Reconcile the file change with the responsible operator. **Do not automatically resubmit the blocked workflow.**

## Refusal behavior does not define authorization

None of the signals above establishes whether the work was authorized.

```text
observed runtime behavior != authorization state
```

Diagnose what happened first. Review what actually changed second. Make the authorization judgment separately from current authority evidence.

Therefore all of these combinations are valid and must remain representable:

- authorized request + provider/system refusal;
- authorized request + model refusal;
- authorized request + monitored stop after a partial write;
- unauthorized request + ordinary response;
- unknown authorization + refusal/error/stop.

Never infer authorization from a refusal, acceptance, successful tool call, provider status, model completion, monitor stop, or customer-visible wording. Authorization must come from the separate authority plane and remain bound to exact scope, subject, action, freshness, and replay rules.

## Stop response protocol

When a security workflow stops unexpectedly:

1. **Preserve** the exact internal request/response evidence and request IDs before normalization.
2. **Diagnose** last verified boundary + first unproven transition without guessing the producer.
3. **Reconcile side effects** by inspecting every tool invocation and changed artifact. A stop never implies rollback.
4. **Mark incomplete work** explicitly. A partial action is not a completed review.
5. **Evaluate authorization separately** from runtime behavior and security classification.
6. **Do not blind-retry** an ambiguous or monitored stop, especially after a mutation. Reconcile before retry.
7. **Share only a redacted review record** through the approved review route, excluding credentials and unnecessary sensitive content.

## Terminal-state semantics

- `passed` -> verified scan evidence; candidate may continue to its other gates.
- `findings` -> verified evidence of findings; candidate remains `HOLD`.
- `failed` -> scan execution failure is real evidence, but no security outcome is promoted; disposition is `REPAIR`.
- `cancelled` -> security conclusion remains `UNKNOWN`; disposition is `HOLD`.

A scan result must never turn skipped, cancelled, unavailable, stale, mismatched, or failed proof into green.

## Authority invariants

Every normalized receipt returns all of these as `false`:

```text
executionAuthorized
mergeAuthorized
deployAuthorized
providerMutationAuthorized
externalWriteAuthorizedByReceipt
```

A receipt is evidence, not authority.

An approval reference inside security evidence proves only that the evidence packet claims a separately scoped approval existed. It is not a bearer token and must not be replayed as execution authority. Any real external mutation still requires the existing FCR authority path and execution-time revalidation.

## Daybreak Blue / Daybreak Red

Daybreak Blue evidence may be recorded through the ordinary bounded security-evidence contract.

Daybreak Red evidence is accepted only when the receipt includes:

- `approved: true`;
- a non-empty approval reference; and
- a non-empty bounded scope reference.

This is an evidence-admission requirement only. It does not create or execute an offensive-testing action. Actual provider capability, authorization, scope, environment, and human approval remain independent gates.

## External-write truth

If a scan receipt reports that an external write occurred:

1. it must also declare the write was requested; and
2. it must carry an explicit approval reference.

Otherwise the receipt is `BLOCKED`.

Even when those fields exist, the normalized evidence still grants no external-write authority. This prevents provider output or a copied artifact from becoming a mutation credential.

## Integration rule

Do not invent a Codex Security API, CLI command, environment variable, token shape, GitHub Action, or provider endpoint from training prose.

Before live wiring:

1. observe the actual supported OpenAI/Codex Security integration surface;
2. bind that surface to the narrowest FCR provider adapter;
3. keep credentials server-side and out of logs/artifacts/chat;
4. allowlist only the required operation set;
5. preserve exact repository/head/scope binding;
6. record provider execution separately from security outcome;
7. retain artifacts needed for independent review;
8. make ambiguous provider outcomes reconcile-before-retry; and
9. require the existing founder/repository gates for any write, remediation, merge, or deployment.

## Adoption classifications

Use these classifications as course material arrives:

- **ALREADY HAVE**: FCR/Chief/PromptOS already enforce the invariant at equal or stronger strength.
- **ADOPT**: materially new capability fits the existing architecture without weakening it.
- **ADAPT**: useful mechanism needs translation into provider-neutral FCR contracts.
- **REJECT**: duplicates a control plane, collapses proof into authority, weakens exact-subject binding, hides external writes, or conflicts with current founder governance.

The initial baseline is:

| OpenAI cyber-deployment / AppSec theme | Current decision |
| --- | --- |
| secure SDLC / pre-ship AppSec | `ADAPT` into existing exact-head + runtime proof planes |
| continuous code scanning | `ADAPT` as exact-subject scan evidence |
| test-environment scanning | `ADAPT` as bounded runtime evidence distinct from source proof |
| finding validation | `ALREADY HAVE` evidence/review primitives; extend per provider as needed |
| security patch automation | `ADAPT` behind separate write authority + rollback + successor proof |
| explicit scope + human approval | `ALREADY HAVE` |
| bounded external writes | `ALREADY HAVE` |
| proof / provenance / stale-evidence handling | `ALREADY HAVE` |
| recovery / rollback | `ALREADY HAVE` |
| runtime stop/refusal diagnosis | `ADOPT` as `juss/runtime-stop-evidence@v1` |
| GitHub PR proof gates | `ADAPT` only where new evidence is additive |
| Codex Security normalized evidence | `ADOPT` as this bounded proof contract |
| live Codex Security provider adapter | `WAIT` until provider surface is observed |
| Daybreak Blue evidence | `ADAPT` into this receipt contract |
| Daybreak Red evidence | `ADAPT` with explicit authorization/scope evidence and no authority carry-forward |

## Verification

Focused source proof lives in:

- `src/lib/codexSecurityProofAdapter.ts`
- `src/lib/__tests__/codexSecurityProofAdapter.test.ts`
- `src/lib/runtimeStopEvidence.ts`
- `src/lib/__tests__/runtimeStopEvidence.test.ts`

The tests cover:

- exact-head subject binding;
- no authority transfer from a valid receipt;
- stale/mismatched head rejection;
- Daybreak Red authorization/scope evidence requirements;
- undeclared/unapproved external-write evidence rejection;
- false-green resistance for failed/cancelled scans;
- findings -> verified evidence + hold;
- provider-observation vs exact-head proof separation;
- malformed digest/time evidence rejection;
- upstream error vs model-refusal separation;
- producer attribution remaining unknown without model evidence;
- monitored stop after a tool mutation preserving side-effect truth;
- incomplete work remaining incomplete after a stop;
- no automatic resubmission after monitored stop;
- refusal behavior remaining independent from authorization state; and
- redacted review records omitting raw request/response and direct organization/user identifiers.

## Rollback

Before merge: discard the focused candidate branch. `main` remains unchanged.

After a lawful merge: revert the focused adapter, runtime-stop contract, tests, and this document. No provider-side rollback is implied because this source contract performs no provider mutation.

## Next gate

The next gate is **not** to wire a guessed provider call.

Complete/inspect the relevant OpenAI training step or authoritative product documentation, identify the real Codex Security integration surface, then compare it against this contract. Only then decide whether a live adapter is `ADOPT`, `ADAPT`, or `REJECT`.
