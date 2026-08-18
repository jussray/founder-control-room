# Truth Decay Audit: When a True Claim Becomes Unsafe to Reuse

## Incident class

A claim can be truthful when observed and still become false, stale, or unknown before it is used.

The concrete FCR trigger was the merge of founder-content reservation hardening. The pull-request head had exact-head repository evidence, but the merge created a new `main` identity and the native Cloudflare Worker build on that merged SHA failed. The earlier statement "the PR head is green" remained historically true. Reusing that evidence as "main is green" or "production is green" would have crossed a version and provider-state boundary without a fresh observation.

This is not best modeled as fabrication. It is **truth decay**: a Time-of-Check / Time-of-Use failure applied to claims and agent behavior.

## Root cause

The old proof model correctly separated code, tests, CI, deployment, runtime, and outcomes, but it still allowed a verified fact to be carried forward as if verification were permanent.

The missing invariant was:

> A verified claim is valid only for the exact identity, authority, dependency state, and time window that were observed. Consequential use requires re-observation at the use boundary.

A hash can prove that approved words did not change. It cannot prove that reality underneath those words did not change.

## Failure chain

```text
Exact fact observed
→ claim verified
→ Current You approves use
→ time/version/provider state moves
→ old claim remains byte-identical
→ old proof is reused
→ statement is no longer current truth
```

Current You and objective truth are different authority planes:

- **Current You** may change goals, preferences, wording, and approval.
- **Provider/repository/runtime evidence** determines objective operational facts.
- **FutureYou/history** may advise but may not silently authorize or preserve stale facts.
- A fresh founder approval cannot turn stale provider evidence back into current truth.

## Research basis

This failure class matches established and current work:

- MITRE CWE-367 describes Time-of-Check / Time-of-Use failures where a checked property changes before the protected use.
- NIST AI RMF guidance treats validity and reliability as lifecycle properties that require ongoing monitoring, including after deployment.
- NIST's 2026 deployed-AI monitoring report emphasizes that pre-deployment evaluation cannot substitute for post-deployment observation under dynamic conditions.
- The 2026 STALE benchmark reports that agents can retrieve updated evidence yet continue behavior based on invalidated prior state.
- 2026 work on stale dependency repair finds that checking only the final draft can miss an old dependency that is no longer explicitly stated.

Primary references:

- https://cwe.mitre.org/data/definitions/367.html
- https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/
- https://www.nist.gov/publications/challenges-monitoring-deployed-ai-systems-center-ai-standards-and-innovation
- https://arxiv.org/abs/2605.06527
- https://arxiv.org/abs/2608.01619

## Introduced rule: Truth Lease

This slice introduces a bounded **Truth Lease** contract for claims that can decay. It does not claim every existing FCR path consumes the contract yet.

A lease binds:

- public claim hash, not raw private evidence;
- claim class;
- verification time;
- hard expiry;
- every load-bearing dependency;
- each dependency's authority class;
- expected dependency digest;
- maximum observation age;
- tamper-evident lease hash.

At merge, deploy, schedule, publish, or founder-facing completion claim, consuming paths must re-observe the dependencies and classify the claim:

```text
CURRENT
= every dependency freshly matches

STALE
= value may still match, but observation or lease is too old

INVALIDATED
= a dependency or authority no longer matches

UNKNOWN
= required current evidence is missing or unusable
```

Only `CURRENT` may be used as a present-tense operational claim.

## Product Design

Founder-facing truth must not collapse into a green badge.

The minimum visible state model is:

- `Current proof` → claim may be used;
- `Re-check required` → proof aged out;
- `Truth changed` → rebuild the claim from new reality;
- `Proof missing` → collect evidence before claiming.

The next gate must be visible. A stale claim is not labeled failed when it was once true, and an unknown claim is never rendered green.

This prevents a confusing product experience where yesterday's successful state looks identical to a freshly verified state.

For founder content, the same product rule now applies to performance feedback: analytics can shape the next proposed story, but the UI must keep **learning signal**, **claim truth**, **founder approval**, and **publication outcome** visibly separate.

The Content Manager learning loop therefore uses three private strategy dimensions:

- **Distribution** — whether strong stories are reaching enough people;
- **Resonance** — whether founder thesis, correction, proof, or human-product stakes produce meaningful response;
- **Compounding** — whether recurring readership and follower growth improve across snapshots.

Those signals may rank future story shapes. They do not become public claims automatically.

## Data Analytics

Measure truth quality without storing sauce.

Sanitized observations may include:

- claim class;
- use boundary;
- current/stale/invalidated/unknown state;
- dependency count;
- stale dependency count;
- invalidated dependency count;
- unknown dependency count;
- whether use was allowed.

Do not emit:

- raw post text;
- private proof references;
- evidence digests;
- provider payloads;
- credentials;
- raw diffs;
- private metrics;
- chain-of-thought.

Useful portfolio metrics include stale-claim block rate, invalidation rate, revalidation success rate, and time from verification to invalidation. Analytics remains observation-only and cannot renew a lease or authorize a claim.

### Analytics-authority redteam

A fresh founder-content audit exposed a second truth-decay failure mode: **historical wording does not fix an authority mismatch**.

The unsafe pattern was:

```text
analytics fact observed
→ number is later written in past tense
→ claim is labeled historical_version
→ repository SHA is offered as proof
→ FCR accepts the wrong authority for the fact
```

A repository commit can prove repository state. It cannot prove a follower count, impression count, user count, sales count, conversion rate, or other platform/business metric.

The corrected invariant is:

> A metric remains a metric even when it is historically true. Historical tense changes time semantics; it does not change evidence authority.

Therefore:

- numeric analytics claims may not be laundered through `historical_version`;
- `metric` claims remain blocked until a dedicated fresh analytics verifier exists;
- private analytics snapshots may guide story selection without entering the public payload;
- raw workbook totals are not baked into Content Manager UI or source-controlled public copy;
- FutureYou may recommend a story based on an old snapshot, but it may not restate the old number as current truth or use it to authorize publication.

This keeps the learning loop useful without turning analytics into a covert truth authority.

## Founder-content / sauce boundary

The public post should tell the progress story, not expose the recipe.

Truth revalidation is designed to happen inside FCR. Provider payloads need only the already approved public copy plus bounded destination authority. Truth-lease internals, raw evidence, implementation details, prompts, diffs, credentials, unreleased roadmap, private metrics, and customer data remain private.

A post may say what was built, what changed for the product, what was learned, and what evidence class supports it. It does not need to reveal how the implementation works.

Analytics may change **which** public-safe story Chief proposes next. It may not bypass the sauce guard, claim classifier, Current You approval, temporal revalidation, or provider readback gates.

## OODA / L99 operating loop

```text
OBSERVE
fresh repository/provider/runtime facts
+ private analytics outcome snapshots

ORIENT
separate Current You intent from objective evidence
separate content-learning signals from claim authority

DECIDE
build or renew a bounded truth lease for the exact claim
choose a public-safe story shape without leaking private metrics

ACT
use the claim only while the required truth boundary is satisfied
publish only after exact Current You approval and provider proof

LOOP
re-observe after merge, deploy, provider write, analytics snapshot, or any dependency transition
```

The strongest optimization is not faster claiming. It is shortening the distance between observation and use, while making invalidation automatic and visible.

## Redteam invariants

1. A green PR head does not prove the merged SHA is green.
2. A successful merge does not prove deployment.
3. A successful deployment does not prove runtime health.
4. Runtime health observed earlier does not prove runtime health now.
5. Current You approval does not override provider/runtime contradiction.
6. Byte-identical copy does not imply byte-identical reality.
7. Missing at-use evidence is `UNKNOWN`, never success.
8. Duplicate/conflicting observations are ambiguous, never last-row-wins truth.
9. Malformed observation time is `UNKNOWN`, never assumed fresh.
10. A stale lease cannot become standing authority.
11. Analytics cannot renew truth.
12. Provider success after publication does not retroactively validate a false pre-publication product claim.
13. Historical wording does not let a metric inherit repository authority.
14. FutureYou may advise from analytics history but may not silently promote historical metrics to current facts.
15. Content optimization may alter story selection, never the evidence required for the claim.

## Rollback

The truth-lease contract and analytics-authority guard are fail-closed. Revert the focused semantic-guard, Content Manager learning-loop, test, and audit commits if they cause incompatibility. No database, provider credential, DNS, LinkedIn publication, or deployment state is mutated by this audit slice.
