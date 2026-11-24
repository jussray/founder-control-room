# LinkedIn analytics continuity

Status: current repository workflow contract.

Founder Control Room treats LinkedIn analytics as observation-only evidence. Analytics may describe posting cadence, comparable windows, engagement, follower/profile conversion, and experiment outcomes. It must not publish, schedule, approve, renew truth, authenticate provider account ownership from caller-supplied labels, or become provider authority.

## Contract

`scripts/linkedin_analytics_continuity.py` implements `linkedin-analytics-continuity@v1` for LinkedIn aggregate XLSX exports. It also exposes the additive `linkedin-native-post-measurement@v1` receipt for one exact post/experiment target without changing the aggregate contract.

The aggregate workflow is:

```text
LinkedIn XLSX export
-> read TOP POSTS + ENGAGEMENT
-> normalize publish dates separately from activity dates
-> canonicalize LinkedIn post URLs
-> derive exact LinkedIn post URN when visible
-> SHA-256 post fingerprint
-> per-day post set
-> deterministic day cadence cookie
-> cadence + comparable 7-day windows
-> cap-aware evidence state
-> optional reconciliation against the prior JSON receipt
-> existing linkedin_experiments / Founder Signal Engine analysis lane
```

The targeted measurement workflow is:

```text
normalized native export
+ declared FCR account id
+ exact LinkedIn post URN/URL
+ exact FCR experiment id
-> canonical exact-post identity
-> visible-native-post match
-> exact post impressions when present
-> explicit null for unavailable post-level engagement
-> export-window receipt with freshness still unproved
-> non-authorizing identity receipt
-> separate provider-authenticated account binding still required before learning
```

### Exact measurement identity

A post-level learning candidate must bind all four identity dimensions:

```text
platform = linkedin
account = exact FCR account identity
post = exact canonical LinkedIn share/ugcPost URN
experiment = exact FCR experiment identity
```

`linkedin-native-post-measurement@v1` deliberately distinguishes exact post visibility from account authentication. A caller-supplied `--account-id` is recorded as `DECLARED_FCR_IDENTITY_NOT_PROVIDER_AUTHENTICATED`; it does not prove the XLSX belongs to that account. A caller-supplied experiment id is likewise a declared FCR mapping, not provider evidence.

The targeted receipt also carries the analyzed export window but marks `freshness_state = NOT_ESTABLISHED_BY_THIS_RECEIPT`. The window says what dates were analyzed; freshness is not established by this receipt. A downstream decision must separately prove the native export is current enough for the verdict being requested.

Therefore the targeted receipt always emits:

```text
learning.eligible_from_this_receipt = false
publication_authority = false
strategy_mutation_authority = false
```

A downstream learning decision must independently establish provider-authenticated account binding, current native-export freshness, preserve the exact experiment mapping, and have sufficient exact-post metrics for the requested verdict.

### Exact post semantics

The parser canonicalizes supported identities to one of:

```text
urn:li:share:<numeric-id>
urn:li:ugcPost:<numeric-id>
```

The same identity may be supplied as a canonical URN, a LinkedIn `/posts/` URL containing the share/ugcPost id, or a LinkedIn feed URL containing the URN. Embedded URNs inside URLs are accepted only after the URL host is verified as `linkedin.com` or `www.linkedin.com`. Non-LinkedIn hosts, free-form text containing a URN, and malformed identities fail closed.

When the exact post is visible in TOP POSTS, the receipt may use that row's exact-post impressions. The ENGAGEMENT sheet is date-level activity and may include engagement from multiple or older posts, so its engagement value must never be promoted to an exact-post engagement metric. Until a native source supplies exact-post engagement, targeted `metrics.engagements` remains `null`.

When the exact post is not visible, the targeted receipt is `UNKNOWN_NO_EVIDENCE`. This remains true even when the provider TOP POSTS list is capped. Absence from a capped or uncapped visible export is not zero impressions, not zero engagement, not deletion, and not proof the post failed.

If the same canonical post identity appears more than once in the normalized visible set, the targeted receipt becomes `BLOCKED_AMBIGUOUS_NATIVE_IDENTITY`. It may report that the identity was visible, but it must not choose one duplicate row as authoritative or convert that ambiguity into a success/failure verdict.

### Fingerprints

A post fingerprint is the first 16 hex characters of SHA-256 over:

```text
linkedin|<publish-date>|<normalized-post-url>
```

Tracking query parameters and URL fragments are removed before hashing. The fingerprint identifies the same visible post across later exports; it is not publication proof, approval, provider truth, account authentication, or a secret.

### Cadence cookies

Each calendar day receives a deterministic reconciliation token:

```text
LI-DAY-YYYYMMDD-PNN-<12-char-digest>
```

The digest is computed from the sorted visible post fingerprints for that day, or from an explicit empty-day identity when no visible post is present. A cadence cookie binds the observed visible set for reconciliation only. It grants no execution or publishing authority.

### Export caps

LinkedIn's TOP POSTS export can be capped. When the visible provider list reaches the configured cap, the analyzer emits:

```text
VERIFIED_VISIBLE_FLOOR
```

This means the count is a verified visible minimum, not proof that no additional lower-ranked posts existed. Missing fingerprints in a later capped export are reported as `missing_from_current_visible_set`; they are not treated as deleted historical posts. A targeted exact post missing from such an export remains `UNKNOWN_NO_EVIDENCE`.

### Publish date vs activity date

Posting cadence is computed from `Post Publish Date` in TOP POSTS. Daily impressions/engagements come from ENGAGEMENT and may be generated by older posts. Activity on a date therefore must never be converted into a claim that a new post was published that day or into an exact-post engagement metric.

### Attack 3000 content decision evidence

The `content-outcome-learning@v1` Attack 3000 adapter may consume content analytics only as one bounded outcome observation. All publication and metric values used together must bind to the same `observationId`, content fingerprint, provider, comparable window, and observation timestamp.

`CURRENT` is a claimed freshness state, not proof of currentness. Every evaluation supplies its own `evaluatedAt`, and the adapter independently checks window ordering, measurement completion, future skew, observation time, and an explicit bounded `expiresAt` lease. An observation cannot remain current for more than 24 hours from `observedAt`; an expired, future-dated, overlong, malformed, historical, stale, superseded, invalidated, incomplete, or mixed-identity observation remains provenance but cannot be promoted into a current `SUPPORTED` verdict.

Derived stop floors are local to the observation and metric they govern. They do not fire before verified publication or before the measurement window is complete, and an unrelated unknown metric cannot suppress an otherwise verified floor breach.

Publishing, impressions, reactions, comments, and profile views are distribution or intent evidence, not business demand by themselves. A supporting `external_demand` dimension requires its own evidence references plus at least one downstream attributed signal such as visits, qualified conversations, contacts, or deals. Generic analytics references must never substitute for the evidence bound to that demand assertion.

Attack 3000 remains observation-only. `SUPPORTED`, `HOLD`, or `FALSIFIED` does not authorize Buffer, LinkedIn, n8n, Zapier, external contact, spend, merge, deploy, publication, or another provider mutation.

### Content Trend Radar

`evaluateContentTrendRadar` is an advisory ranking capability inside the existing ULTRATHINK content lane. It does not create a second publishing system. It ranks sourced market signals using timing, audience interest, content potential, founder fit, closest-legitimate-dollar relevance, competition opportunity, saturation, and content-fingerprint similarity.

Trend evidence stays classified as `VERIFIED`, `EMERGING_SIGNAL`, `INFERENCE`, or `PREDICTION`. First-wave eligibility requires at least one non-empty evidence id with a named source and `observedAt` timestamp that is current against the explicit evaluation time. The default currentness window is seven days with at most two minutes of tolerated future clock skew. Evidence-less, unattributed, malformed, stale, future-dated, prediction-only, or incompletely framed candidates cannot enter the first wave. Historical evidence may still remain visible in ranking provenance without being promoted into current recommendation evidence.

The Trend Radar also requires contrarian, practical, and future content angles, penalizes crowded or repeated patterns, and preserves the existing content-fingerprint comparison instead of blindly repeating a breakout topic. A ranking is a recommendation only. It grants no publish, scheduling, spend, provider, merge, deploy, or external-contact authority.

### Founder-content approval retry identity

Founder-content approval reservations use a deterministic identity for the same founder, platform, normalized public thesis/opening hook, and exact Current You intent. Evidence/source rotation therefore cannot manufacture a second reservation for the same public pattern inside the same intent.

If the authoritative insert succeeded but the caller lost the response, retry recovery is allowed only by reading back the exact active reservation with the same approval id, founder, proposal hash, public payload hash, and platform. The stored authorization hash and timestamps are returned as the original receipt. A mismatched, consumed, revoked, expired, or otherwise non-current reservation is not recovered and does not create new authority.

## Run

Aggregate continuity:

```bash
python3 scripts/linkedin_analytics_continuity.py \
  AggregateAnalytics.xlsx \
  --start 8/2/2026 \
  --end 8/29/2026 \
  --output linkedin-analytics.json
```

Exact post/experiment observation:

```bash
python3 scripts/linkedin_analytics_continuity.py \
  AggregateAnalytics.xlsx \
  --start 9/10/2026 \
  --end 9/13/2026 \
  --account-id linkedin-N6yjyvwGD9 \
  --experiment-id LI-2ENGINE-20260910-A \
  --post urn:li:share:7503964322184732672 \
  --output linkedin-arm-a-observation.json
```

`--account-id`, `--experiment-id`, and `--post` are an all-or-none targeted tuple. Supplying only part of the tuple fails closed.

To reconcile a later export against an earlier normalized receipt:

```bash
python3 scripts/linkedin_analytics_continuity.py \
  LaterAggregateAnalytics.xlsx \
  --start 8/2/2026 \
  --end 9/5/2026 \
  --previous-json linkedin-analytics.json \
  --output linkedin-analytics-later.json
```

Focused verification:

```bash
python3 -m unittest scripts/test_linkedin_analytics_continuity.py
```

## Interpretation order

For content decisions, prefer qualified engagement and follower/profile conversion, then relevant reach, then raw impressions. Comparable windows and per-post fingerprints should be used before inferring that a content theme improved. Exact-post native visibility does not by itself authenticate the account, establish freshness, or create learning eligibility. Analytics conclusions remain proposals for founder review and can feed the existing `linkedin_experiments` record only after the required identity/evidence gates are independently satisfied; they do not authorize Buffer, LinkedIn, n8n, Zapier, or another distribution provider.
