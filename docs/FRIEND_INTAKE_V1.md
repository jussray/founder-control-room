# Friend Intake v1

Friend Intake is the founder-facing reflection slice inside Founder Control Room.

## Flow

```text
founder auth
-> privacy choice
-> sensitive check
-> explicit runtime provider
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

Live providers are `openai`, `anthropic`, and `perplexity`. They are server-side only and fail closed unless `FRIEND_MODELS_ENABLED=true`, `FRIEND_RUNTIME_PROVIDERS` is present and explicitly includes the selected provider, the required server credential is available, the input is not classified sensitive, and the request is backed by an interactive founder browser session. Reusable bearer authentication may use deterministic Friend but may not trigger paid live inference.

The canonical Worker source pins the Friend models to:

```text
FRIEND_OPENAI_MODEL=gpt-5.6-luna
FRIEND_ANTHROPIC_MODEL=claude-sonnet-5
FRIEND_PERPLEXITY_MODEL=sonar
```

Perplexity Friend requests explicitly disable web search. Friend Intake does not retrieve related memories.

## Privacy

`process_without_saving` means **FCR persists no founder content**. That includes raw input, raw embeddings, raw timeline/provenance payloads, intent tags, sensitive-category labels, input length, and other content-derived semantic classifications. The completion timeline may retain only bounded operational facts required to prove that processing occurred and which privacy/runtime policy applied.

When a live provider is selected, the submitted content is still transmitted to that provider for inference. FCR does not claim that `process_without_saving` overrides or disables the provider's own retention/data-handling policy. Provider storage posture is surfaced in provenance.

`save_redacted_summary` writes only a bounded redacted summary to `friend_intake_summaries`. Raw transcript, related memory, embeddings, and provider payloads have no column in that table. Contact identifiers, credential-shaped values, common identity numbers, and labeled financial identifiers are removed or masked before summary persistence.

Successful completion persistence is atomic: the optional redacted summary and sanitized `project_events` completion receipt are committed in one database transaction. If that atomic completion write fails, the success receipt is withheld and the transaction rolls back instead of leaving a saved summary for a request reported as failed.

The founder-visible timeline uses `project_events` for sanitized operational metadata only.

Usefulness is stored in `friend_intake_feedback` only after FCR verifies that the referenced completed Friend run exists and belongs to the authenticated founder. It never contains the input or model output.

## Sensitive input

Credential-shaped values, private contact/identity/financial identifiers, legal, health/crisis, teen, and family-conflict signals are detected before live provider use. Those inputs stay local and return one protective or clarifying move.

## Truth

Model output is inference.

A successful Friend provider call does not prove:

- founder approval;
- external factual truth;
- an external provider write;
- publication;
- deployment;
- memory retrieval.

The provenance drawer states those boundaries directly.

## Runtime bounds

Live-provider requests preserve these fail-closed limits:

- explicit provider allowlist required;
- interactive founder session required for live inference;
- fixed structured-output schema;
- one-move contract;
- bounded output token request;
- request timeout remains active through response-body consumption;
- response bodies are byte-capped while streaming and cancelled when the cap is exceeded;
- no automatic fallback from one live provider to another.

## Feature flags

Public-safe non-secret Worker intent:

```text
FRIEND_MODELS_ENABLED=true
FRIEND_RUNTIME_PROVIDERS=openai,anthropic,perplexity
FRIEND_OPENAI_MODEL=gpt-5.6-luna
FRIEND_ANTHROPIC_MODEL=claude-sonnet-5
FRIEND_PERPLEXITY_MODEL=sonar
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

Repository code and CI can prove the adapters, privacy guards, schema validation, atomic persistence contract, authorization boundaries, streaming/timeout guards, and browser behavior. They cannot prove production provider credentials exist, that the Friend migration has been applied, that the candidate Worker is serving production traffic, or that a production provider call succeeds. Those require separate database, deployment, and live-runtime evidence after authorization.
