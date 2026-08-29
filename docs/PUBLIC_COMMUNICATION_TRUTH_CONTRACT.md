# Public Communication Truth Contract

This contract applies before publishing, scheduling, sending, announcing, promoting, pitching, or otherwise presenting ecosystem work to the public, partners, customers, investors, collaborators, or internal stakeholders who may reasonably treat the communication as an execution claim.

## Required posting loop

```text
/futureyou
→ /truthmode
→ /confess
→ Audience and harm check
→ Evidence check
→ Accounting-control check
→ Authorization check
→ Temporal reuse check
→ Draft
→ Review or approved automation
→ Issue exact-copy approval when the active route requires it
→ Atomically claim that stored approval at execution
→ Publish or hold
→ Capture the published artifact
→ Record outcome evidence
→ Reconcile and correct
```

## /futureyou

Before posting, ask:

> Will the future version of the founder, team, customer, or community be able to understand what was actually true when this was published?

A durable post should preserve context rather than manufacture a cleaner history. It must not create promises, expectations, or interpretations that future builders cannot support.

## /truthmode

Every material claim must be classified against its actual proof layer:

```text
Planned
Built
Tested
CI-verified
Deployed
Runtime-observed
Used by people
Produced an outcome
```

One layer does not prove another. Do not describe committed code as deployed, a triggered workflow as successful, a draft as published, a scheduled post as delivered, a model response as an external action, or attention as customer impact.

A publication claim requires an observable platform artifact. A draft, scheduler acceptance, workflow trigger, or model response is not that artifact.

Founder-content orchestration readiness is a separate preflight truth layer. An authenticated status surface may report whether n8n founder-content orchestration is enabled, whether required webhook/token configuration is present, which bounded providers are allowlisted, and whether Buffer is ready for one controlled probe. It must expose presence/state only, never secret values. Configuration alone does not prove a webhook executed, Buffer accepted a schedule, a post published, or provider readback succeeded. For the canonical conveyor, `enabled-live-verified` is allowed only when a retained activation-probe receipt matches the deployed exact `GIT_SHA`; if the runtime SHA moves, the receipt remains historical evidence but its live authority expires and readiness returns to a non-live proof-needed state. Missing runtime identity or receipt readback also fails closed.

Founder-content orchestration must not reuse the generic conveyor activation receipt as Buffer proof. A founder-content `enabled-live-verified` state requires enabled/configured transport, a valid provider allowlist, Buffer enabled, and proof explicitly bound to `buffer` with a non-empty receipt ID, a valid observation timestamp, and `expectedHeadSha` exactly equal to deployed `GIT_SHA`. Missing, stale, unbound, incomplete, or provider-unverified proof remains non-live. This source contract does not claim the live route currently has a Buffer proof reader.

A scheduled n8n acknowledgement is still pending provider truth even when it names a provider item. The provider-readback witness may upgrade that state only from a sanitized `provider-native-api` observation that exactly matches the orchestration ID, provider item/request identity, source repository and commit SHA, platform, channel, and requested schedule. Any mismatch, unsupported/raw payload field, missing native provider state, or `published:true` assertion must fail closed; a verified schedule remains scheduled rather than becoming publication truth.

## /confess

Before release, state internally and, when material to the audience, publicly:

```text
Known
Inferred
Assumed
Unknown
Blocked
Still needing verification
```

Corrections must be direct. Do not bury a mistake beneath promotional language or silently edit history when a public correction is warranted.

## Temporal reuse and truth decay

A claim that was true when verified is not automatically safe to reuse later. Preserve the original observation as history, but re-check any fact whose truth depends on current repository, provider, runtime, metric, or human-outcome state.

Founder-content claims use these temporal classes:

- `historical_version`: an explicitly historical statement bound to the exact source version. It remains eligible for deferred scheduling because a later main SHA does not rewrite what was built, merged, tested, or verified at that recorded version.
- `current_repo_state`: a present-tense repository claim. It requires execution-time FCR revalidation against the then-current authoritative repository version.
- `current_runtime`: a present-tense provider/runtime claim. It requires a fresh live verifier at use time.
- `metric`: a current numerical/analytics claim. It requires a fresh authoritative metric read at use time.

A deferred provider queue cannot freeze current truth. Scheduled n8n/provider routes therefore accept only exact-version `historical_version` claims with explicit historical wording. Current repository, runtime, and metric claims must use a path that revalidates truth at the execution boundary. Scheduler acceptance is not a truth lease.

When a newer trustworthy observation contradicts an earlier current-state claim, preserve the earlier observation as historical evidence and classify its current use as superseded, stale, invalidated, or unknown. Never rewrite the historical fact merely because its current-use authority expired.

## Accounting-control principles for automated posting

The founder authorizes automated publication only when the post and its workflow satisfy all of these controls:

- **Completeness:** all material facts, limitations, dependencies, and known exceptions needed to avoid a misleading impression are included.
- **Accuracy:** every factual, financial, operational, usage, partnership, deployment, and outcome claim matches recorded evidence.
- **Consistency:** terms, statuses, metrics, time periods, and classifications are applied the same way across posts and records unless a documented reason explains a change.
- **Cut-off:** events are attributed to the correct date and period; planned, pending, completed, and later-occurring events are not blended together.
- **Evidence and traceability:** each material claim can be traced to a source artifact, record, run, message, URL, ledger entry, or other durable evidence.
- **Authorization:** the post belongs to an approved automated publishing class and does not exceed that class's audience, channel, topic, frequency, or risk boundary.
- **Separation of record and promotion:** promotional language may summarize verified records but may not alter, replace, or overstate them.
- **Conservatism:** when evidence is incomplete or ambiguous, use the less expansive claim or hold the post.
- **Reconciliation:** after publishing, compare the intended post, platform artifact, publication time, links, and status; record mismatches.
- **Correction and audit trail:** preserve what was published, why, by which workflow, under which authorization, and how any error was corrected.

This is an internal control framework inspired by sound accounting practice. It is not a representation that a post, workflow, or repository has received an external audit or formal GAAP opinion.

## Founder authorization

An approved automated publishing class defines the maximum class of communication that automation may handle. It does **not** weaken a more specific executable authority contract.

Current first-party founder-content execution uses exact Current You authority and an FCR-owned approval store. Caller-supplied approval JSON is not publication authority. For the authoritative first-party route, an authenticated founder first confirms the exact copy; FCR then issues and persists a one-shot approval bound to the exact proposal hash, public-payload hash, authorization hash, channel, source repository/SHA, founder identity, approval time, and expiry. Execution must atomically claim the matching unrevoked, unconsumed, unexpired stored approval before temporal revalidation and provider mutation.

The active route therefore separates approval issuance from publication:

```text
exact public-safe proposal
→ authenticated founder + confirm_exact_copy
→ FCR issues and stores exact one-shot approval
→ publish request references the exact authorization_hash
→ FCR atomically claims the matching stored approval
→ temporal claim revalidation
→ provider mutation
→ provider readback
→ durable publication receipt
```

Changing approved copy, evidence identity, proposal identity, source version, channel, or governing authorization fingerprint requires a fresh matching approval. A consumed approval is not replay authority after a downstream failure. Approval existence, approval issuance, or successful approval claim is not publication truth; provider readback remains terminal evidence of the external artifact.

Provider-neutral contract placement does not change publication authority or prove a provider migration. Canonical founder-content contracts live under `tools/founder-content-contracts/`; legacy `tools/zapier/` compatibility exports may remain for provider-specific callers, but core approval storage, direct publication, and temporal revalidation must import the canonical provider-neutral authority directly rather than making Zapier structurally load-bearing. n8n, Zapier, Buffer, or any later adapter remains a provider boundary: it may not create founder authority, it may not turn configuration or scheduler acceptance into publication truth, and it still requires the same exact approval, temporal revalidation, provider mutation, readback, and durable receipt.

A source-level move away from Zapier ownership is not an n8n cutover. A generic FCR stage-conveyor activation receipt is also not a founder-content cutover receipt. Until the checked founder-content n8n workflow is activated through its protected live path and returns canonical persisted evidence plus applicable downstream provider readback for the exact current-main target, Zapier remains an available provider-specific compatibility/fallback path and public language must not say that n8n has replaced it.

A standing class authorization must never be interpreted as permission to bypass that exact-proposal approval membrane when the active route requires it.

This class boundary does not authorize:

- invented, estimated, or unsupported financial results;
- claims of revenue, profit, valuation, funding, customers, users, partnerships, endorsements, deployment, or impact without evidence;
- disclosure of private, sensitive, contractual, security-relevant, or legally restricted information;
- changes to prices, financial commitments, contracts, payments, fundraising terms, legal positions, or binding promises;
- crisis communications, admissions of liability, political statements, or other high-consequence communications not explicitly approved as a separate class;
- bypassing a hold condition because a scheduler or model is technically able to publish.

Fresh approval is required whenever the active executable route requires exact Current You approval, whenever the proposal or approved copy changes, whenever the stored approval no longer exactly matches execution identity, or whenever the post falls outside the approved class or crosses a high-consequence boundary.

## Posting requirements

Every material post must have:

- a clear purpose and intended audience;
- evidence supporting each execution or outcome claim;
- honest status language;
- a temporal classification that matches the wording and evidence lifetime;
- disclosure of material uncertainty or limitation;
- no invented metrics, testimonials, partnerships, users, revenue, deployment, or approval;
- no implication of founder approval when only an agent drafted the content;
- a reviewable draft or an approved automated publishing class plus every stricter route-specific authority requirement;
- an exact stored approval claim when the active first-party route requires one;
- a captured URL, observable platform artifact, message ID, or equivalent evidence after publication;
- a correction path when the post becomes inaccurate.

## Status language

Prefer precise language:

- "planned" when it is an intention;
- "in development" when work exists but is incomplete;
- "committed" when code or documentation is stored;
- "tested locally" only with local test evidence;
- "CI verified" only with an observable successful run;
- "deployed" only with deployment evidence;
- "live" only with runtime evidence at the public destination;
- "used" or "helped" only with evidence of human use or outcome.

For deferred founder-progress posts, prefer durable historical wording such as "I shipped," "I merged," "I tested," or "I found and fixed" when exact-version evidence supports it. Present-tense operational language belongs on an execution-time revalidated path.

## Sauce boundary

Public communication should explain the product change, user value, lesson, or verified progress without publishing the private recipe. Keep proprietary prompts, routing mechanics, raw diffs, credentials, private provider payloads, private metrics, unreleased roadmap details, customer data, internal evidence references, and security-sensitive implementation details out of the public payload.

The public story and the private proof are separate objects. Internal evidence may prove the story without being attached to the post.

## Hold conditions

Hold the post when:

- a key claim cannot be traced to evidence;
- the accounting-control check does not pass;
- temporal classification is missing, mismatched to the wording, or no longer valid at the use boundary;
- a current-state claim is being sent through a deferred queue that cannot revalidate it at publication time;
- configuration/readiness evidence is being used as proof that n8n, Buffer, or another provider actually executed or published;
- a generic n8n stage-conveyor receipt is being used as proof that a founder-content provider write or publication occurred;
- a founder-content `verified` proof label is missing Buffer provider binding, receipt identity, observation time, or exact deployed-SHA binding;
- the post falls outside the approved automated publishing class or a stricter exact Current You gate is unsatisfied;
- the active first-party route cannot read and atomically claim an exact matching FCR-owned approval;
- the post depends on a workflow that failed before executing steps;
- private, sensitive, proprietary, or security-relevant information could be exposed;
- urgency is being used to bypass truth or review;
- the post would make a reasonable reader believe more was completed than the evidence proves.

## Completion standard

A posting workflow is not complete when a draft exists, an approval is issued, a stored approval is claimed, a scheduler accepted it, or an automation was triggered.

It is complete only when the intended publication artifact is observable, its claims remain accurate for their declared temporal class, the platform result is reconciled, and the evidence is recorded.