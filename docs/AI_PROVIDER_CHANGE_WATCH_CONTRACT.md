# AI Provider Change Watch Contract

## Purpose and boundary

Founder Control Room is the portfolio's evidence and notification point for official ChatGPT/OpenAI, Claude/Anthropic, and Perplexity changes affecting research-to-build work. The project Worker source performs an hourly Exa search and writes deduplicated candidate receipts to FCR's existing event inbox. This is hourly polling, not a provider push feed, not guaranteed instant delivery, and not proof that every provider page was reachable. The separate ChatGPT automation is not connected to this project runtime.

Search results are candidate discovery, not verified account availability. The project code accepts only official provider-domain URLs, keeps each candidate marked `review_required`, leaves entitlement and cross-project impact unknown, and records search-based coverage as `PARTIAL`. It emails a review-only digest for newly deduplicated candidates and newly failed source searches; those messages are not claims of a verified provider change. A failed provider search produces a separate coverage-failure event; it is never treated as “no change.” No automatic Chief or SolContinuity handoff is claimed.

FCR reports verified public changes and the product-specific impact. It does not change provider plans, accounts, settings, permissions, repositories, files, or deployments. Chief may analyze a supplied event; SolContinuity may validate its freshness and continuity; PromptOS owns its reusable research prompt. These are optional peer handoffs and do not grant authority or make one product dependent on another.

## Event receipt

For each newly verified material change, emit one `juss.ai-provider-change@v1` receipt with:

- `event_fingerprint`: lowercase SHA-256 of canonical JSON containing provider, category, canonical `source_url`, `published_at`, normalized headline, availability, and normalized change summary. Repeated observations of the same change retain the fingerprint.
- `provider`: `openai`, `anthropic`, or `perplexity`.
- `category`: `coding`, `computer_use`, `integrations`, `authorized_actions`, `pricing`, `plans`, or `limits`.
- `headline`, `change_summary`, `previous_state`, and `new_state`: distinguish the confirmed delta from unknown account-specific availability.
- `availability`: `GA`, `PREVIEW`, `BETA`, `PLAN_GATED`, `REGION_GATED`, `DEVICE_GATED`, `API_BILLED`, or `UNKNOWN`.
- `source_url`, `evidence_urls`, `published_at`, `effective_at`, and `observed_at`: use direct official sources and preserve missing dates as unknown.
- `source_coverage`: `COMPLETE`, `PARTIAL`, or `FAILED`; a fetch failure must never be reported as “no change.”
- `project_impacts`: object with string values for `fcr`, `chief`, `solcontinuity`, and `promptos`; each value is an evidence-bounded impact or an explicit `UNKNOWN`.
- `safe_test`: exactly one reversible, read-only test.

Only alert on a newly verified material delta or a newly material source-coverage failure. Suppress duplicate fingerprints and routine releases. Do not imply that a provider feature is included in Ray's account unless account entitlement was independently verified; this watch does not inspect or change account settings.

## Official source entry points

- OpenAI product releases and ChatGPT release notes: `https://openai.com/news/product-releases/`, `https://help.openai.com/en/articles/6825453-chatgpt-release-notes`
- Anthropic newsroom and pricing: `https://www.anthropic.com/news`, `https://www.anthropic.com/pricing`
- Perplexity changelog and pricing: use the current official `perplexity.ai/changelog` and `perplexity.ai/pro` pages. Confirm current URLs and dates on the provider domain before relying on an item.

## Handoff rules

A report can include the receipt for a human or another peer to review. Do not claim automatic delivery into Chief or SolContinuity until a deployed, authenticated integration and readback prove that path. Do not treat a PromptOS prompt as a source of provider facts; it structures research against official sources.
