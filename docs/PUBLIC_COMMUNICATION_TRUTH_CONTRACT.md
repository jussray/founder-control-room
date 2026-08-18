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
→ Publish or hold
→ Capture the published artifact
→ Record outcome evidence
→ Reconcile and correct
```

## /futureyou

Before posting, ask:

> Will the future version of the founder, team, customer, or community be able to understand what was actually true when this was published?

A durable post should preserve context rather than manufacture a cleaner history. It must not create promises, expectations, or interpretations that future builders cannot support.

FutureYou is advisory. It cannot turn a desired future into current evidence, renew stale proof, or authorize publication.

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

## Sauce Guard

The purpose of founder publishing is to tell the verified progress story, not give away the implementation recipe.

Public-safe material may include:

- what changed in the product;
- what problem was solved;
- what was learned;
- why the progress matters to users, partners, investors, or builders;
- an approved public proof link; and
- a truthful unresolved next gate.

Keep private:

- prompts and hidden instructions;
- raw diffs or private source excerpts;
- credentials, tokens, secret references, internal URLs, and private provider payloads;
- private metrics or customer data;
- unreleased roadmap detail that creates unnecessary copying risk;
- security-sensitive implementation detail; and
- proprietary mechanics whose disclosure adds no material public proof value.

Sauce Guard is a disclosure boundary, not permission to weaken truth. A safer public summary still needs evidence.

## Accounting-control principles for automated posting

The founder authorizes automated publication only when the post and its workflow satisfy all of these controls:

- **Completeness:** all material facts, limitations, dependencies, and known exceptions needed to avoid a misleading impression are included.
- **Accuracy:** every factual, financial, operational, usage, partnership, deployment, and outcome claim matches recorded evidence.
- **Consistency:** terms, statuses, metrics, time periods, and classifications are applied the same way across posts and records unless a documented reason explains a change.
- **Cut-off:** events are attributed to the correct date and period; planned, pending, completed, and later-occurring events are not blended together.
- **Evidence and traceability:** each material claim can be traced to a source artifact, record, run, message, URL, ledger entry, or other durable evidence.
- **Temporal validity:** a deferred queue may carry only claims whose declared temporal class remains valid at the use boundary; current-state claims require fresh revalidation.
- **Authorization:** the post belongs to an approved automated publishing class and does not exceed that class's audience, channel, topic, frequency, or risk boundary.
- **Route authority:** a class authorization does not weaken a more specific executable route that requires exact Current You approval.
- **Separation of record and promotion:** promotional language may summarize verified records but may not alter, replace, or overstate them.
- **Conservatism:** when evidence is incomplete, stale, contradictory, or ambiguous, use the less expansive claim or hold the post.
- **Reconciliation:** after publishing, compare the intended post, platform artifact, publication time, links, and status; record mismatches.
- **Correction and audit trail:** preserve what was published, why, by which workflow, under which authorization, and how any error was corrected.

This is an internal control framework inspired by sound accounting practice. It is not a representation that a post, workflow, or repository has received an external audit or formal GAAP opinion.

## Founder authorization

An approved automated publishing class defines the maximum class of communication that automation may handle. It does **not** weaken a more specific executable authority contract.

Current first-party founder-content execution uses exact Current You authority: the exact public payload, proposal identity, channel, source version, and Current You approval must remain bound at execution. A standing class authorization must never be interpreted as permission to bypass that exact-proposal approval membrane when the active route requires it.

A separately implemented standing-automation route may publish inside its approved low-risk class without per-post approval only when that route's own policy, temporal-truth, cadence, evidence, Sauce Guard, and provider-readback contracts all pass. Standing automation is an authority mode, not a universal bypass token.

This class boundary does not authorize:

- invented, estimated, or unsupported financial results;
- claims of revenue, profit, valuation, funding, customers, users, partnerships, endorsements, deployment, or impact without evidence;
- disclosure of private, sensitive, contractual, security-relevant, or legally restricted information;
- changes to prices, financial commitments, contracts, payments, fundraising terms, legal positions, or binding promises;
- crisis communications, admissions of liability, political statements, or other high-consequence communications not explicitly approved as a separate class; or
- bypassing a hold condition because a scheduler or model is technically able to publish.

Fresh approval is required whenever the active executable route requires exact Current You approval, whenever the proposal or approved copy changes, or whenever the post falls outside the approved class or crosses a high-consequence boundary.

Investor email is a separate authority class. It must never auto-send without both the applicable standing policy and recipient-specific qualification.

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
- a captured URL, observable platform artifact, message ID, or equivalent evidence after publication; and
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
- "used" or "helped" only with evidence of human use or outcome; and
- "historically verified" when a fact was true for an exact older version/time but is not being asserted as current.

For deferred founder-progress posts, prefer durable historical wording such as "I shipped," "I merged," "I tested," or "I found and fixed" when exact-version evidence supports it. Present-tense operational language belongs on an execution-time revalidated path.

## Hold conditions

Hold the post when:

- a key claim cannot be traced to evidence;
- the accounting-control check does not pass;
- temporal classification is missing, mismatched to the wording, or no longer valid at the use boundary;
- a current-state claim is being sent through a deferred queue that cannot revalidate it at publication time;
- the post falls outside the approved automated publishing class or a stricter exact Current You gate is unsatisfied;
- the post depends on a workflow that failed before executing steps;
- private, sensitive, proprietary, sauce, or security-relevant information could be exposed;
- urgency is being used to bypass truth or review; or
- the post would make a reasonable reader believe more was completed than the evidence proves.

## Completion standard

A posting workflow is not complete when a draft exists, a scheduler accepted it, or an automation was triggered.

It is complete only when the intended publication artifact is observable, its claims remain accurate for their declared temporal class, the platform result is reconciled, and the evidence is recorded.
