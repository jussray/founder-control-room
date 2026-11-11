# Social Campaign Policy v1

Status: `MODULE_SCOPE_CLASSIFICATION_ONLY`

Authoritative code:

- `src/lib/socialCampaignPolicy.ts`
- `src/lib/__tests__/socialCampaignPolicy.test.ts`
- `config/social-campaign-repositories.json`
- `src/lib/perplexityContentGenerator.ts` and `src/lib/__tests__/perplexityContentGenerator.test.ts` — the Perplexity generation step described in [Generation status](#generation-status) below.
- `src/lib/founderContentDuplicateAudit.ts` and `src/lib/__tests__/founderContentDuplicateAudit.test.ts` — the duplicate-post audit the generation step calls.
- `src/lib/mediaContentGenerator.ts` and `src/lib/__tests__/mediaContentGenerator.test.ts` — the OpenAI/Gemini/ElevenLabs image+video generation described in [Generation status](#generation-status).
- `src/worker/mediaAssetIngress.ts`, `src/worker/__tests__/mediaAssetIngress.test.ts`, and the `MEDIA_ASSETS` R2 binding in `wrangler.worker.toml` — where generated media is hosted.

## Portfolio coverage

The intake scope is dynamic `all_owned` for GitHub owner `jussray`. There is no fixed four-repository allowlist and no Sekret-Bip exclusion. Every repository event can create a sanitized proof signal, including work after a public launch. Privacy, visibility, sensitive-data, and proof-surface policy decide whether the signal becomes a public draft, a founder-review item, or a blocked item; they do not erase the underlying progress event.

Builds on, not alongside:

- `src/lib/firstPartySocialPublisher.ts` (`docs/founder-signal-engine/first-party-multichannel-publisher-v1.md`) — this module's output feeds `validateFirstPartySocialPost` directly. It reuses that module's platform list and per-platform `contentField`/character-limit capabilities rather than redefining them.
- `src/lib/founderSignalAutomationPolicy.ts` — a different, complementary layer. That module decides whether a *standing grant* authorizes auto-distribution for a repository/channel/recipient combination. This module decides how much a repository is *eligible* to generate at all (full campaign vs. a couple of ecosystem posts vs. nothing). Neither replaces the other.
- `config/repository-visibility-policy.json` — the existing, independently-maintained source of truth for repository visibility policy. Repository-specific visibility and sensitive-data decisions must be re-read from that policy when used as present-state evidence rather than copied forward from this document.

## Why this exists

A request came in for a full GitHub → Zapier → Perplexity → Buffer content-automation pipeline, to be implemented directly to `main`. Three things stopped that specific implementation at that time:

1. It duplicated `firstPartySocialPublisher.ts`'s domain model without its safety properties (`SECRETISH_PATTERN`, `PROMPT_LEAK_PATTERNS` — nothing in the original proposal filtered LLM output before it left the system).
2. It defaulted `jussray/Sekret-Bip` — then flagged for privatization in this repo's visibility policy — into a 14-day, 7-platform public campaign, protected only by asking the LLM nicely not to expose teen data in its prompt.
3. Perplexity and Buffer were new provider integrations in that proposal, which `CLAUDE.md` Approval Gates required to receive explicit founder authority rather than inheriting authority from an unrelated request.

This module was introduced as the safe classification layer from that request. Its own code path performs classification and shaping only. Provider calls, live content generation, orchestration, and publication capabilities that exist elsewhere in Founder Control Room are governed by their own authoritative code, approvals, runtime receipts, and temporal-truth checks.

## What this module does

`classifyRepositoryForContent()` takes verified repository evidence (exact head SHA, activity counts, visibility, archived state, and a policy record) and returns a deterministic eligibility verdict — never a partial "mostly eligible," always one of `not_eligible` / `ecosystem_only` / `sanitized_product_only` / `full_campaign` / `blocked_pending_output_safeguard`.

`buildFirstPartySocialPostInput()` takes that verdict plus already-generated draft text and shapes it into `FirstPartySocialPostInput`, always in `mode: 'draft'`, always with `publishAllowed: false` and `founderApprovalId: null`. This module cannot construct a queue- or publish-mode input under any input combination — that's enforced structurally, not by a caller's discipline.

The fact that `DraftMaterial` is caller-supplied is a boundary of `socialCampaignPolicy.ts`; it must not be generalized into a repository-wide claim that Founder Control Room has no live generation capability.

## The sensitive-data gate

`RepositoryContentPolicy.containsMinorOrSensitiveData` never permits an unrestricted campaign. It requires both a reviewed public proof URL and a non-empty `neverExpose` output denylist, then routes the repository to `sanitized_product_only`. Missing either safeguard keeps the repository observable but blocks public draft generation. A config author cannot set `full_campaign` and bypass the sanitized mode.

Repository-specific sanitized-path status must be read from `config/social-campaign-repositories.json` at the exact source version being evaluated. The output firewall still rejects prohibited claims, private data, prompt leakage, and secret-like material after generation.

### What the sanitized path still requires

1. **An output-side filter, not a prompt-side instruction.** `firstPartySocialPublisher.ts` rejects generated text by pattern-matching the actual output, after generation, before anything downstream sees it. The repository's `neverExpose` and `neverClaim` terms are checked across copy, proof links, and media alt text.
2. **A reviewed public proof surface.** The proof URL must be explicitly configured for the repository; a private GitHub URL is not treated as public proof.
3. **An explicit founder decision** for any further scope change, provider activation, or publication authority, recorded the way `docs/PORTABLE_FOUNDER_APPROVALS.md` describes — not inferred from silence or a prior unrelated approval.

## Module boundary — not repository-wide provider truth

- `socialCampaignPolicy.ts` does not itself perform Buffer, Zapier, Perplexity, or other provider network calls. That is a module boundary only; it is not evidence that Founder Control Room as a whole lacks those integrations.
- `socialCampaignPolicy.ts` does not itself generate live content. It accepts caller-supplied `DraftMaterial`; generation performed by an approved upstream or downstream system is governed separately.
- This module does not own ledger persistence, Supabase schema changes, HTTP routes, provider credentials, scheduling, publication execution, or provider receipts.
- Whether any provider integration, generation path, runtime, or publication lane is currently configured, enabled, healthy, or authorized is a temporal claim and must be revalidated from its authoritative code and provider/runtime evidence before reuse.

## Generation status

Juss approved a bounded build scope on 2026-11-11: Perplexity generation plus Buffer distribution, with every individual post still requiring his explicit per-post approval — no standing or auto-publish grant.

`src/lib/perplexityContentGenerator.ts` is the resulting generation step. `generatePerplexityDraftMaterial()`:

- calls `classifyRepositoryForContent()` first and refuses to call Perplexity at all when the repository is not eligible;
- requires both `PERPLEXITY_API_KEY` and a separate explicit `PERPLEXITY_CONTENT_GENERATION_ENABLED=true` opt-in, so a key provisioned for an unrelated capability (e.g. the operator-relay peer-review adapter in `operatorRelayModelProviders.ts`, which shares the same key name for a different purpose) can never silently enable spend here;
- builds its prompt only from verified `RepositoryEvidence` fields and the repository's own already-approved public proof URL — never from private data, and never trusting prompt-side instructions as a safety control, consistent with why this module exists (see "Why this exists" above);
- strictly parses the model's output as a fixed five-field JSON object and rejects anything else (extra fields, missing fields, non-JSON prose);
- instructs the model to write for customers, prospective partners, and investors together in the same post — not an investor-only pitch — so `audienceValue` explicitly addresses both a customer deciding whether to rely on the product and a partner evaluating whether to integrate or collaborate, while `investorSignal` keeps the shipping-cadence signal investors look for;
- audits the generated text against any `priorPosts` the caller supplies (`src/lib/founderContentDuplicateAudit.ts`, `auditForDuplicatePost()`) and refuses to return a draft that duplicates something already posted. The audit is pure/deterministic (normalized-text + shingle-containment comparison, no provider call) and excludes posts with `status: 'rejected'`, since those were never actually said publicly. It is caller-supplied history, not a database lookup from inside this module — consistent with this module's existing boundary of taking verified evidence as input rather than reaching into storage itself. Passing no `priorPosts` skips the audit rather than failing closed, since a caller with no history yet has nothing to duplicate;
- always finishes by calling the existing `buildFirstPartySocialPostInput()` on whatever Perplexity returned, so the pre-existing `neverClaim`/`neverExpose` output firewall still runs over generated text exactly as it does over any other caller-supplied draft. This function cannot return anything other than `mode: 'draft'`, `publishAllowed: false`, `founderApprovalId: null`.

This closes the generation gap, but does not create a generation→publish pipeline by itself: nothing currently calls `generatePerplexityDraftMaterial()` from an HTTP route, schedule, or automation trigger, and nothing currently supplies it real prior-post history from `founderContentLifecycleStore.ts` (the caller would fetch that and pass it in as `priorPosts`). Wiring that call site, binding its output to the founder's own per-post approval, and downstream dispatch all remain separate work.

Juss separately approved OpenAI, Google Gemini/Imagen + Veo, and ElevenLabs for image/video generation on 2026-11-11, and approved building both image and video now, including a known-rough-edge synchronous approach to video rather than waiting on proper async infrastructure.

`src/lib/mediaContentGenerator.ts` implements this: `generateOpenAiImage()`, `generateGeminiImage()`, `generateGeminiVideo()`, `generateElevenLabsImage()`, `generateElevenLabsVideo()`, and `uploadGeneratedMediaAsset()`. Each image/video function:

- requires both the relevant provider API key AND a model id env var (`FCR_OPENAI_IMAGE_MODEL`, `FCR_GEMINI_IMAGE_MODEL`, `FCR_GEMINI_VIDEO_MODEL`, `FCR_ELEVENLABS_IMAGE_MODEL`, `FCR_ELEVENLABS_VIDEO_MODEL`) with **no hardcoded default model id** — consistent with this repo's existing relay-provider convention (`operatorRelayModelProviders.ts`), since exact model identifiers move faster than source review and a wrong guess baked into code would be exactly the kind of invented provider configuration this repo's rules forbid;
- requires a separate explicit `FCR_MEDIA_GENERATION_ENABLED=true` opt-in before calling any provider, same reasoning as the Perplexity generator's own enable flag;
- returns a structured `{kind: 'SUCCESS' | 'FAILED' | 'CAPABILITY_UNAVAILABLE'}` result rather than throwing for ordinary provider/config conditions, so a caller can distinguish "not configured" from "the provider actually rejected this" from "it worked."

**Explicitly accepted rough edge, per founder instruction:** Gemini Veo and ElevenLabs video are asynchronous provider jobs that commonly take well over a minute; `generateGeminiVideo()`/`generateElevenLabsVideo()` poll for only a short bounded window (25s default, configurable only in tests) and fail cleanly with `GEMINI_VIDEO_POLL_TIMEOUT`/`ELEVENLABS_VIDEO_POLL_TIMEOUT` rather than hang. This is not production-grade video support — a real async job/polling architecture (Durable Object, Queue, or Workflow) was identified and deliberately deferred, not solved, in this pass. The exact Veo and ElevenLabs response field names used here are the least-verified part of this implementation (confirmed via web search against current docs, not from training-data memory, but still unverified against any live call since no credentials exist in this environment) — a mismatch fails closed as `FAILED`, never a false `SUCCESS`.

**Storage:** generated bytes are uploaded to a new R2 bucket (`[[r2_buckets]] binding = "MEDIA_ASSETS"` in `wrangler.worker.toml`, bucket name `founder-control-room-media-assets`) and served back at `GET /media-assets/:key` (`src/worker/mediaAssetIngress.ts`). The binding is optional in `ControlRoomWorkerEnv` on purpose: the bucket itself still needs to be created in Cloudflare out of band (declaring a binding in source does not provision live infrastructure), and the Worker must not fail startup, nor this route 500, before that happens — it 503s cleanly instead.

This module does not attempt to complete `mediaRouter.ts`/`mediaExecutionService.ts`'s much larger Phase 1 governance system (budget reservation, attack-flow evaluation, asset-registry promotion, `MediaExecutionReceiptV1`). It is a standalone path specific to social-post media, the same relationship `perplexityContentGenerator.ts` has to `operatorRelayModelProviders.ts`. Nothing yet calls `generateOpenAiImage()`/etc. from `generatePerplexityDraftMaterial()` or any HTTP route — wiring media into an actual draft's `media: SocialMediaAsset[]` remains separate work.

The Buffer side of the approved scope was already substantially built before this change: `automation/n8n/founder-content-buffer.workflow.json` calls Buffer's real GraphQL `createPost` mutation, but only in `mode: customScheduled` for LinkedIn/Facebook — it is schedule-only and explicitly forbids `shareNowAllowed`. It requires `fcrAuthorization.mode === 'exact-current-you'` with matching authorization/proposal/public-payload hashes, i.e. the founder's exact per-post approval, before n8n will call Buffer at all, and its receipt always reports `published: false, state: 'scheduled'` — never a terminal publish claim. `src/lib/n8nFounderContentOrchestrator.ts` and `src/lib/n8nProviderNeutralFounderContentOrchestrator.ts` build and dispatch that signed request, but — like this generator — they take already-approved `text` as caller-supplied input; neither one generates content or calls classification itself.

## Next gate

Any **new or expanded** provider, data-source, generation, scheduling, or publication authority beyond the bounded Perplexity-generation / Buffer-schedule-only scope above remains separately approval-gated. Existing capabilities must be evaluated through their own current contracts and receipts. This document is authoritative only for repository content classification, shaping, and the generation step described above; it must not be used as present-state evidence for the capabilities of Founder Control Room as a whole.
