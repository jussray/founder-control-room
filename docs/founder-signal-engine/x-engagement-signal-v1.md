# X Engagement Signal Adapter v1

Status: `MOCK_FIRST / LIVE_DISABLED_BY_DEFAULT`

Authoritative code:

- `src/lib/xEngagementSignal.ts`
- `src/lib/__tests__/xEngagementSignal.test.ts`
- `supabase/migrations/20260820003500_portfolio_signal_observations.sql`

## Founder outcome

Fill the X market-signal gap once for the portfolio without copying a paid scraper, token, cache, or provider authority into every product repository.

The adapter answers one narrow question:

> For this topic, what is the median visible engagement of the strongest recent X posts, so a separately authorized reasoning layer can compare that external signal with an owned-channel median?

It does not publish, contact anyone, change a campaign, approve content, or decide whether a product idea is good.

## Portfolio placement

Founder Control Room owns the external observation because it already owns the portfolio signal plane, founder authority, provider-state separation, observation-only analytics, and project isolation.

```text
Apify/X external observation
        ↓
FCR normalized aggregate signal
        ↓
Chief / PromptOS reasoning package
        ↓
project-specific campaign policy
        ↓
founder decision / existing publication gates
```

Product repositories are consumers of a normalized aggregate signal. They do not receive `APIFY_TOKEN`, raw scraped posts, author identities, or a second paid-scraper implementation.

## Adapter contract

The provider actor is pinned to `apidojo/tweet-scraper` and checked before a paid run.

The current actor contract requires at least 50 returned tweets per query, so v1 requests 50 provider rows, then locally:

1. revalidates the exact trailing 48-hour window;
2. requires at least 50 replies;
3. computes visible engagement as likes + reposts + replies + quotes;
4. sorts qualifying rows by engagement;
5. keeps the top-40 pool requested by the product rule; and
6. returns the median of the first 10 rows in that pool.

Provider filtering is treated as candidate retrieval, not final truth. Local filtering remains authoritative for the 48-hour and reply-count rules.

## UNKNOWN means HOLD

The result is never coerced to zero.

These conditions return `UNKNOWN`:

- live provider use is disabled;
- token is missing;
- founder-set cost cap is missing or invalid;
- topic input is invalid;
- actor validation fails;
- provider/rate-limit/network failure;
- no qualifying rows remain;
- durable cache or lease proof fails; or
- a same-topic/day reservation already exists.

`gate3StateFromXEngagement()` maps every `UNKNOWN` state to `HOLD`. A known signal becomes only `READY_FOR_MEDIAN_COMPARISON`. It does not become PASS, KILL, publish authority, or product truth.

## Cost and duplicate-run guard

Live calls require all three runtime values:

```text
X_ENGAGEMENT_LIVE_ENABLED=true
APIFY_TOKEN=<private provider secret>
X_ENGAGEMENT_MAX_CHARGE_USD=<explicit positive cap at or below 0.10>
```

No secret value is committed to source. The adapter also hard-fails closed when the configured per-run cap exceeds `$0.10`, so a typo cannot silently turn this narrow signal lookup into an open-ended provider spend.

The cache identity is:

```text
normalized topic + UTC date
```

FCR uses the dedicated service-role-only `portfolio_signal_observations` table for this cross-project public-market aggregate. It deliberately does **not** use project-scoped `provider_observations`, because project evidence must remain partitioned even when a public-market signal is reusable portfolio-wide. The existing atomic controller-lease RPC handles cross-process contention.

The caller still supplies its project identity so the request remains project-aware at the service boundary, but the public-market cache is not partitioned by product. No product-private data is written into the portfolio cache.

Before the paid actor POST, FCR writes a durable `RESERVED` observation. Therefore a worker crash after reservation fails closed as `UNKNOWN / CACHE_RESERVED` for the rest of that UTC topic/day instead of silently starting a second paid run.

A successful or failed provider result becomes `COMPLETE` and is reused by every portfolio project asking for the same normalized topic on the same UTC date. This is intentionally a shared public-market observation, not shared project-private evidence.

## Privacy and Sauce Guard

The durable observation stores only normalized topic identity, cache metadata, aggregate counts, the median signal, window timestamps, and the UNKNOWN reason when applicable.

It does not retain:

- raw post text;
- handles or author identity;
- post URLs;
- comments or replies;
- provider payloads;
- customer/user data; or
- project-private content.

A topic can still disclose private strategy, so the observation remains inside the trusted FCR data boundary and must not be rendered into public evidence by default.

## Project audit disposition

### Founder Control Room

**Owner.** One paid external observation belongs here because FCR already governs portfolio signals, provider states, founder authority, Sauce Guard, and observation-only analytics.

### Chief AI Machine + PromptOS

**Reasoning consumers, not provider owners.** They may compare a `KNOWN` normalized aggregate against an explicitly supplied owned-channel median. `UNKNOWN` must remain HOLD. They must not acquire `APIFY_TOKEN`, call the actor directly, or convert advisory evidence into execution authority.

### StoryEngine

**Selection consumer.** Story-to-social ranking may use a normalized market signal as one evidence input. Story quality, canon, proof, and publication authority remain separate.

### Juss Beautiful Hair

**Consumer.** The brand can use a portfolio signal for topic qualification. The public storefront must never own the token or scraper. The private JBH-local prototype is superseded only after this FCR replacement has transferred and proven all unique obligations.

### Untold Stories + SWEATS

**Consumers when a campaign actually needs the signal.** No duplicate provider integration is justified. Their product/brand rules remain authoritative over topic fit.

### Se'kret Bip

**Sanitized marketing consumer only.** Raw X content, handles, replies, or scraped provider payloads must not cross into teen, journal, family, wellness, or parent-visibility data paths. Only the aggregate public-market signal may be considered by the external founder-content layer, behind the existing sensitive-repository output firewall.

### SolContinuity + SleepWealth-Agent + other portfolio projects

**No default integration.** FCR may supply the aggregate signal if a future marketing/research decision explicitly needs it. Repository ownership of a scraper is not created merely because FCR can observe X.

### Historical/duplicate repositories

**No integration.** Archived, superseded, demo-only, or explicitly protected repositories are not provider deployment targets.

## Provider and policy boundary

A third-party scraper does not transfer X platform-policy or legal responsibility away from the founder. Live use requires a separate current policy/legal decision and the applicable founder authority.

Repository implementation proves only the adapter contract. It does not prove:

- an Apify account or plan exists;
- the token is configured;
- live use is enabled;
- the portfolio-signal migration has been applied to the intended FCR database;
- a paid run has occurred;
- the actor currently returned useful data;
- a campaign was approved or published; or
- the signal improved business outcomes.

Keep these truth states separate:

```text
contract-capable
→ configured
→ migration-applied
→ live-enabled
→ adapter-proven
→ provider-outcome-proven
→ business-outcome-observed
```

## Rollback

Close/revert the focused FCR adapter and migration source change and leave live enablement off. Product repositories require no provider rollback because they do not own the token, billing, actor, or cache.
