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

Live providers are `openai`, `anthropic`, and `perplexity`. They are server-side only and fail closed unless `FRIEND_MODELS_ENABLED=true`, the provider is in `FRIEND_RUNTIME_PROVIDERS`, and its credential is available.

Perplexity Friend requests explicitly disable web search. Friend Intake does not retrieve related memories.

## Privacy

`process_without_saving` persists no founder content.

`save_redacted_summary` writes only a bounded redacted summary to `friend_intake_summaries`. Raw transcript, related memory, embeddings, and provider payloads have no column in that table.

The founder-visible timeline uses `project_events` for sanitized operational metadata only.

Usefulness is stored in `friend_intake_feedback` and never contains the input or model output.

## Sensitive input

Credential, legal, health, teen, and family-conflict signals are detected before live provider use. Those inputs stay local and return one protective or clarifying move.

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

## Feature flags

Public-safe non-secret Worker intent:

```text
FRIEND_MODELS_ENABLED=true
FRIEND_RUNTIME_PROVIDERS=openai,anthropic,perplexity
```

Server-held credentials:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
PERPLEXITY_API_KEY
```

Optional provider-specific model overrides:

```text
FRIEND_OPENAI_MODEL
FRIEND_ANTHROPIC_MODEL
FRIEND_PERPLEXITY_MODEL
FRIEND_MODEL_TIMEOUT_MS
```

Never place credential values in source or screenshots.

## Proof boundary

Repository code and CI can prove the adapters, privacy guards, schema validation, and browser behavior. They cannot prove production provider credentials exist or that a production provider call succeeds. That requires live runtime evidence after an authorized deploy.
