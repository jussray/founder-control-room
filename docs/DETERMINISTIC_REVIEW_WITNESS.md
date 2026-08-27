# Deterministic Review Witness V1

Status: **CORE INTEGRATED ON MAIN / FOUNDER-RUNTIME IGNITION CANDIDATE / BOOTSTRAP REQUIRED / NOT MERGE AUTHORITY**

Milestones A and B are integrated on `main`: the deterministic producer, narrow GitHub-App witness provider, publication/readback logic, and founder-final consumer exist in the trusted source tree. The remaining execution gap is a trusted invocation surface that runs those integrated components from an exact current-`main` FCR release rather than from candidate-controlled pull-request code.

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

Trusted ignition must execute from code that is already integrated and running as exact current FCR `main`. Candidate-controlled PR workflows, candidate preview deployments, stale production releases, and PAT-only environments are not trusted witness issuers.

The current founder-runtime ignition candidate adds `POST /review/deterministic-witness/:pullRequestNumber` inside the protected FCR server trust root. It is intentionally narrow:

1. the browser mutation must first pass the existing same-origin membrane;
2. repository-wide rate limiting applies before the route;
3. the route requires authenticated founder plus `fcr-privileged-execution-master`;
4. the caller supplies only a positive pull-request number;
5. repository and provider identity are fixed in server-owned source;
6. the running release must expose a full `GIT_SHA` and provider-resolved GitHub `main` must equal that exact SHA before publication;
7. the existing producer/publisher derives PR/base/head/diff/verdict/hash/check/App identity and performs exact-head witness publication/readback;
8. GitHub `main` is re-read after publication and must still equal the running `GIT_SHA`; and
9. the response remains proposal-only with `mergeAuthorized: false` and `executionAuthorized: false`.

This exact-current-main check is load-bearing. It prevents a pull-request preview from using its candidate SHA to bootstrap its own trust-root change, and prevents an older deployed FCR release from minting current witness evidence with stale reviewer logic.

A default-branch workflow could provide another trusted ignition surface only if it preserves the same invariants: exact current-main checkout, server-owned App credentials, PR-number-only selection, provider-derived identity, before/after mutable-main revalidation, retained evidence, and no merge authority.

A successful advisory test workflow or successful route source test proves source execution only. It does not itself emit the constitutional independent-review witness, satisfy founder-final authority, authorize merge, or prove that the exact merged release and GitHub App credentials are live in production.

## Bootstrap boundary

The candidate that first installs trusted ignition necessarily changes the deterministic-review trust root, so normal deterministic review is expected to report trust-root self-modification and withhold its own constitutional witness. That is the correct fail-closed result, not a defect to suppress.

Its integration therefore requires the separately explicit, exact-candidate, durable founder manual-merge override class defined by issue #418 after fresh exact-head machine proof and applicable provider/readback evidence are captured. Ordinary `approved`, `cont`, mergeability, machine green, model review, or bypass capability do not invoke that exception.

After lawful integration, the exact merged release must be deployed and `/version` must re-observe that release identity before the founder-runtime trigger may be treated as available witness-production authority. Once that is proven, later non-trust-root candidates can use the normal deterministic receipt + trusted witness + founder-final path without this bootstrap exception.
