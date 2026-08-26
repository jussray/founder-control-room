# Deterministic Review Witness V1

Status: **CORE INTEGRATED ON MAIN / TRUSTED DEFAULT-BRANCH IGNITION CANDIDATE / BOOTSTRAP REQUIRED / NOT MERGE AUTHORITY**

Milestones A and B are integrated on `main`: the deterministic producer, narrow GitHub-App witness provider, publication/readback logic, and founder-final consumer exist in the trusted source tree. The remaining execution gap is the trusted invocation surface that runs those integrated components from exact current `main` rather than from candidate-controlled pull-request workflow code.

## Authority chain

```text
provider-backed PR truth
-> deterministic producer
-> proposal-only independent-review receipt
-> narrow repository-provider witness capability
-> repository-scoped server-owned GitHub App
-> exact-head GitHub Check Run
-> provider readback with exact App issuer + full receipt fingerprint
-> independent-review gate
-> authenticated founder-final authority
-> final mutable readback
-> merge
```

The witness path does not accept a caller-supplied receipt, reviewer identity, verdict, check name, conclusion, head SHA, publisher object, or trusted App identity. It calls the deterministic producer internally, requires a clear/publishable result, re-reads PR identity before publication, publishes only the derived `Independent Review / <reviewer> / <hash-prefix>` signal, then re-reads provider evidence and PR identity after publication.

The repository-provider write is deliberately narrow. `publishDeterministicReviewWitness(...)` is not a generic Check Run API. The GitHub implementation is restricted to `jussray/founder-control-room`, requires a full commit SHA, full SHA-256 review hash, exact name/hash binding, bounded non-empty summary, success-only Check Run shape, and records the full review hash as the provider `external_id`.

The full review hash is load-bearing on readback, not audit decoration. `DeterministicReviewGitHubProvider.listVerificationSignals(...)` preserves Check Run `external_id` as `VerificationSignal.evidenceFingerprint`. Both witness publication orchestration and the canonical founder-final independent-review gate require that full fingerprint to equal the exact receipt `reviewHash`, in addition to exact head, receipt-derived signal name, passed status, and trusted numeric GitHub App issuer. A missing fingerprint or a different 64-hex fingerprint that merely shares the displayed hash prefix fails closed.

Provider construction exposes witness publication only when `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` produce a repository-scoped GitHub App installation token. The local/development `GITHUB_TOKEN` fallback retains ordinary repository capability but cannot mint deterministic review evidence.

## Trusted ignition

The executable ignition must run from the trusted default branch. A manual dispatch may accept only a pull-request number as selection input; repository identity, PR/base/head identity, author, diff, verdict, receipt hash, Check Run name, and trusted App identity remain derived by server-owned code.

The trusted job must:

1. check out the exact workflow `main` SHA;
2. re-read GitHub `main` and require the checked-out SHA to still be current before publication;
3. use the production `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` boundary;
4. run the integrated producer/publisher and its focused adversarial tests from that trusted checkout;
5. publish and read back the exact-head witness;
6. re-read `main` after publication and fail if it moved; and
7. retain the deterministic receipt plus provider readback as an evidence artifact.

The default-branch dispatch workflow and its runner are themselves deterministic-review trust roots. A candidate that changes either must receive the normal producer's P1 self-modification finding and cannot certify itself through the same deterministic path.

A successful advisory test workflow proves source execution only. It does not itself emit the constitutional independent-review witness, satisfy founder-final authority, authorize merge, or prove live GitHub App permissions/configuration.

## Bootstrap boundary

The candidate that first installs the trusted ignition necessarily changes the deterministic-review trust root, so it is expected to be P1-blocked by the normal producer. That is the correct fail-closed result, not a defect to suppress.

Its integration therefore requires the separately explicit, exact-candidate, durable founder manual-merge override class defined by issue #418 after fresh machine proof and live provider/readback evidence are captured. Ordinary `approved`, `cont`, mergeability, machine green, or model review do not invoke that exception. Once the ignition is lawfully integrated on `main`, later non-trust-root candidates can use the normal deterministic receipt + trusted witness + founder-final path without this bootstrap exception.
