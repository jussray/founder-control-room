# Founder Control Room + Chief AI Master Build Spec v1.5 Addendum

**Status:** founder-approved Friend runtime-model amendment  
**Base:** `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`  
**Prior effective contract:** v1.4  
**Effective version:** **v1.5**  
**Authority date:** 2026-09-08

This addendum changes only the Friend Intake first-slice model boundary and the storage blocker discovered in Phase 0. All v1.4 truth, approval, memory-minimization, product-local privacy, public-claim, break-glass, cost, feature-flag, and evidence rules remain binding.

Repository/provider/runtime evidence still outranks prose.

```text
v1.2 base
+ v1.3 reconciliation
+ v1.4 ULTRATHINK Self-Attack implants
+ this v1.5 Friend runtime amendment
= effective master specification v1.5
```

---

## 26. Friend runtime-model amendment

### 26.1 Runtime models are allowed, authority is not

The first Friend slice may now use one explicitly selected runtime provider:

- `deterministic`
- `openai`
- `anthropic`
- `perplexity`

A successful model response is `model_inference`, not verified truth, founder approval beyond the exact Friend run, provider-write authority, provider billing proof, or evidence that an external outcome occurred.

The existing legacy `POST /mirror/run` remains a separate compatibility surface. The governed Friend path is:

```text
POST /mirror/friend-intake
```

No hidden provider fallback is permitted. If a requested live provider fails, the run must report the real failure state. Deterministic mode remains available as an explicit local option.

### 26.2 Provider runtime boundary

Live Friend providers are server-side adapters only. Provider credentials never enter the public client, repository source, logs, screenshots, timeline payloads, or provenance drawer.

Runtime activation is fail-closed:

```text
FRIEND_MODELS_ENABLED=true
FRIEND_RUNTIME_PROVIDERS=openai,anthropic,perplexity
```

Each provider still requires its own server-held credential. Missing configuration is `provider_unavailable`, not a silent fallback.

All Friend calls are:

- one model call maximum per intake;
- bounded by input and output limits;
- bounded by timeout through response-body consumption;
- byte-capped while streaming;
- no chained writes;
- no external-action authority;
- no memory retrieval;
- no automatic retry.

Perplexity Friend runtime must disable web search. Founder-private text must not become an external search query.

### 26.3 Sensitive-input local override

Sensitive detection happens before a live-provider call.

Categories/signals include:

- credentials and credential-shaped values;
- private contact, identity, and financial identifiers, including bare long card-like digit sequences;
- legal;
- health/crisis;
- teen;
- family conflict.

When detected:

```text
requested live provider
-> local deterministic protective policy
-> protective_move OR clarifying_question
-> model_execution_state = not_used
```

The sensitive input is not sent to OpenAI, Anthropic, Perplexity, or another external model.

### 26.4 Privacy choices

The server accepts exactly:

```text
process_without_saving
save_redacted_summary
```

`cancel` remains a client-side choice that produces no request.

`process_without_saving` means:

- zero raw-input persistence;
- zero summary persistence;
- zero embeddings;
- zero raw timeline content;
- zero raw provenance payload;
- zero persisted content-derived intent/sensitivity tags or input-length metadata.

`save_redacted_summary` means:

- raw input is still never persisted;
- no embeddings are created;
- the only founder-derived content stored is a bounded redacted summary;
- content-derived intent/sensitivity tags are not persisted beside it;
- non-content operational provenance such as provider/model/run identity may be stored;
- the table is service-role-only and RLS-protected.

`project_events` remains operational metadata only and must never store Friend transcript, summary text, intent tags, or sensitivity classifications.

Successful summary + completion persistence is atomic. If the atomic completion transaction fails after a provider call, Friend must not report success and must attempt a separate sanitized `friend_intake_failed` audit event so the external inference does not disappear from the audit plane.

### 26.5 One-shot live inference budget authority

An interactive founder browser session is necessary for paid inference but is not sufficient by itself.

Before any non-sensitive OpenAI, Anthropic, or Perplexity call, FCR must atomically reserve one bounded live-inference allowance in `friend_inference_reservations`.

The reservation must bind:

- exact Friend run ID;
- authenticated founder user ID;
- selected provider;
- per-run reserved budget;
- founder daily budget ceiling;
- short expiry.

Concurrent reservations for the same founder/day must serialize so parallel requests cannot oversubscribe the remaining budget. The reservation is immutable and is not released merely because the provider returns an error, because a failed provider response may still incur cost.

Canonical source intent currently declares:

```text
FRIEND_LIVE_REQUEST_BUDGET_USD=0.25
FRIEND_LIVE_DAILY_BUDGET_USD=1.00
```

These are FCR authorization ceilings. They are not provider invoice receipts and must not be rendered as verified billed cost.

Bearer automation remains ineligible for live inference. If the initial founder-auth pass refreshes and rotates an interactive browser session, that verified authentication channel must remain attached to the current request so a downstream Friend gate does not re-read a now-revoked cookie.

### 26.6 Usefulness telemetry

Each successful Friend run emits exactly one founder-visible `project_events` timeline receipt.

Usefulness feedback is stored separately in `friend_intake_feedback` with exactly one response per completed run owned by the authenticated founder:

- `yes`
- `not_really`
- `wrong_time`

Feedback storage contains no transcript, mirror text, move text, or provider payload.

### 26.7 Provenance

Every Friend result has one provenance ID.

The provenance drawer must disclose:

- source: deterministic or model inference;
- runtime provider;
- model identifier;
- prompt version;
- provider response ID when available;
- live inference reservation ID when applicable;
- provider storage posture known to FCR;
- whether web search was used;
- what the result does not prove.

Every visible Mirror, tag set, move, privacy state, and timeline statement resolves to that receipt/provenance chain. Founder-edited tags are local founder edits and must not be relabeled as model output or silently persisted as sensitive semantic metadata.

### 26.8 Runtime model state

`ModelExecutionState` adds `not_used`.

Truthful states:

```text
deterministic or sensitive local path -> not_used
successful live provider             -> succeeded
provider disabled                     -> blocked
provider unavailable                  -> provider_unavailable
timeout                               -> timed_out
invalid structured output             -> schema_invalid
budget stop                            -> budget_exceeded
```

The UI must never render a provider failure as a successful Friend result. Starting a new run must clear or explicitly stale the prior receipt before the new outcome is known.

### 26.9 First-slice acceptance

The first slice is not shipped merely because provider adapters exist.

Required proof:

1. founder auth blocks unauthenticated access;
2. `relatedMemories` is rejected on Friend Intake;
3. `process_without_saving` causes no founder-content or content-derived semantic persistence;
4. `save_redacted_summary` stores only redacted founder content plus bounded non-content operational provenance;
5. sensitive/private-identifier fixtures bypass live providers, including bare long card-like numbers;
6. non-sensitive live inference requires an interactive founder request;
7. every live provider call has an atomic one-shot budget reservation before execution;
8. daily budget exhaustion blocks provider execution;
9. exactly one move is returned and rendered;
10. OpenAI, Anthropic, and Perplexity adapters produce schema-valid provider-neutral output when configured;
11. Perplexity requests have web search disabled;
12. completion and failure receipts contain sanitized metadata only;
13. completion-persistence failure after inference produces a sanitized failure audit or an explicit audit-persistence failure;
14. usefulness is one-response-per-completed-founder-run;
15. malformed body shapes return bounded client errors rather than route exceptions;
16. a failed rerun cannot leave the prior Friend receipt visible as the current result;
17. desktop and mobile Playwright prove the actual Friend UI states;
18. Friend proof triggers include the route, runtime config, migration, navigation, and interactive-auth membrane;
19. Documentation Truth, focused tests, typecheck, lint, and exact-head CI pass.

Provider configuration capability does not prove production credentials are present. Source merge does not prove deployment. Deployment does not prove all three provider calls succeed. Budget reservation does not prove provider billing amount. Those claims require their own runtime/provider readback.
