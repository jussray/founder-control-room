# Social Campaign Policy v1

Status: `MODULE_SCOPE_CLASSIFICATION_ONLY`

Authoritative code:

- `src/lib/socialCampaignPolicy.ts`
- `src/lib/__tests__/socialCampaignPolicy.test.ts`
- `config/social-campaign-repositories.json`
- `src/lib/perplexityContentGenerator.ts` and `src/lib/__tests__/perplexityContentGenerator.test.ts` — the Perplexity generation step described in [Generation status](#generation-status) below.

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
- always finishes by calling the existing `buildFirstPartySocialPostInput()` on whatever Perplexity returned, so the pre-existing `neverClaim`/`neverExpose` output firewall still runs over generated text exactly as it does over any other caller-supplied draft. This function cannot return anything other than `mode: 'draft'`, `publishAllowed: false`, `founderApprovalId: null`.

This closes the generation gap, but does not create a generation→publish pipeline by itself: nothing currently calls `generatePerplexityDraftMaterial()` from an HTTP route, schedule, or automation trigger. Wiring that call site, and binding its output to the founder's own per-post approval and downstream dispatch, remains separate work.

The Buffer side of the approved scope was already substantially built before this change: `automation/n8n/founder-content-buffer.workflow.json` calls Buffer's real GraphQL `createPost` mutation, but only in `mode: customScheduled` for LinkedIn/Facebook — it is schedule-only and explicitly forbids `shareNowAllowed`. It requires `fcrAuthorization.mode === 'exact-current-you'` with matching authorization/proposal/public-payload hashes, i.e. the founder's exact per-post approval, before n8n will call Buffer at all, and its receipt always reports `published: false, state: 'scheduled'` — never a terminal publish claim. `src/lib/n8nFounderContentOrchestrator.ts` and `src/lib/n8nProviderNeutralFounderContentOrchestrator.ts` build and dispatch that signed request, but — like this generator — they take already-approved `text` as caller-supplied input; neither one generates content or calls classification itself.

## Next gate

Any **new or expanded** provider, data-source, generation, scheduling, or publication authority beyond the bounded Perplexity-generation / Buffer-schedule-only scope above remains separately approval-gated. Existing capabilities must be evaluated through their own current contracts and receipts. This document is authoritative only for repository content classification, shaping, and the generation step described above; it must not be used as present-state evidence for the capabilities of Founder Control Room as a whole.
