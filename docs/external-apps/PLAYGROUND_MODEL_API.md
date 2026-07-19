# Playground Meta Model API tracking

Playground is the working name for the Meta Model API / Muse Spark developer surface used by Se'kret Bip planning for direct model-response experiments.

Founder Control Room tracks this as an external dependency and evidence item only. It must not become a credential vault, prompt warehouse, model-output warehouse, content warehouse, or bypass around Se'kret Bip privacy boundaries.

## Intended product purpose

The intended purpose is to evaluate whether Playground can help convert approved founder-owned book material into platform-ready creative drafts for TikTok, Instagram, and Facebook.

Allowed planning metadata may describe the creation workflow at a high level:

- book passage or chapter reference, without storing full copyrighted/private source text unless separately approved;
- content type, such as video script, caption, carousel, voiceover, hook set, or content calendar item;
- target platform, such as TikTok, Instagram, or Facebook;
- approval state, evidence state, and implementation gate.

Control Room should treat Playground as the content-creation/model surface only. Social publishing, account connection, webhooks, comments, and platform upload APIs require separate platform-specific setup and separate gates.

## Boundary from Story Engine and TikTok

- `Story Engine` tracks Facebook/Instagram social integration setup.
- `Playground` tracks Meta Model API / Muse Spark response API setup for generating drafts from approved source material.
- `TikTok` requires a separate developer/app API path for TikTok publishing or account connection.

These are separate external surfaces with separate keys, separate risk models, and separate implementation gates.

## Allowed Control Room metadata

Control Room may record sanitized operational metadata such as:

- external surface name: `Playground`;
- provider/API family: Meta Model API;
- example endpoint family: responses API;
- example model label: `muse-spark-1.1`;
- intended use: book-to-social content creation support;
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
- full book manuscripts or long source excerpts unless a separate content-rights and privacy review approves the exact retention boundary;
- provider debug streams containing private data;
- teen journals;
- Bridge content;
- safety-scan content;
- parent/teen protected data;
- private account data;
- prompt or transcript payloads unless a future privacy review explicitly approves a reduced-data evidence model.

## Current status

- App/surface name: `Playground`.
- Product scope: Meta Model API / Muse Spark planning for book-to-social creative drafts.
- Implementation status: not implemented.
- Production status: not verified.
- Allowed repository action: documentation-only setup note in `jussray/Sekret-Bip`.

## Required gate before future implementation

A future implementation PR must include:

1. explicit founder approval;
2. a provider boundary explaining why Playground / Muse Spark is used;
3. a book-source policy proving the material is founder-owned, licensed, public-domain, or otherwise approved for transformation;
4. a reduced-data prompt/input policy;
5. server-only key storage and rotation notes;
6. fail-closed behavior for missing, invalid, exhausted, or rate-limited credentials;
7. logging rules that avoid raw prompts, private teen content, full book source, and full model outputs unless separately approved;
8. platform handoff boundaries for TikTok, Instagram, and Facebook;
9. provider fallback behavior, if any;
10. Playwright, unit, or integration evidence for any user-visible model route;
11. exact-head verification evidence before merge;
12. a Control Room event or note that records README impact as required, not required, or deferred with reason.

## Red-team note

Playground can support the creative-generation layer for book-to-social workflows. It should not be treated as a publisher, scheduler, social account manager, credential store, or source-text archive. Do not wire model calls, prompt routing, streaming UI, social publishing, or provider fallback until the privacy, content-rights, and evidence models are approved.
