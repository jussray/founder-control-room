# Social Campaign Policy v1

Status: `MODULE_SCOPE_CLASSIFICATION_ONLY`

Authoritative code:

- `src/lib/socialCampaignPolicy.ts`
- `src/lib/__tests__/socialCampaignPolicy.test.ts`
- `config/social-campaign-repositories.json`

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

## Next gate

Any **new or expanded** provider, data-source, generation, scheduling, or publication authority remains separately approval-gated. Existing capabilities must be evaluated through their own current contracts and receipts. This document is authoritative only for repository content classification and shaping; it must not be used as present-state evidence for the capabilities of Founder Control Room as a whole.
