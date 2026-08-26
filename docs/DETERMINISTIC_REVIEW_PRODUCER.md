# Deterministic Review Producer V1

Status: `SOURCE_IMPLEMENTED__WITNESS_PUBLISHER_NOT_IMPLEMENTED`

Issue: #712

## Purpose

Founder Control Room's canonical founder-final merge policy requires one deterministic independent-review receipt before founder-final authority can be considered. Current main can validate such a receipt and read a provider-backed verification witness, but it does not yet contain the production receipt producer or trusted GitHub-App witness publisher.

V1 deliberately separates those missing capabilities:

```text
Milestone A
provider-derived deterministic receipt producer
(read-only)

Milestone B
trusted GitHub-App verification witness publisher
(privileged provider write + readback)
```

This slice implements Milestone A only.

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

## Missing Milestone B

Production review authority remains blocked until a separately privileged server-owned GitHub App capability can:

1. receive the exact deterministic receipt produced by trusted server code;
2. publish `expectedReviewSignalName(receipt)` as a Check Run on the exact reviewed head;
3. prevent candidate-controlled workflows or caller credentials from selecting the trusted App identity;
4. read the Check Run back through the repository provider;
5. require the provider-reported App issuer id to equal server-owned `GITHUB_APP_ID`;
6. fail closed on wrong/missing issuer, wrong head, mismatched receipt hash/name, or provider ambiguity.

That provider mutation must be implemented and reviewed separately. Milestone A must not grow an ambient Check Run write capability merely to make #706 green.

## Bootstrap boundary

This producer slice changes its own trust-root file, so V1 is expected to return a blocking trust-root finding if asked to review this exact PR through the normal producer. That is intentional.

Ordinary `cont`, `approved`, machine-green CI, or a semantic model review does not invoke the founder manual-merge override and cannot bootstrap this trust root.

## Rollback

Revert or close the source-only producer slice. The existing independent-review gate remains fail-closed and continues consuming no deterministic receipt until a legitimate producer/witness path is activated.
