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

A second root cause is **documentation authority drift**. README files, current-state docs, PR bodies, issues, and AI operating prompts can remain searchable long after the facts that made them correct have changed. A warning that says “re-check current main” is not enough if nothing mechanically prevents a future agent from retrieving an older authoritative-looking statement and treating it as current.

## Failure chain

```text
Exact fact observed
-> claim verified
-> Current You approves use
-> time/version/provider state moves
-> old claim remains byte-identical
-> old proof or document is reused
-> statement is no longer current truth
```

Current You and objective truth are different authority planes:

- **Current You** may change goals, preferences, wording, and approval.
- **Provider/repository/runtime evidence** determines objective operational facts.
- **FutureYou/history** may advise but may not silently authorize or preserve stale facts.
- **Documentation** may preserve provenance but may not convert historical truth back into current truth.
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

The repository contains a bounded **Truth Lease** contract for claims that can decay.

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

### Implementation reality

The generic `src/lib/truthLease.ts` contract is implemented and tested, but repository search at this audit found no production caller of `evaluateTruthLeaseAtUse()`. That means the generic lease is **contract-capable, not globally enforced**.

Do not claim every merge/deploy/completion path is Truth-Lease-protected merely because the library exists.

There are already stronger domain-specific protections that must be preserved rather than replaced:

- founder-content direct publication uses proposal-bound temporal claim revalidation;
- FutureYou classifies operational observation freshness and clock anomalies;
- exact-head merge/recovery/deploy workflows re-read repository identity at their own boundaries.

The next implementation work should wire the generic Truth Lease only where a consequential current-state claim still lacks an equivalent or stronger at-use revalidation gate.

## Documentation truth gate

This audit now introduces a mechanical **Documentation truth gate** for the failure class that affected README/current-state docs and old PR-era instructions.

The gate treats documentation as part of the control plane when humans or agents use it to make current decisions.

For truth-sensitive changes to publishing, authority, provider topology, capability, workflows, deployment semantics, or truth governance:

```text
truth-sensitive change
-> refresh README + applicable current-state docs in the same bounded PR
-> exact-head Documentation Truth verification
-> merge only with normal repository proof
-> Documentation Truth runs again on merged main
-> provider/runtime change after merge requires re-observation before the old present-tense claim is reused
```

The verifier emits a sanitized `fcr/documentation-truth@v1` receipt with coverage/counts and failure reasons. It does not store credentials, private proof, prompts, raw diffs, customer data, or provider payloads.

A docs-only truth-sync merge closes an earlier drift cycle. It still receives the post-merge verification receipt, but it does not have to rewrite itself again merely because the merge commit SHA changed.

README therefore should not pretend that a hard-coded SHA is permanently “current.” Exact SHAs belong in bounded evidence/provenance; current repository identity is resolved at use time.

## Product Design

Founder-facing truth must not collapse into a green badge.

The minimum visible state model is:

- `Current proof` -> claim may be used;
- `Re-check required` -> proof aged out;
- `Truth changed` -> rebuild the claim from new reality;
- `Proof missing` -> collect evidence before claiming.

The next gate must be visible. A stale claim is not labeled failed when it was once true, and an unknown claim is never rendered green.

Documentation should use the same mental model. Historical evidence remains valuable, but its visual/semantic state must not look identical to current authority.

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
- documentation coverage percent;
- truth-sensitive domain count;
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

Useful portfolio metrics include stale-claim block rate, invalidation rate, revalidation success rate, documentation-drift rate, and time from verification to invalidation. Analytics remains observation-only and cannot renew a lease, rewrite provider reality, or authorize a claim.

## Founder-content / sauce boundary

The public post should tell the progress story, not expose the recipe.

Truth revalidation is designed to happen inside FCR. Provider payloads need only the already approved public copy plus bounded destination authority. Truth-lease internals, raw evidence, implementation details, prompts, diffs, credentials, unreleased roadmap, private metrics, and customer data remain private.

A post may say what was built, what changed for the product, what was learned, why it matters, and what public evidence class supports it. It does not need to reveal how the implementation works.

The target founder experience is deliberate:

```text
my product observes verified progress about my products
-> my product prepares the story
-> my product protects the sauce
-> Current You controls the executable publication
-> provider readback proves what actually happened
```

## OODA / L99 operating loop

```text
OBSERVE
fresh repository/provider/runtime/documentation facts

ORIENT
separate Current You intent from objective evidence and historical provenance

DECIDE
build or renew a bounded truth lease or domain-specific equivalent

ACT
use the claim only while the required proof is current

LOOP
re-observe after merge, deploy, provider write, documentation transition, or any dependency transition
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
13. An old README, PR body, issue, or AI instruction can preserve history but cannot outrank fresh current-main/provider evidence.
14. A warning to “re-check” is not equivalent to a machine-enforced truth gate.
15. A hard-coded current SHA in durable prose becomes stale by construction after the next merge; use exact SHAs for provenance and resolve current identity at use time.
16. Documentation synchronization must not create an infinite self-update loop; post-merge verification closes the transition.

## Rollback

The truth-lease and documentation-truth contracts are additive and fail-closed. Revert the focused contract/test/workflow/documentation changes if they cause incompatibility. No database, provider, credential, DNS, publication, or deployment state is mutated by this audit slice.
