# Playground Meta Model API tracking

Playground is the working name for the Meta Model API / Muse Spark developer surface used by Se'kret Bip planning for direct model-response experiments.

Founder Control Room tracks this as an external dependency and evidence item only. It must not become a credential vault, prompt warehouse, model-output warehouse, or bypass around Se'kret Bip privacy boundaries.

## Boundary from Story Engine

- `Story Engine` tracks Facebook/Instagram social integration setup.
- `Playground` tracks Meta Model API / Muse Spark response API setup.

These are separate external surfaces with separate keys, separate risk models, and separate implementation gates.

## Allowed Control Room metadata

Control Room may record sanitized operational metadata such as:

- external surface name: `Playground`;
- provider/API family: Meta Model API;
- example endpoint family: responses API;
- example model label: `muse-spark-1.1`;
- setup phase/status;
- required review gates;
- evidence that a separate Se'kret Bip PR added documentation-only configuration;
- founder approval state for any future model integration work.

## Blocked data

Control Room must not store:

- `MODEL_API_KEY`;
- bearer tokens;
- raw prompts;
- raw model outputs;
- provider debug streams containing private data;
- teen journals;
- Bridge content;
- safety-scan content;
- parent/teen protected data;
- private account data;
- prompt or transcript payloads unless a future privacy review explicitly approves a reduced-data evidence model.

## Current status

- App/surface name: `Playground`.
- Product scope: Meta Model API / Muse Spark planning.
- Implementation status: not implemented.
- Production status: not verified.
- Allowed repository action: documentation-only setup note in `jussray/Sekret-Bip`.

## Required gate before future implementation

A future implementation PR must include:

1. explicit founder approval;
2. a provider boundary explaining why Playground / Muse Spark is used;
3. a reduced-data prompt/input policy;
4. server-only key storage and rotation notes;
5. fail-closed behavior for missing, invalid, exhausted, or rate-limited credentials;
6. logging rules that avoid raw prompts, private teen content, and full model outputs unless separately approved;
7. provider fallback behavior, if any;
8. Playwright, unit, or integration evidence for any user-visible model route;
9. exact-head verification evidence before merge;
10. a Control Room event or note that records README impact as required, not required, or deferred with reason.

## Red-team note

The safe first move is documentation and placeholder config only. Do not wire model calls, prompt routing, streaming UI, or provider fallback until the privacy boundary and evidence model are approved.
