# Friend Intake v1

Friend Intake is the founder-facing reflection slice inside Founder Control Room.

## Flow

```text
founder auth
-> privacy choice
-> sensitive/private-identifier check
-> explicit runtime provider
-> interactive founder channel for live inference
-> atomic one-shot budget reservation for live inference
-> Mirror
-> editable tags
-> exactly one Move
-> provenance drawer
-> one timeline receipt
-> usefulness feedback
```

Endpoint:

```text
POST /mirror/friend-intake
POST /mirror/friend-intake/:runId/usefulness
```

## Runtime providers

`deterministic` is local and uses no model.

Live providers are `openai`, `anthropic`, and `perplexity`. They are server-side only and fail closed unless `FRIEND_MODELS_ENABLED=true`, `FRIEND_RUNTIME_PROVIDERS` is present and explicitly includes the selected provider, the required server credential is available, the input is not classified sensitive, the current request was authenticated through the opaque interactive founder browser channel, and an atomic Friend budget reservation succeeds before provider execution. Reusable bearer authentication may use deterministic Friend but may not trigger paid live inference.

The canonical Worker source pins the Friend models to:

```text
FRIEND_OPENAI_MODEL=gpt-5.6-luna
FRIEND_ANTHROPIC_MODEL=claude-sonnet-5
FRIEND_PERPLEXITY_MODEL=sonar
```

Perplexity Friend requests explicitly disable web search. Friend Intake does not retrieve related memories.

## Live inference budget authority

Every non-sensitive live-provider run must reserve one immutable allowance in `friend_inference_reservations` before the provider call. The reservation is bound to the founder, run, selected provider, per-run authorization amount, daily authorization ceiling, and a short expiry. Concurrent reservations for the same founder/day are serialized in PostgreSQL so two requests cannot both spend the same remaining budget.

Canonical source intent currently sets:

```text
FRIEND_LIVE_REQUEST_BUDGET_USD=0.25
FRIEND_LIVE_DAILY_BUDGET_USD=1.00
```

These values are **FCR authority ceilings**, not claims about a provider invoice. A failed provider call retains its reservation because an upstream failure may still incur provider cost. Repeated calls therefore consume the same bounded daily authority instead of silently restoring it through retries.

The reservation ID is surfaced in live-run provenance. A deterministic or sensitive-local run requires no live budget reservation.

## Privacy

`process_without_saving` means **FCR persists no founder content**. That includes raw input, raw embeddings, raw timeline/provenance payloads, intent tags, sensitive-category labels, input length, and other content-derived semantic classifications. The completion timeline may retain only bounded operational facts required to prove that processing occurred and which privacy/runtime/authority policy applied.

When a live provider is selected, the submitted content is still transmitted to that provider for inference. FCR does not claim that `process_without_saving` overrides or disables the provider's own retention/data-handling policy. Provider storage posture is surfaced in provenance.

Under `save_redacted_summary`, the only founder-derived content stored in `friend_intake_summaries` is the bounded redacted summary. The row may also store non-content operational provenance such as provider, model, run identity, and provenance identity. Raw transcript, intent/sensitivity tags, related memory, embeddings, and provider payloads have no column in that table. Contact identifiers, credential-shaped values, common identity numbers, labeled financial identifiers, and bare long card-like digit sequences are removed or masked before summary persistence.

Successful completion persistence is atomic: the optional redacted summary and sanitized `project_events` completion receipt are committed in one database transaction. If that atomic completion write fails, the success transaction rolls back and Friend attempts a separate sanitized `friend_intake_failed` audit event so a provider call does not disappear from the audit plane merely because completion storage drifted.

The founder-visible timeline uses `project_events` for sanitized operational metadata only. Completion/failure metadata does not store raw Friend input or content-derived intent/sensitivity tags.

Usefulness is stored in `friend_intake_feedback` only after FCR verifies that the referenced completed Friend run exists and belongs to the authenticated founder. It never contains the input or model output.

## Sensitive input

Credential-shaped values, private contact/identity/financial identifiers, bare long card-like digit sequences, legal, health/crisis, teen, and family-conflict signals are detected before live provider use. Those inputs stay local and return one protective or clarifying move.

## Truth

Model output is inference.

A successful Friend provider call or budget reservation does not prove:

- founder approval beyond that exact Friend run;
- external factual truth;
- an external provider write;
- the provider's final billing amount;
- publication;
- deployment;
- memory retrieval.

The provenance drawer states those boundaries directly.

## Runtime bounds

Live-provider requests preserve these fail-closed limits:

- explicit provider allowlist required;
- validated interactive founder authentication channel required for live inference;
- one immutable budget reservation required before provider execution;
- daily reservation ceiling enforced transactionally across concurrent requests;
- fixed structured-output schema;
- one-move contract;
- bounded output token request;
- request timeout remains active through response-body consumption;
- response bodies are byte-capped while streaming and cancelled when the cap is exceeded;
- no automatic fallback from one live provider to another.

The authenticated channel is carried forward from the first founder-auth pass. If that pass refreshes and rotates the opaque browser session, downstream Friend authority does not re-read the now-revoked request cookie. Bearer callers remain marked as bearer callers and do not inherit interactive authority.

## Feature flags

Public-safe non-secret Worker intent:

```text
FRIEND_MODELS_ENABLED=true
FRIEND_RUNTIME_PROVIDERS=openai,anthropic,perplexity
FRIEND_OPENAI_MODEL=gpt-5.6-luna
FRIEND_ANTHROPIC_MODEL=claude-sonnet-5
FRIEND_PERPLEXITY_MODEL=sonar
FRIEND_LIVE_REQUEST_BUDGET_USD=0.25
FRIEND_LIVE_DAILY_BUDGET_USD=1.00
```

Server-held credentials required by the canonical Worker binding membrane:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
PERPLEXITY_API_KEY
```

Optional runtime tuning:

```text
FRIEND_MODEL_TIMEOUT_MS
```

Never place credential values in source or screenshots.

## Proof boundary

Repository code and CI can prove the adapters, privacy guards, schema validation, budget-reservation contract, atomic persistence contract, authentication-channel boundary, streaming/timeout guards, and browser behavior. They cannot prove production provider credentials exist, that the Friend migration has been applied, that the candidate Worker is serving production traffic, that a production provider call succeeds, or what the provider ultimately bills. Those require separate database, deployment, provider, and live-runtime evidence after authorization.
