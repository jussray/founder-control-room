# Mirror Engine V1

## Purpose

Mirror Engine turns one founder transcript into:

- one voice-preserving headline;
- a summary of at most three short sentences;
- 1–3 intent tags;
- one realistic 5–15 minute move;
- an optional ready-to-review script;
- a Tone Guard rewrite of that script;
- a factual-claim ledger that blocks unsupported external use;
- model and prompt provenance.

V1 deliberately runs the four model stages in one structured provider call. OpenAI remains the default provider for backward compatibility; Anthropic can be selected explicitly, and an optional second provider can be configured as a retryable-failure fallback. This keeps latency, cost, prompt drift, and partial-failure surfaces lower while preserving logical stage boundaries without coupling the product contract to one model vendor.

```text
Friend Intake
→ supplied transcript and related-memory context
→ Mirror + Intent + Tiny Move + Tone Guard
→ provider-neutral structured-output runtime
→ factual-claim detection + local semantic validation
→ draft-only response
→ Fact Check Every Claim when required
→ founder review or portable founder approval
→ separately gated external adapter
```

V1 does not transcribe audio, generate embeddings, query a vector database, publish, send, schedule, merge, or deploy. Those are separate adapters and gates.

## Endpoint

```http
POST /mirror/run
Authorization: Bearer <founder-supabase-access-token>
Content-Type: application/json
```

The route requires both a valid founder session and the `founder_users` allowlist.

## Request

```json
{
  "transcript": "I’m done putting all my time into everybody else’s emergency. I need today aimed at Bip, Founder Control Room, and the money path.",
  "relatedMemories": [
    "Founder Control Room is the governing command layer.",
    "The strongest current investor lead asked about provenance and revocation."
  ],
  "timeEnergyContext": "Tired, interrupted by kids, about 10 minutes available.",
  "recipientContext": "A LinkedIn reply to an aligned investor lead.",
  "voiceProfile": "Direct Philly founder voice. Preserve natural words such as bip, machine, money, and the hood. Do not manufacture slang."
}
```

### Bounds

- `transcript`: required, 1–20,000 characters.
- `relatedMemories`: optional array, at most 5 items, 1–4,000 characters each.
- `timeEnergyContext`: required, 1–500 characters.
- `recipientContext`: null or 1–1,500 characters.
- `voiceProfile`: null or 1–2,000 characters.

The API never writes raw transcript or memory text into `project_events`. Audit metadata records lengths, flags, result categories, and provider provenance only.

## Response

```json
{
  "version": "mirror-engine-v1",
  "runId": "4f71658c-ef5f-4d90-9cec-b23cab4219fe",
  "headline": "I’m building my machines, not carrying everybody else",
  "summary": "I need my time aimed at the builds and people that move my life forward. The noise is expensive, and I’m done letting it run the day.",
  "intentTags": ["money", "build"],
  "actionText": "Reply to the strongest investor lead with one proof-backed sentence.",
  "script": "I shipped the proof path and can show you the exact build receipt.",
  "timeEstimateMinutes": 7,
  "goal": "money",
  "confidence": 0.82,
  "toneGuardedScript": "I shipped the proof path and can show you the exact build receipt.",
  "containsExternalFactualClaims": true,
  "factualClaims": [
    "The proof path shipped."
  ],
  "distribution": {
    "mode": "draft_only",
    "factCheckStatus": "required_before_external_use",
    "externalActionAllowed": false
  },
  "provenance": {
    "provider": "openai",
    "model": "gpt-5-mini",
    "responseId": "resp_...",
    "promptVersion": "mirror-engine-v1-2026-07-30",
    "storedByProvider": false
  }
}
```

`provenance.provider` may be `openai` or `anthropic`. `storedByProvider` is `false` only when the runtime has direct per-request evidence for that claim (`store: false` on OpenAI). It is `null` for Anthropic because this receipt does not independently prove the selected model/account retention state; do not convert provider documentation or feature eligibility into runtime evidence.

## Provider configuration

OpenAI remains the no-migration default:

```env
OPENAI_API_KEY=
OPENAI_API_BASE_URL=https://api.openai.com/v1
MIRROR_ENGINE_MODEL=
MIRROR_ENGINE_PROVIDER=openai
MIRROR_ENGINE_TIMEOUT_MS=25000
```

Anthropic is opt-in and requires an explicit model instead of a hard-coded moving model ID:

```env
ANTHROPIC_API_KEY=
ANTHROPIC_API_BASE_URL=https://api.anthropic.com/v1
MIRROR_ENGINE_PROVIDER=anthropic
MIRROR_ENGINE_ANTHROPIC_MODEL=
```

Optional bounded failover:

```env
MIRROR_ENGINE_FALLBACK_PROVIDER=anthropic
```

The fallback is attempted only for retryable provider-availability failures such as timeout/network, HTTP 408/409/429, or 5xx. Authentication failure, invalid schema/configuration, refusal, incomplete output, and local semantic validation failures do not trigger provider failover.

QuickScan Chief uses the same shared runtime with its own selectors:

```env
QUICKSCAN_CHIEF_PROVIDER=openai
QUICKSCAN_CHIEF_FALLBACK_PROVIDER=
QUICKSCAN_CHIEF_MODEL=
QUICKSCAN_CHIEF_ANTHROPIC_MODEL=
QUICKSCAN_CHIEF_TIMEOUT_MS=25000
```

## Structured-output boundary

The shared runtime keeps the product schema richer than either provider grammar:

- OpenAI receives the existing strict JSON Schema through the Responses structured-output field.
- Anthropic receives a grammar-safe projection through `output_config.format`; generation-time keywords that Anthropic documents as unsupported are removed before dispatch.
- The original FCR validators remain authoritative after parsing, so removing a provider-unsupported grammar keyword does not remove the product rule.
- Anthropic recursive root references and external schema references fail closed before provider dispatch rather than being silently weakened.
- Response bodies are bounded before and after read, and the abort timer remains armed through response-body consumption.

Provider-specific wire formats live in `src/aiRuntime/structuredProvider.ts`; schema projection lives in `src/aiRuntime/schemaCompiler.ts`. Existing Mirror and QuickScan files keep their historical OpenAI-named compatibility exports so current imports do not churn.

## Error contract

```json
{
  "error": "Mirror Engine model provider is not configured",
  "code": "OPENAI_NOT_CONFIGURED"
}
```

Important codes include:

- `MIRROR_PROJECT_UNAVAILABLE`: Founder Control Room project registry lookup failed.
- `OPENAI_NOT_CONFIGURED` / `ANTHROPIC_NOT_CONFIGURED`: selected primary provider configuration is incomplete.
- `MODEL_PROVIDER_INVALID`: unsupported provider selector.
- `OPENAI_TIMEOUT` / `ANTHROPIC_TIMEOUT`: provider timeout.
- `OPENAI_HTTP_ERROR` / `ANTHROPIC_HTTP_ERROR`: provider returned a non-success status.
- `OPENAI_SCHEMA_UNSUPPORTED` / `ANTHROPIC_SCHEMA_UNSUPPORTED`: schema cannot be safely dispatched to the selected provider.
- `OPENAI_REFUSAL` / `ANTHROPIC_REFUSAL`: provider refused the structured request.
- `OPENAI_INCOMPLETE_OUTPUT` / `ANTHROPIC_INCOMPLETE_OUTPUT`: generation ended before a complete structured result.
- `INVALID_MODEL_OUTPUT`: structured output failed FCR's local semantic contract.
- `AUDIT_PERSISTENCE_FAILED`: required audit could not be written, so output is withheld.

Provider error details are not echoed to clients or written into public audit metadata.

## Tool-call and failover boundary

The structured Mirror/QuickScan paths do not execute external tools. The shared tool-runtime primitives now also have one concrete bounded consumer: `runGovernedRepositoryRead` in `src/aiRuntime/repositoryReadAttempt.ts`. Its invariants are:

1. streamed tool arguments are accumulated by `(provider, callId)`, byte-bounded, and parsed only after completion;
2. a completed final argument payload replaces, rather than duplicates, accumulated deltas;
3. a provider failure before tool execution may fail over safely;
4. a successful write may be reused for fallback answer synthesis but is never replayed merely because the model connection failed;
5. an unknown write outcome blocks model failover and tool replay until the authoritative FCR execution ledger and external provider outcome are reconciled;
6. idempotent write replay is permitted only after non-application is confirmed and the external provider guarantees deduplication for the same idempotency key;
7. the first repository-read vertical slice fixes provider selection to FCR's server-owned GitHub `RepositoryProvider`, resolves the mutable ref to an immutable SHA, and executes the file read only after the lease membrane admits the exact repository/ref/path subject;
8. repository content remains withheld after execution until a separately constructed FCR provider instance re-resolves the ref and independently re-reads the exact file; only a stable ref plus identical content hash may create the W1 readback witness that promotes the result to `VERIFIED`;
9. ref movement, byte disagreement, readback failure, target/capability substitution, path traversal, stale lease identity, or oversized content never releases the unverified file body;
10. the generic donor-runtime loop still does not accept caller-authored witness authority. The concrete repository wrapper creates the provider readback internally and exposes no witness/provider injection parameter.

`src/aiRuntime/toolFailover.ts` is policy only. It does not invent a second journal. Existing FCR mission/project/action idempotency and provider receipts remain the write authority. The repository-read vertical slice is read-only and does not add merge, deploy, provider mutation, secret, billing, or publication authority.

## Fact-check gate

When `containsExternalFactualClaims` is true:

1. pass the draft and `factualClaims` ledger into `skills/fact-check-every-claim/SKILL.md`;
2. verify each claim with the required independent source floor;
3. bind the fact-check artifact to the draft content hash;
4. apply corrections only after founder approval;
5. invalidate the prior report when the factual content changes;
6. keep distribution blocked until the corrected exact content is approved.

Tone Guard runs on phrasing. It cannot turn an unsupported claim into evidence.

## Portable approvals

A ChatGPT, Claude, Perplexity, or Founder Control Room conversation may carry Juss’s exact decision through a registered adapter. Execution requires the packet described in `docs/PORTABLE_FOUNDER_APPROVALS.md`.

Plain copied chat text, model recommendations, old broad approvals, and memory are not valid mutation receipts.

## Verification commands

The required repository proof floor for this slice is:

```bash
npm run typecheck
npm run lint
npm test -- src/aiRuntime/__tests__ src/http/routes/__tests__/mirror.integration.test.ts src/quickscan/__tests__/chiefOpenaiClient.test.ts
npm run verify:ai-skills
npm run build
```

The repository's current Quality Gate is pull-request triggered and binds jobs to the exact PR head. Do not report those checks as executed for a branch-only change unless a real PR-head run exists.

This remains an API/runtime-only slice; no browser UI behavior changes in these files. A real Playwright receipt is still required before any later UI/browser-flow claim or merge gate that requires browser proof.

## Rollback

Before merge, revert the focused feature-branch commits or abandon the branch. After merge, revert the focused provider-runtime commits in reverse order. Do not delete audit history, approval receipts, provider receipts, or existing idempotency state.
