# Deterministic Review Witness V1

Status: **BUILT / ADVISORY-EXECUTION-PROVEN / NOT INTEGRATED / NOT MERGE AUTHORITY**

Milestone B adds the provider-backed witness path that consumes the deterministic review producer introduced by Milestone A.

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

A successful advisory test workflow proves source execution only. It does not itself emit the constitutional independent-review witness, satisfy founder-final authority, authorize merge, or prove live GitHub App permissions/configuration.

This Milestone B candidate changes the deterministic review/provider trust boundary and therefore cannot self-certify its own integration. No current executable founder manual-merge override exists in FCR source. Bootstrap remains a separate unresolved constitutional decision/path.
