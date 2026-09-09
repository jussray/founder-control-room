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

The canonical Worker source pins the Friend models to:

```text
FRIEND_OPENAI_MODEL=gpt-5.6-luna
FRIEND_ANTHROPIC_MODEL=claude-sonnet-5
FRIEND_PERPLEXITY_MODEL=sonar
```

Perplexity Friend requests explicitly disable web search. Friend Intake does not retrieve related memories.

## Privacy

`process_without_saving` persists no founder content.

`save_redacted_summary` writes only a bounded redacted summary to `friend_intake_summaries`. Raw transcript, related memory, embeddings, and provider payloads have no column in that table.

Successful completion persistence is atomic: the optional redacted summary and sanitized `project_events` completion receipt are committed in one database transaction. If that atomic completion write fails, the success receipt is withheld and the transaction rolls back instead of leaving a saved summary for a request reported as failed.

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

Repository code and CI can prove the adapters, privacy guards, schema validation, atomic persistence contract, and browser behavior. They cannot prove production provider credentials exist, that the Friend migration has been applied, that the candidate Worker is deployed, or that a production provider call succeeds. Those require separate database, deployment, and live-runtime evidence after authorization.
