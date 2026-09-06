# Truth Decay Audit: When a True Claim Becomes Unsafe to Reuse

## Incident class

A claim can be truthful when observed and still become false, stale, superseded, or unknown before it is used.

The original FCR trigger was exact-head repository proof that remained historically true after the merge created a different `main` identity and provider/runtime state changed. Reusing “the PR head is green” as “main is green” or “production is green” crossed a version/provider boundary without a fresh observation.

This is not best modeled as fabrication. It is **truth decay**: a Time-of-Check / Time-of-Use failure applied to claims, docs, automation, and agent behavior.

## 2026-08 control correction: self-attested rollout evidence

The first rollout-coverage contract made the receipt shape, release identity, and deployment health explicit, but a signed observer could still self-attest aggregate rollout counts. A healthy deployment witness answered “did this SHA deploy?”; it did not answer “did these aggregate counts come from the independent provider readback?” A same-project but unrelated Cloudflare observation could also have been mistaken for the enrolled deployment target.

The corrected rule is deliberately stricter: a passed coverage receipt must be project-bound, target-bound, ordered after a provider-owned deployment completion, and match a digest written by the server-owned aggregate observation. Until the independent normalizer supplies that exact evidence, the safe outcome is no passed coverage claim.

Even a correctly accepted coverage receipt is not permanent truth. Current Truth applies a 60-minute lease to the completed observation window, retains GitHub branch-head events only as last-observed source provenance, and returns coverage as historical unless the display read completes a fresh, repository-bound GitHub `main` revalidation. A delayed or out-of-order webhook cannot resurrect an older SHA as current. The release witness uses the same repository-scoped GitHub App credential path as the provider layer and rejects a partial App configuration instead of accidentally falling back to a token.

The Documentation Truth gate had a parallel weakness: it treated a touched document path as a refresh. It now rejects punctuation-only and hidden-comment edits, and requires a meaningful structured receipt that maps every changed truth-sensitive source path to a path-bound invariant. That receipt establishes review traceability, not a claim that a provider, deployment, public outcome, or source change has been independently proven semantically true.

Goalfix governance exposed another false-green class: canonical execution/adaptive documents and their portable Claude/Perplexity entry points could change while the verifier reported zero truth-sensitive files. Those paths are now registered as `truth-governance`. The gate must therefore require a current README/truth-decay refresh and path-bound receipt whenever the canonical Goalfix workflow, adaptive kernel, portable Goalfix skills, or Claude/Perplexity master execution overlays move. Registration is documentation consistency evidence only; it does not prove `/goalfix/inspect` runtime adoption, independent review, Founder Final, merge authority, provider configuration, deployment, or publication.

## 2026-09 control correction: deployment-plane secrets versus runtime-secret authority

Canonical Deploy #218 exposed a second truth-decay pattern: documentation still described Worker runtime secret values as GitHub production configuration even though those values belong to the Cloudflare Worker secret plane. The exact-head authority check was correct, but an old secret-copy model made the deployment gate fail before any migration or provider mutation. Treating that failure as evidence that the runtime secret was absent in Cloudflare would have crossed an authority boundary without provider readback.

The corrected contract keeps one authority per secret plane. GitHub production validates only the deployment credentials that canonical Deploy itself needs: `SUPABASE_DB_URL`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID`. Worker runtime secret values remain provider-held in Cloudflare and are named by `wrangler.worker.toml [secrets].required`, including `FOUNDER_SESSION_ENCRYPTION_KEY`. Canonical Deploy preserves those values and actively writes only the fail-closed `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` with `enabled:false`.

`https://api.foundercontrolroom.org` is public release configuration, not a secret. The post-Deploy Playwright witness derives its expected identity from the successful Deploy run and must prove both the direct Worker and public Pages/proxy `/version` identities equal that exact SHA before and after the browser journey. A source declaration, required-name membrane, or green PR still does not prove that provider-held secrets are currently installed or that production serves the candidate. Those remain provider/runtime observations at the use boundary.

## 2026-09 control correction: cross-repository Playwright federation proof drift

The FCR → StoryEngine product-build lane exposed a cross-repository version of the same failure. An FCR browser fixture could remain locally valid while the separately versioned StoryEngine control-room contract changed its proof requirements or request wire shape. Reusing predecessor Playwright green after either repository head, peer runtime identity, required-proof set, or serialized directive shape moved would falsely convert historical integration evidence into current authority.

The corrected evidence-authority rule is explicit: `.github/workflows/playwright.yml` must exercise the canonical product-build directive at the request-body root, require both `node-test` and `playwright` proof, bind the exact StoryEngine runtime identity before and after execution, and treat every FCR or StoryEngine head movement as a new proof subject. FCR also validates the peer proof boundary before dispatch, but that source guard does not replace the browser/runtime witness.

A unit test, source declaration, reachable endpoint, or earlier successful Playwright run cannot prove the current peer loop. Current federation proof requires one exact FCR head, one exact StoryEngine runtime head, the expected directive/receipt binding, and applicable real-path browser evidence. The receipt remains non-authorizing for merge, deploy, production promotion, or provider mutation.

This is why the exact-head Playwright workflow is registered as `evidence-authority`: changing what the browser witness sends or accepts can change what future operators believe has been proven even when the underlying actuator remains intentionally bounded.

A September peer-rollover incident made the freshness rule concrete. FCR `af87c67e05584203b04610eb25e6f89ad8c1e7a0` completed a real federation lap against its pinned StoryEngine peer `abd4aab9f33e6c67d7863bd1a03c917901a00668`, but StoryEngine PR #89 had already advanced to separately exact-head-proven `f78492230e88c66b04d4d8c9d6210c6380ba0db1`. The earlier FCR green therefore remains historical for the old peer rather than current integration authority. Refreshing the peer pin is only the start of recovery: the successor FCR head must rerun the entire browser/runtime/receipt witness against the newly bound StoryEngine SHA, and movement on either side expires that successor proof again.

## 2026-09 control correction: privileged production witness isolation

A post-Deploy `workflow_run` witness is privileged even when its purpose is read-only verification. Treating the triggering workflow's `head_sha` as both the release identity to observe and the code to execute collapses evidence identity into executable authority. A successful upstream workflow must not make its checkout trusted merely by becoming a completed run.

The corrected rule keeps those roles separate: `.github/workflows/playwright.yml` restricts the production witness to successful `workflow_dispatch` Deploy runs from `main`, executes only the trusted witness source associated with the privileged workflow context, and carries `workflow_run.head_sha` only as the expected release identity to compare against production. The witness can prove that deployed Worker and browser/runtime identity match the Deploy run SHA, but it cannot execute the Deploy-run checkout or use upstream success as authority to widen what code runs in the privileged phase.

This remains a proof contract, not production proof by itself. The witness must actually run for the relevant release and return terminal exact-SHA evidence before a production-runtime claim becomes current.

## Root causes

### 1. Evidence lifetime was implicit

The proof model correctly separated code, tests, CI, deployment, runtime, and outcomes, but a verified fact could still be carried forward as if verification were permanent.

The missing invariant was:

> A verified claim is valid only for the exact identity, authority, dependency state, and time window that were observed. Consequential use requires re-observation at the use boundary.

A hash can prove approved words or an artifact identity did not change. It cannot prove reality underneath those words is still the same.

### 2. Documentation authority drift

README files, current-state docs, PR descriptions, issues, AI operating prompts, and runbooks can remain searchable and authoritative-looking long after the facts that made them correct have changed.

A warning such as “re-check current main” is not enough if nothing mechanically prevents an older present-tense statement from being retrieved and treated as current.

A fresh August 18 audit demonstrated this directly:

- `README.md` still presented an August 15 “Last refreshed” baseline even though the repository had advanced through major founder-content, Cloudflare, capability, and merge-review work;
- `docs/FOUNDER_MERGE_AUTHORITY.md` still described the older merge conditions and omitted the now load-bearing FCR independent-review membrane;
- the Cloudflare deployment target doc still described public-origin Pages forwarding after merged source changed dynamic requests to depend on the `FCR_API` Service Binding;
- the shared AI operating contracts did not yet make post-merge documentation re-observation load-bearing.

Those older statements were not necessarily lies when first written. They became unsafe because their “current” presentation outlived their evidence.

### 3. Merge order can preserve code while invalidating narrative

On August 18, #492 and #491 landed close together while related review-policy hardening was still moving. Current executable truth must therefore be read from the resulting main tree, not inferred from PR titles or merge order.

The current evaluator still enforces server-owned FCR reviewer trust through `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS`, so this incident is **not classified as a proven reviewer-trust bypass**. It is evidence that PR prose, duplicate helper modules, and final executable wiring can diverge during fast-moving merges.

The correct response is to re-read current code, classify dead/duplicated authority separately from exploitable authority, and repair durable docs from the final executable state.

## Failure chain

```text
Exact fact observed
-> claim verified
-> Current You approves or records use
-> time / version / provider / dependency state moves
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

This failure class matches established work on Time-of-Check / Time-of-Use failures, lifecycle monitoring, stale state, and invalidated dependencies. The engineering conclusion is independent of any single source: pre-use re-observation is required whenever a load-bearing dependency can change.

Primary references retained by this audit include MITRE CWE-367, NIST AI RMF lifecycle monitoring material, NIST deployed-AI monitoring work, and research on stale agent state/dependency repair.

## Truth Lease

The repository contains a bounded **Truth Lease** contract for claims that can decay. It does not imply every existing path consumes that generic contract.

A lease can bind:

- public claim hash rather than raw private evidence;
- claim class;
- verification time;
- hard expiry;
- load-bearing dependencies;
- each dependency's authority class;
- expected dependency digest;
- maximum observation age; and
- tamper-evident lease identity.

At merge, deploy, schedule, publish, provider mutation, or founder-facing completion claim, consuming paths should re-observe the dependencies and classify the claim:

```text
CURRENT
= required dependencies freshly match

HISTORICAL
= the exact earlier fact remains valid as history but is not current authority

STALE
= value may still match, but observation/lease is too old for current use

INVALIDATED / SUPERSEDED
= a dependency, authority, or version no longer matches

UNKNOWN
= required current evidence is missing, conflicting, or unusable
```

Only `CURRENT` may support a present-tense operational claim.

### Implementation reality

Generic Truth Lease capability must not be confused with universal enforcement. Domain-specific protections already exist and may be stronger:

- founder-content direct publication has temporal claim classification and execution-time revalidation;
- deferred provider queues restrict what classes of claim can survive delay;
- exact-head merge/recovery/deploy workflows re-read repository identity at their own use boundaries;
- FutureYou/founder surfaces distinguish stale/unknown observations from current proof.

Use the generic contract only where a consequential current-state claim still lacks an equivalent or stronger at-use gate.

Portfolio governance composes those layers for evidence-dependent consequential actions. Founder authorization remains bound to the exact decision-context snapshot—selected intent, memory fact hashes, proof artifact hashes, and exact version—and the canonical hash of that snapshot must equal the Truth Lease claim hash. The authorization must also bind the exact lease hash. At the declared use boundary FCR re-observes the lease dependencies. Changed, stale, missing, invalid, or unbound truth forces `reconfirm`; a consequential action with no factual memory/proof dependency does not gain unnecessary Truth Lease ceremony.

Production governance now adds a production-specific composer on top of that generic lease rather than creating another evidence store. One production claim may be leased only when the exact repository head is simultaneously bound to matching Cloudflare Worker and Pages runtime identities, the FCR Supabase project/migration/advisor state, Playwright tested and observed runtime identity plus its artifact digest, and the exact-head independent-review receipt. The composer does not perform provider reads or mutations itself; it accepts already-authoritative observations and hashes them into the lease dependencies. At deploy, publish, completion-claim, or another consequential use boundary, every dependency must be freshly re-observed. A changed repository head, changed Cloudflare runtime, changed Supabase state, mismatched browser/runtime SHA, stale observation, missing provider witness, or review receipt for another head makes the production claim unusable until the evidence is rebuilt.

## Documentation truth gate

Documentation is part of the product/control plane when humans or agents use it to make current decisions.

The new Documentation Truth control uses this cycle:

```text
truth-sensitive implementation / authority / provider change
-> refresh README + applicable current-state docs in the same bounded PR
-> exact-head Documentation Truth verification
-> CI / Required Gate depends on that verification
-> merge only with the normal authority membrane satisfied
-> Documentation Truth runs again on merged main
-> provider/runtime change after merge requires fresh observation before old present-tense prose is reused
```

The verifier classifies truth-sensitive changed files by domain and requires the relevant current-state docs rather than forcing documentation edits for every test-only change.

Goalfix governance is explicitly part of that classification. Changes to `.ai/skills/goalfix/SKILL.md`, `.claude/skills/goalfix/SKILL.md`, `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md`, `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`, `docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`, or `docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md` must be treated as truth-sensitive because those files can change how future operators select targets, interpret proof, consume founder authority, or report post-merge state.

It also checks cross-document invariants that are easy to regress during fast-moving work, including:

- README does not freeze a manual “Last refreshed” date as current authority;
- current repository identity is resolved at use time only by separately authorized provider revalidation, while webhook facts remain historical last-observed provenance;
- FCR merge docs describe the independent-review membrane and server-owned reviewer trust;
- live GitHub ruleset enforcement stays a separate provider truth;
- Goalfix carries the verified target branch rather than assuming `main`, authenticates Founder Final through the checked-in authority contract, rereads mutable provider/PR/base/head/diff/check/review state immediately before integration, distinguishes browser Playwright proof from backend/provider evidence, and reports `MERGED_UNVERIFIED` until required runtime proof exists;
- Claude and Perplexity master execution overlays defer Goalfix execution order to the canonical workflow rather than maintaining weaker parallel loops;
- the adaptive kernel remains a governance/source contract until runtime/API/UI integration is separately implemented and proven;
- the founder-content story keeps first-party LinkedIn, provider-neutral n8n, exact Current You authority, provider readback, and Sauce Guard distinct;
- `.control/capability.json` remains the canonical capability authority while YAML remains a compatibility pointer; and
- post-merge truth/documentation re-observation exists in the shared AI workflow.

The verifier emits a sanitized `fcr/documentation-truth@v1` receipt with counts, domains, documentation coverage, and failure reasons. It does not store credentials, private proof, raw diffs, private prompts, customer data, private metrics, or provider payloads.

A docs-only truth-sync merge closes an earlier drift cycle. It still receives a post-merge verification receipt, but the merge commit changing identity does not require a second self-referential docs edit.

A durable README should not hard-code a “current SHA” and pretend that value automatically renews after every merge. Exact SHAs belong in receipts/provenance; current identity is resolved at use time only by separately authorized provider revalidation.

### Evidence-authority registration

The Evidence Trust Plane is now explicitly part of Documentation Truth. Changes under `src/evidence/`, the founder-facing `public/control-room/evidence-trust.html`, or its exact-head Playwright workflow are truth-sensitive because they can change what future operators believe evidence may unlock. The documentation gate must therefore fail if those paths move without current documentation and a path-bound receipt.

For cross-repository product-build proof, `.github/workflows/playwright.yml` is part of that same evidence-authority surface. Its StoryEngine federation fixture must preserve the canonical root directive wire shape, require `node-test` and `playwright`, and prove the exact peer runtime identity before and after the browser-governed execution. A source/test change that touches this witness therefore requires current documentation, but documentation cannot promote an unexecuted successor head into browser truth.

The same workflow also contains a privileged post-Deploy production witness. That witness must not execute `workflow_run.head_sha`; it must execute trusted witness source and carry the successful main-bound Deploy run SHA only as release evidence. Separating witness code from observed release identity is part of the evidence-authority contract, because upstream workflow success cannot itself grant executable trust to an arbitrary checkout.

That registration does not mean durable evidence persistence exists. The current Evidence Trust Plane slice defines receipt, validity, and action-ceiling contracts only; `ledgerState` is supplied state until a separately reviewed persistence writer/store exists. Current receipt use must also re-evaluate expiration and bind merge-review preparation to GitHub API evidence for an exact repository, full SHA, workflow, and run identity. Rejected or non-GitHub evidence cannot be relabeled as merge-review-ready merely because readback completed.

### Release-coverage at-use gate

A signed rollout-coverage receipt is still sender-supplied observation. For a `passed` coverage claim, Founder Control Room must re-read current repository `main` and independently read a fresh production deployment witness from the Cloudflare provider-observation lane. The witness must be tied to a processed provider event and must not reuse `project_events`, where the receipt itself is stored.

If main, deployment SHA, freshness, health, or independent provenance cannot be verified, the receipt is retained only as non-passing history or blocked from persistence; it cannot render a current green coverage fact. Current Truth hides SHA-mismatched coverage and withholds coverage unless the display read completes a fresh GitHub `main` revalidation; a received webhook main fact is last-observed history, not a substitute.

Legacy external receipt shapes are also not grandfathered into durable operational truth. Current Truth renders runtime only from a server-owned event and renders provider or verification facts only from GitHub or system observation bound to the enrolled repository. Tightening a producer's capability therefore closes both future ingestion and historical projection paths.

## Product Design

Founder-facing truth must not collapse into one green badge.

Preferred visible states are:

- `Current proof` -> claim may be used;
- `Historical verified` -> fact was verified for an exact earlier version/time;
- `Re-check required` -> proof aged out;
- `Truth changed / Superseded` -> rebuild the claim from new reality;
- `Proof missing / Unknown` -> collect evidence before claiming.

The next gate must be visible. A stale claim is not labeled failed merely because it aged, and an unknown claim is never rendered green.

For founder content, keep **learning signal**, **claim truth**, **founder approval**, **provider execution**, and **publication outcome** visibly separate.

## Data Analytics

Measure truth quality without storing sauce.

Sanitized observations may include:

- claim class/state;
- use boundary;
- current/historical/stale/invalidated/unknown state;
- dependency count;
- stale/invalidated/unknown dependency counts;
- documentation coverage percent;
- truth-sensitive domain count;
- stale-doc block rate;
- revalidation success rate;
- provider/readback success; and
- time from observation to invalidation/correction.

Do not emit:

- raw post text;
- private proof references;
- evidence digests that expose private internals;
- provider payloads;
- credentials;
- raw diffs;
- private metrics;
- customer/private data; or
- chain-of-thought.

**Analytics remains observation-only.** It cannot renew a Truth Lease, approve a merge, rewrite provider reality, authorize publication, or turn documentation consistency into objective truth.

### Analytics-authority Redteam

Historical wording does not fix an authority mismatch.

A repository commit can prove repository state. It cannot prove a follower count, impression count, user count, sales count, conversion rate, or other platform/business metric.

Therefore:

- numeric analytics claims may not be laundered through `historical_version`;
- metric claims require the appropriate analytics authority and freshness;
- private analytics snapshots may guide story selection without entering public payloads; and
- FutureYou may recommend a story based on old analytics but may not restate an old number as current truth or use it to authorize publication.

## Founder-content / Sauce Guard boundary

The public post should tell the progress story, not expose the recipe.

The target founder experience is:

```text
my product observes verified progress about my products
-> my product prepares the story
-> my product protects the sauce
-> Current You controls executable publication
-> provider readback proves what actually happened
```

Public-safe copy may explain what changed, what problem was solved, what was learned, why it matters, approved public proof, and an honest next gate.

Keep Truth Lease internals, raw evidence, proprietary implementation, private prompts, raw diffs, credentials, unreleased roadmap detail, private metrics, customer data, security-sensitive details, and provider payloads private.

Analytics may change **which** public-safe story Chief proposes next. It may not bypass Sauce Guard, claim classification, Current You authority, temporal revalidation, or provider readback.

## OODA / L99 operating loop

```text
OBSERVE
fresh repository / provider / runtime / documentation facts
+ safe analytics outcomes

ORIENT
separate Current You intent from objective evidence
separate historical provenance from current authority
separate content-learning signal from claim truth

DECIDE
use or renew the applicable Truth Lease / domain-specific gate
choose the smallest public-safe or operational action

ACT
use current claims only while proof is current
preserve historical truth explicitly

LOOP
re-observe after merge, deploy, provider write, documentation transition, analytics snapshot, or dependency change
```

The strongest optimization is not faster claiming. It is shortening the distance between observation and use while making invalidation visible and fail-closed.

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
12. Provider success after publication does not retroactively validate a false pre-publication claim.
13. Historical wording does not let a metric inherit repository authority.
14. FutureYou may advise from history but may not silently promote historical facts to current truth.
15. Content optimization may alter story selection, never the evidence required for the claim.
16. An old README, PR body, issue, runbook, or AI instruction can preserve history but cannot outrank fresh current-main/provider evidence.
17. A warning to “re-check” is not equivalent to a machine-enforced truth gate.
18. A hard-coded current SHA or refresh date in durable prose becomes stale by construction after the next transition.
19. A PR title/body describing a security property does not prove the final merged tree still implements that property; audit the executable result.
20. Source/runtime FCR review enforcement does not prove the live GitHub ruleset independently enforces it.
21. Documentation synchronization must not create an infinite self-update loop; post-merge verification closes the transition.
22. Preserve history. Supersede stale authority explicitly instead of deleting evidence simply because the current answer changed.
23. An unchanged approved decision-context object is not proof that its external dependencies are still current; evidence-dependent consequential use must revalidate the bound Truth Lease at the use boundary.
24. Independent green receipts do not compose into production truth unless they bind the same exact candidate and remain current together at the declared use boundary.
25. A stored `validity: current` flag does not outrank an elapsed `expiresAt`; evidence authority must re-evaluate expiration when the receipt is used.
26. Readback completion is not the same as a verified verdict, and an unscoped or wrong-authority receipt cannot prepare merge review.
27. A governance document that changes future agent execution order is truth-sensitive even when no runtime source changes; failing to register it with Documentation Truth is a false green, not a harmless docs-only omission.
28. A missing GitHub copy of a provider-held Worker runtime secret does not prove the Cloudflare runtime secret is absent; read the provider-held binding plane before making that claim.
29. A public deployment origin must not be mislabeled as a secret merely because a workflow consumes it; authority classification must follow the sensitivity and mutation boundary of the value.
30. A predecessor Playwright success cannot prove a cross-repository federation successor after either repository head, peer proof contract, peer runtime identity, or serialized wire shape moves.
31. A privileged `workflow_run` witness may consume an upstream release SHA as evidence, but it cannot execute that upstream checkout or treat upstream success as executable trust.

## Rollback

The Truth Lease, production-specific lease composer, temporal founder-content guards, analytics-authority guard, and Documentation Truth control are additive/fail-closed. Revert the focused contract/test/workflow/documentation change if it causes incompatibility. No database, provider credential, DNS, publication, provider ruleset, or production mutation is performed by the documentation-truth slice.