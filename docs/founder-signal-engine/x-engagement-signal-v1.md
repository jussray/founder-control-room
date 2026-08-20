# X Engagement Signal Adapter v1

Status: `MOCK_FIRST / LIVE_DISABLED_BY_DEFAULT`

Authoritative code:

- `src/lib/xEngagementSignal.ts`
- `src/lib/__tests__/xEngagementSignal.test.ts`
- `src/lib/__tests__/xEngagementSignal.boundary.test.ts`
- `src/http/routes/xEngagementSignalMcp.ts`
- `src/http/routes/__tests__/xEngagementSignalMcp.test.ts`
- `src/http/middleware/founderSignalReadMcpAuth.ts`
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

## Portable read-only MCP seam

FCR exposes the aggregate through a separate read-only companion MCP endpoint:

```text
POST /mcp/founder-signal-x-engagement
```

It uses a dedicated least-privilege bearer credential:

```text
FOUNDER_SIGNAL_READ_MCP_TOKEN
```

That credential must be different from `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN`. A ChatGPT, Claude, or other read-only workbench that can ask for market evidence must not inherit access to the broader Founder Signal write bridge.

The endpoint advertises one tool:

```text
get_x_engagement_signal(projectId, topic)
```

The server mounts dedicated read-MCP authentication, and the route handler repeats the same bearer check as defense in depth. The broader write token is rejected. The tool is annotated read-only, destructive=false, and idempotent. It returns only the normalized signal, Gate 3 state, and explicit non-authority metadata.

The publishing/write-authority middleware is intentionally **not** mounted on this endpoint because there is no publication or mutation action to authorize. This does not create a second authority lane: the tool cannot publish, change content, elevate permissions, accept provider credentials in arguments, or bypass the existing publication path. Portable workbenches may consume it as an evidence surface while FCR remains provider owner and proof ledger.

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

Credential-like topic input is rejected before hashing, durable storage, or provider egress. The adapter is not a secret transport. The MCP schema also rejects unexpected arguments such as caller-supplied tokens.

## UNKNOWN means HOLD

The result is never coerced to zero.

These conditions return `UNKNOWN`:

- live provider use is disabled;
- token is missing;
- founder-set cost cap is missing or invalid;
- topic input is invalid or credential-like;
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

No secret value is committed to source. The adapter hard-fails closed when the configured per-run cap exceeds `$0.10`, so a typo cannot silently turn this narrow signal lookup into an open-ended provider spend.

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

A topic can still disclose private strategy, so callers must supply public-market topics only. Credential-like content is rejected in code, but the trusted FCR boundary remains the place for this aggregate and it must not be rendered into public proof by default.

## Project audit disposition

### Founder Control Room

**Owner.** One paid external observation belongs here because FCR already governs portfolio signals, provider states, founder authority, Sauce Guard, and observation-only analytics.

### Chief AI Machine + PromptOS

**Reasoning consumers, not provider owners.** They may compare a `KNOWN` normalized aggregate against an explicitly supplied owned-channel median. `UNKNOWN` must remain HOLD. They must not acquire `APIFY_TOKEN`, call the actor directly, or convert advisory evidence into execution authority. Portable workbenches reach the aggregate through the dedicated FCR read-only MCP tool rather than installing a provider adapter in Chief or PromptOS.

### StoryEngine

**Selection consumer.** Story-to-social ranking may use a normalized market signal as one evidence input. Story quality, canon, proof, and publication authority remain separate. StoryEngine does not own the provider credential.

### Juss Beautiful Hair

**Consumer.** The current public storefront `jussray/jussbeautifulhair-site` must never own the token or scraper. `jussray/jbh-private` may consume the FCR aggregate for private topic qualification, but its local adapter draft is a replacement candidate to retire only after this FCR obligation is fully proven. The older `jussray/jussbeautifulhair1` source and archived `jussray/Juss-beautiful-hair-` are not new provider targets.

### Untold Stories + SWEATS

**Consumers only when a real campaign needs the signal.** No duplicate provider integration is justified. Their product/brand rules remain authoritative over topic fit. SWEATS currently has no implementation surface that justifies a local provider dependency.

### Se'kret Bip teen product

**Sanitized founder-marketing consumer only.** Raw X content, handles, replies, or scraped provider payloads must not cross into teen, journal, family, wellness, or parent-visibility data paths. Only the aggregate public-market signal may be considered by the external founder-content layer, behind the existing sensitive-repository output firewall.

### Se'kret Bip Jr

**No child-product integration.** `jussray/Se-kretBip` is the ages 5–12 Bip Jr product, not a duplicate of the teen app. No raw or aggregate social signal belongs in child personalization, study, authority, Bridge, or supervised-contact logic. A separate external founder-marketing workflow may consume FCR evidence without sending it into child data paths.

### Se'kret Bip demo and protected historical lanes

`jussray/sekret-bip-demo` is explicitly non-canonical demonstration-only and receives no provider integration. `jussray/don-t-touch-this-one` remains observe-only. Archived `jussray/do-not-use` receives no integration. `Juss-Co/Bip` currently has no product source that justifies a provider seam.

### SolContinuity

**No default integration.** Social engagement must not become resilience or quorum evidence. FCR may supply the aggregate only to a separate future marketing/research decision.

### SleepWealth-Agent

**Marketing-only, never trading signal.** X engagement must not enter risk, portfolio, trade, execution, or paper-trading decision logic. If the project later needs founder-marketing research, it consumes the same FCR aggregate outside the financial decision path.

### Profile, archived, superseded, and demo-only repositories

**No integration.** A repository's existence inside the portfolio does not create a reason to install a paid provider dependency. Provider ownership remains centralized unless a future evidence-backed architecture demonstrates a different authority boundary.

## Provider and policy boundary

A third-party scraper does not transfer X platform-policy or legal responsibility away from the founder. Live use requires a separate current policy/legal decision and the applicable founder authority.

Repository implementation proves only the adapter contract. It does not prove:

- an Apify account or paid plan exists;
- either MCP token is configured;
- `APIFY_TOKEN` is configured;
- live use is enabled;
- the portfolio-signal migration has been applied to the intended FCR database;
- the read-only MCP endpoint has been deployed to the intended FCR runtime;
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
→ MCP-runtime-proven
→ provider-outcome-proven
→ business-outcome-observed
```

## Rollback

Close/revert the focused FCR adapter, read-only MCP seam, and migration source change and leave live enablement off. Product repositories require no provider rollback because they do not own the token, billing, actor, or cache.
