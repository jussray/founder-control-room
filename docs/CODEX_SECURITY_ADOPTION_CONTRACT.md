# Codex Security Adoption Contract

Status: **source contract candidate**
Owner: Founder Control Room
Applies to: OpenAI Advanced Cyber Deployment training inputs, Codex Security scan evidence, Daybreak Blue / Daybreak Red evidence, GitHub Actions security artifacts, and future provider readback adapters.

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

## Current implementation state

```text
contract-capable           yes — bounded receipt evaluator exists in source
configured / allowlisted   no — no live Codex Security provider route is configured here
adapter-proven             source/unit-test only
provider-outcome-proven    no
merge-authority            unchanged / separately gated
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

| OpenAI cyber-deployment theme | Current decision |
| --- | --- |
| explicit scope + human approval | `ALREADY HAVE` |
| bounded external writes | `ALREADY HAVE` |
| proof / provenance / stale-evidence handling | `ALREADY HAVE` |
| recovery / rollback | `ALREADY HAVE` |
| GitHub PR proof gates | `ADAPT` only where new evidence is additive |
| Codex Security normalized evidence | `ADOPT` as this bounded proof contract |
| live Codex Security provider adapter | `WAIT` until provider surface is observed |
| Daybreak Blue evidence | `ADAPT` into this receipt contract |
| Daybreak Red evidence | `ADAPT` with explicit authorization/scope evidence and no authority carry-forward |

## Verification

Focused source proof lives in:

- `src/lib/codexSecurityProofAdapter.ts`
- `src/lib/__tests__/codexSecurityProofAdapter.test.ts`

The tests cover:

- exact-head subject binding;
- no authority transfer from a valid receipt;
- stale/mismatched head rejection;
- Daybreak Red authorization/scope evidence requirements;
- undeclared/unapproved external-write evidence rejection;
- false-green resistance for failed/cancelled scans;
- findings -> verified evidence + hold;
- provider-observation vs exact-head proof separation; and
- malformed digest/time evidence rejection.

## Rollback

Before merge: close the carrier branch/PR. `main` remains unchanged.

After a lawful merge: revert the focused adapter, tests, and this document. No provider-side rollback is implied because this source contract performs no provider mutation.

## Next gate

The next gate is **not** to wire a guessed provider call.

Complete/inspect the relevant OpenAI training step or authoritative product documentation, identify the real Codex Security integration surface, then compare it against this contract. Only then decide whether a live adapter is `ADOPT`, `ADAPT`, or `REJECT`.
