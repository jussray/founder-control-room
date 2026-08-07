# Social Campaign Policy v1

Status: `CLASSIFICATION_ONLY_NO_GENERATION_NO_PROVIDER_CALLS`

Authoritative code:

- `src/lib/socialCampaignPolicy.ts`
- `src/lib/__tests__/socialCampaignPolicy.test.ts`
- `config/social-campaign-repositories.json`

## Portfolio coverage

The intake scope is dynamic `all_owned` for GitHub owner `jussray`. There is no fixed four-repository allowlist and no Sekret-Bip exclusion. Every repository event can create a sanitized proof signal, including work after a public launch. Privacy, visibility, sensitive-data, and proof-surface policy decide whether the signal becomes a public draft, a founder-review item, or a blocked item; they do not erase the underlying progress event.

Builds on, not alongside:

- `src/lib/firstPartySocialPublisher.ts` (`docs/founder-signal-engine/first-party-multichannel-publisher-v1.md`) — this module's output feeds `validateFirstPartySocialPost` directly. It reuses that module's platform list and per-platform `contentField`/character-limit capabilities rather than redefining them.
- `src/lib/founderSignalAutomationPolicy.ts` — a different, complementary layer. That module decides whether a *standing grant* authorizes auto-distribution for a repository/channel/recipient combination. This module decides how much a repository is *eligible* to generate at all (full campaign vs. a couple of ecosystem posts vs. nothing). Neither replaces the other.
- `config/repository-visibility-policy.json` — the existing, independently-maintained source of truth for which repositories are mid-privatization. `jussray/Sekret-Bip` is listed there as `priority: critical`, `action: privatize_then_create_clean_showcase_export` — that's real evidence behind this doc's Sekret-Bip decision, not a judgment call invented here.

## Why this exists

A request came in for a full GitHub → Zapier → Perplexity → Buffer content-automation pipeline, to be implemented directly to `main`. Three things stopped that:

1. It duplicated `firstPartySocialPublisher.ts`'s domain model without its safety properties (`SECRETISH_PATTERN`, `PROMPT_LEAK_PATTERNS` — nothing in the original proposal filtered LLM output before it left the system).
2. It defaulted `jussray/Sekret-Bip` — a teen product, currently flagged for privatization in this repo's own visibility policy — into a 14-day, 7-platform public campaign, protected only by asking the LLM nicely not to expose teen data in its prompt.
3. Perplexity and Buffer are new provider integrations, which `CLAUDE.md` Approval Gates require explicit founder authority for, and "implement it to main" is not that authority.

This is the part of that request that's safe to build without any of those gates: pure classification logic, reusing the existing hardened publisher, no network calls, no secrets, no generation.

## What this module does

`classifyRepositoryForContent()` takes verified repository evidence (exact head SHA, activity counts, visibility, archived state, and a policy record) and returns a deterministic eligibility verdict — never a partial "mostly eligible," always one of `not_eligible` / `ecosystem_only` / `sanitized_product_only` / `full_campaign` / `blocked_pending_output_safeguard`.

`buildFirstPartySocialPostInput()` takes that verdict plus already-generated draft text (parameterized — this module doesn't generate anything) and shapes it into `FirstPartySocialPostInput`, always in `mode: 'draft'`, always with `publishAllowed: false` and `founderApprovalId: null`. It cannot construct a queue- or publish-mode input under any input combination — that's enforced structurally, not by a caller's discipline.

## The sensitive-data gate

`RepositoryContentPolicy.containsMinorOrSensitiveData` never permits an unrestricted campaign. It requires both a reviewed public proof URL and a non-empty `neverExpose` output denylist, then routes the repository to `sanitized_product_only`. Missing either safeguard keeps the repository observable but blocks public draft generation. A config author cannot set `full_campaign` and bypass the sanitized mode.

`jussray/Sekret-Bip` is configured for this sanitized path in `config/social-campaign-repositories.json` today. The output firewall still rejects prohibited claims, private data, prompt leakage, and secret-like material after generation.

### What the sanitized path still requires

1. **An output-side filter, not a prompt-side instruction.** `firstPartySocialPublisher.ts` rejects generated text by pattern-matching the actual output, after generation, before anything downstream sees it. The repository's `neverExpose` and `neverClaim` terms are checked across copy, proof links, and media alt text.
2. **A reviewed public proof surface.** The proof URL must be explicitly configured for the repository; a private GitHub URL is not treated as public proof.
3. **An explicit founder decision** for any further scope change, provider activation, or publication authority, recorded the way `docs/PORTABLE_FOUNDER_APPROVALS.md` describes — not inferred from silence or a prior unrelated approval.

## What this pass deliberately does not build

- No Perplexity, Buffer, or Zapier network calls, and no new secrets (`PERPLEXITY_API_KEY`, `BUFFER_API_KEY`, a Zapier shared secret) — all separately gated as new provider/data-source scope under `CLAUDE.md` Approval Gates.
- No ledger persistence, no new Supabase tables or migrations.
- No HTTP routes. `contentRouter`-equivalent wiring is a follow-up once the above are approved.
- No live content generation — `DraftMaterial` in `buildFirstPartySocialPostInput` is a caller-supplied parameter, not something this module produces.

## Next gate

A founder decision on provider scope (Perplexity, Buffer) and on the Sekret-Bip output-safeguard question above, before any route or network call is written. Until then, this module is available for `firstPartySocialPublisher.ts`-based drafting on already-eligible, non-sensitive repositories, entered by hand or by whatever caller is approved next.
