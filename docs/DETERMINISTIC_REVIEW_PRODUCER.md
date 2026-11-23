# Deterministic Review Producer V1

Status: **SOURCE IMPLEMENTED / TRUSTED WITNESS PATH INTEGRATED / CURRENT PROVIDER WITNESS MUST BE OBSERVED** (reviewed 2026-10-29)

Issue: #712

## Purpose

Founder Control Room's canonical founder-final merge policy requires a deterministic independent-review receipt and a trusted provider-backed witness before founder-final authority can be considered. The producer (`src/review/deterministicReviewProducer.ts`), publisher (`src/review/deterministicReviewWitnessPublisher.ts`), GitHub App provider, and trusted-main witness workflow (`.github/workflows/deterministic-review-core-advisory.yml`) are now present in source. **Presence and passing unit tests do not prove a witness was actually issued for the current PR head.**

V1 separated these capabilities as implementation milestones (historical architecture):

```text
Milestone A
provider-derived deterministic receipt producer
(read-only)

Milestone B
trusted GitHub-App verification witness publisher
(privileged provider write + readback)
```

Milestone A and Milestone B now exist in current source. The trusted workflow's `/review-witness <pr-number> <exact-current-main-sha>` command is founder-originated on issue #418; it derives an exact-head review receipt and publishes only through the authorized GitHub App, with provider readback. The command does **not** authorize a merge. The read-only GitHub App secret-shape diagnostic is a separate workflow; see `docs/SECRETS.md`.

## Authority boundary

The producer is mechanical, reproducible, proposal-only, and non-authorizing.

It does not claim semantic code correctness and does not convert generic CI green into approval. It cannot merge, approve, deploy, mutate provider policy, write secrets, alter databases, publish content, or mint founder-final authority.

The API intentionally accepts only a repository provider and pull-request number. Repository identity, base/head identity, author identity, diff content, diff hash, founder-final policy, reviewer identity, rule version, verdict, and receipt hash are derived inside trusted code rather than supplied by a caller.

## Provider identity and freshness

The producer requires the GitHub repository provider and uses `getPullRequestReviewContext()` for the canonical FCR project. The provider already fails closed for closed or draft pull requests.

V1 additionally requires:

- repository and head repository both equal `jussray/founder-control-room`;
- base ref equals `main`;
- exact full base/head SHAs;
- non-empty provider author identity;
- fresh provider ref readback still equals the reviewed base/head;
- provider compare is bound to those exact SHAs;
- `behindBy === 0` and `aheadBy >= 1`;
- canonical `independentReviewDiffHash()` succeeds, which fails closed when provider diff completeness is not established.

No caller metadata can repair a moved base/head or an incomplete diff.

## Rule identity

V1 rule identity is fixed as:

```text
reviewer.id = fcr-deterministic-review-v1
reviewer.kind = deterministic
reviewer.runtime = fcr-deterministic-rules@v1
policy = server-owned FCR_FOUNDER_FINAL_REVIEW_POLICY
```

The reviewer identity/runtime and policy hash participate in the existing review receipt hash, so a rule-version or policy transition invalidates prior receipt identity.

## V1 mechanical rules

### P1: trust-root self-modification

The normal producer blocks a candidate that changes its own trust roots, including:

- `src/review/deterministicReviewProducer.ts`;
- the reserved witness-publisher path;
- `src/review/independentReviewGate.ts`;
- `src/http/routes/approvals.ts`;
- `src/providers/RepositoryProvider.ts`;
- `src/providers/GitHubProvider.ts`.

Such a candidate requires a separately explicit bootstrap/constitutional authority path. The normal producer must not certify the code that defines or interprets its own authority.

### P2: test-discovery companion coupling

When any of these change:

- `vitest.config.ts`;
- `scripts/verify-test-discovery.mjs`;
- `scripts/test-discovery-baseline.json`;

V1 requires both:

- `scripts/verify-test-discovery.node-test.mjs`;
- `docs/TEST_DISCOVERY_DEBT.md`.

This checks only path coupling. The executable test-discovery verifier and CI remain separate proof lanes.

### P2: merge/provider truth coupling

When non-test review/merge authority source changes, V1 requires `docs/FOUNDER_MERGE_AUTHORITY.md` in the same diff.

When non-test repository-provider implementation source changes, V1 requires `docs/PROVIDERS.md` in the same diff.

These are companion-presence rules only. Documentation Truth remains a separate semantic ratchet.

## Receipt semantics

When trusted provider identity and diff completeness are established, the producer emits a canonical `juss-v10/independent-review@v1` receipt.

```text
P1 finding present -> blocked
P2 finding present -> needs_review
no findings        -> clear
```

Every receipt remains:

```text
proposalOnly: true
mergeAuthorized: false
executionAuthorized: false
```

A clear receipt alone is not sufficient for the founder-final gate.

## Milestone B contract (implemented in source, per-run proof required)

The implemented witness publisher must:

1. receive the exact deterministic receipt produced by trusted server code;
2. publish `expectedReviewSignalName(receipt)` as a Check Run on the exact reviewed head;
3. prevent candidate-controlled workflows or caller credentials from selecting the trusted App identity;
4. read the Check Run back through the repository provider;
5. require the provider-reported App issuer id to equal server-owned `GITHUB_APP_ID`;
6. fail closed on wrong/missing issuer, wrong head, mismatched receipt hash/name, or provider ambiguity.

The narrow publication implementation and associated tests now exist. Only a successful current-head, trusted-App-issued Check Run with full receipt-hash readback meets this contract; a failed historical run, a green candidate CI job, or a stored secret name does not. The producer does not gain generic Check Run write capability.

## Bootstrap boundary

The original producer implementation slice changed its own trust-root file, so its bootstrap review correctly blocked self-certification. This paragraph describes that historical candidate; it is not a permanent claim that every later PR modifies the trust root.

Ordinary `cont`, `approved`, machine-green CI, or a semantic model review does not invoke the founder manual-merge override and cannot bootstrap this trust root.

## Rollback

For a new proposal, close or revert its unmerged changes without weakening the current trusted producer/publisher. A failed publication must leave the candidate unmerged and the independent-review gate non-authorizing. Credential diagnosis, if necessary, is handled by the existing secret-safe workflow and provider-scope verification rather than by replacing an App key based on old documentation.

## Evidence freshness and credential handling

On 2026-10-20 trusted [run 39366213104](https://github.com/jussray/founder-control-room/actions/runs/39366213104) failed while the witness publisher attempted to parse its mapped `GITHUB_PRIVATE_KEY`. That proves the **historical execution failure**, not that the current GitHub App key needs replacement or that any current secret has the same shape. No witness was issued by that failed run. Never infer current credential validity solely from a failed predecessor run.

The GitHub Actions `production` environment provides `APP_ID` and `APP_PRIVATE_KEY`; the trusted job maps them to runtime `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`. `docs/SECRETS.md` and `.github/workflows/github-app-secret-shape-diagnostic.yml` define the current read-only, secret-redacted diagnostic path. Use a fresh exact-current-main result to distinguish an actual invalid secret, wrong environment/consumer, transport format, and absent provider proof before proposing any provider-side change. **Do not generate, rotate, delete, overwrite, paste, or disclose a private key merely to satisfy outdated runbook prose.**
