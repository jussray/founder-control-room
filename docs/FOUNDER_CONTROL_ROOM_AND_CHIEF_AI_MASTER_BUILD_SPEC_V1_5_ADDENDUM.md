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

A successful model response is `model_inference`, not verified truth, founder approval, provider-write authority, or evidence that an external outcome occurred.

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
- bounded by timeout;
- no chained writes;
- no external-action authority;
- no memory retrieval;
- no automatic retry.

Perplexity Friend runtime must disable web search. Founder-private text must not become an external search query.

### 26.3 Sensitive-input local override

Sensitive detection happens before a live-provider call.

Categories:

- credentials
- legal
- health
- teen
- family conflict

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
- zero raw provenance payload.

`save_redacted_summary` means:

- raw input is still never persisted;
- no embeddings are created;
- only a bounded redacted summary may enter `friend_intake_summaries`;
- the table is service-role-only and RLS-protected.

`project_events` remains operational metadata only and must never store Friend transcript or summary text.

### 26.5 Usefulness telemetry

Each successful Friend run emits exactly one founder-visible `project_events` timeline receipt.

Usefulness feedback is stored separately in `friend_intake_feedback` with exactly one response per run:

- `yes`
- `not_really`
- `wrong_time`

Feedback storage contains no transcript, mirror text, move text, or provider payload.

### 26.6 Provenance

Every Friend result has one provenance ID.

The provenance drawer must disclose:

- source: deterministic or model inference;
- runtime provider;
- model identifier;
- prompt version;
- provider response ID when available;
- provider storage posture known to FCR;
- whether web search was used;
- what the result does not prove.

Every visible Mirror, tag set, move, privacy state, and timeline statement resolves to that receipt/provenance chain. Founder-edited tags are local founder edits and must not be relabeled as model output.

### 26.7 Runtime model state

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

The UI must never render a provider failure as a successful Friend result.

### 26.8 First-slice acceptance

The first slice is not shipped merely because provider adapters exist.

Required proof:

1. founder auth blocks unauthenticated access;
2. `relatedMemories` is rejected on Friend Intake;
3. `process_without_saving` causes no content persistence;
4. `save_redacted_summary` stores only bounded redacted summary content;
5. sensitive fixtures bypass live providers;
6. exactly one move is returned and rendered;
7. OpenAI, Anthropic, and Perplexity adapters produce schema-valid provider-neutral output when configured;
8. Perplexity requests have web search disabled;
9. timeline receipt contains sanitized metadata only;
10. usefulness is one-response-per-run;
11. desktop and mobile Playwright prove the actual Friend UI states;
12. Documentation Truth, focused tests, typecheck, lint, and exact-head CI pass.

Provider configuration capability does not prove production credentials are present. Source merge does not prove deployment. Deployment does not prove all three provider calls succeed. Those claims require their own runtime readback.
