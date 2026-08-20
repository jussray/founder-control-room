# Release Identity and Rollout Coverage

## Status

**IMPLEMENTED AS A CONTROL-PLANE CONTRACT; NOT YET A PRODUCTION-COVERAGE CLAIM.**

This document describes the checked-in Founder Control Room contract. It does not prove a provider is configured, a release was deployed, a request path was observed, or a coverage threshold has passed. Each of those facts requires its own exact-head and provider/runtime evidence.

## Why the split exists

Release identity and rollout coverage answer different questions.

| Question | Evidence shape | Meaning |
| --- | --- | --- |
| What build answered a request? | Exact release SHA plus deployment/runtime witness | Binary identity proof |
| How much real traffic saw that build? | Aggregate, time-windowed provider observation | Statistical rollout coverage |

A clean `/version` response is not traffic coverage. A traffic distribution is not deployment authority. Neither can approve a merge, deploy, change a provider, or authorize a founder decision.

## Initial enrolled boundary

The only enrolled coverage producer is `sekret-bip-release-observer` for the existing `jussray/Sekret-Bip` production release boundary.

It is permitted to submit signed `analytics` events only when all of the following are true:

- the receipt is bound to the exact `main` commit SHA for `jussray/Sekret-Bip`;
- the observed release SHA equals that repository SHA;
- the producer source is Cloudflare;
- the event carries aggregate route-class counts, never raw paths, query strings, request IDs, client identifiers, headers, bodies, tokens, or user data; and
- the event is observation-only and cannot be interpreted as runtime identity, merge approval, or deployment authority.

The production source still needs a separately authorized provider configuration and a real aggregate-readback implementation before it can emit an accepted receipt. This change creates neither a secret nor a provider binding.

## Predeclared initial policy

The policy is committed before an observation, so a desired release cannot negotiate its own success criteria afterward.

| Dimension | Initial policy |
| --- | --- |
| Window | 15 to 30 minutes |
| Receipt freshness | Window must end no more than 60 minutes before its signed receipt |
| Real sampled requests | At least 25 |
| Previous-release share | At most 500 basis points (5%) |
| Unclassified responses | Zero for a passed coverage receipt |
| Tail explanation | Required whenever a prior-release response remains |
| Allowed tail classes | Cached edge response, long-lived connection, provider rollout |
| Allowed route classes | `front-door` only; a fixed safe label, not a path |
| Synthetic probes | May never produce verified or passed coverage |

This is not a claim that 15 minutes, 25 requests, or 5% is universally correct. It is a deliberately visible starting policy. A passed receipt must also use a complete 15–30 minute window and arrive no more than 60 minutes after that window ends; the receiver rejects stale, future-ending, and overlong windows. Changing it requires a reviewed source change before the next observation.

## Portfolio applicability

This is a source-scope classification, not a deployment inventory or provider-health assertion.

| Class | Repositories | Control decision |
| --- | --- | --- |
| Enrolled coverage contract | `jussray/Sekret-Bip` | Existing exact release identity and Cloudflare observability make it the first bounded producer. |
| Identity-only until a provider-backed coverage receiver is reviewed | `jussray/founder-control-room`, `jussray/jussbeautifulhair-site`, `jussray/chief-ai-machine`, `jussray/untold-stories-storefront` | Keep exact version witnesses separate; do not invent a traffic claim. |
| Not a public HTTP coverage target without a new explicit boundary | `jussray/jbh-private`, `jussray/StoryEngine`, `jussray/promptos`, `jussray/solcontinuity`, `jussray/SleepWealth-Agent`, `jussray/Sweats`, `Juss-Co/Bip` | Preserve private, runtime-unknown, CLI, development, or non-service boundaries. |
| Historical, demo, or retired | `jussray/Se-kretBip`, `jussray/sekret-bip-demo`, `jussray/jussbeautifulhair1`, `jussray/do-not-use`, `jussray/Juss-beautiful-hair-` | Do not add production instrumentation. |

No blanket response header is added across the portfolio. That would leak internal identity where a version endpoint or provider-side structured log is safer, and it would falsely classify non-HTTP or private systems as public deployments.

## Receipt semantics

A coverage receipt carries:

- exact release SHA;
- bounded time window;
- provider-log or analytics-engine source;
- total, current-release, prior-release, and unclassified aggregate counts;
- allowlisted safe route classes; and
- a named tail reason when prior-release traffic remains.

A sequence of bounded receipts over adjacent windows is the rollout curve. The current-truth projection intentionally exposes only the newest coverage fact; the receipt history remains the evidence for the distribution's shape.

The schema fails closed on raw-looking route strings, invalid counts, mismatched subtotals, synthetic-as-verified coverage, unknown tails on a passed receipt, unclassified traffic on a passed receipt, SHA drift, stale or future-ending coverage windows, stale receipt time, and producer/repository impersonation.

The projection exposes `runtimes` and `coverage` as separate facts. A runtime witness remains binary. Coverage may pass its initial observation policy while remaining a time-bound distribution that must be re-observed after the next deploy.

## Operating loop

1. Before deployment, review or change the checked-in coverage policy.
2. Deploy only through its separately authorized release path.
3. Prove identity through the exact release witness and provider/runtime evidence.
4. Collect provider-backed aggregate observations over the declared window and route classes.
5. Submit a signed receipt bound to the exact repository and release SHA.
6. Explain any named tail; hold the coverage state as `UNKNOWN` if it is incomplete.
7. Re-observe after a new deployment, routing change, cache change, or provider transition.

## Rollback

This contract is additive and fail-closed. Revert the focused commit to stop accepting coverage receipts. No database migration, provider mutation, secret write, DNS change, customer-data read, release, or deployment occurs in this change.