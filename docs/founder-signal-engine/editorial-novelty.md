# Founder editorial novelty

Status: source contract on the existing Founder Signal Engine lane.

Founder Control Room owns one editorial lane. PromptOS and Chief are inputs to that lane, not separate publishing brands.

## Roles

```text
PromptOS -> editorial pattern grammar
Chief -> candidate angle proposal
Founder Control Room -> history readback, novelty gate, approval authority
provider -> execution only after separate exact-copy authority
```

This separation exists to prevent the portfolio from publishing the same thesis repeatedly under different repo or product names.

PromptOS does not publish. Chief does not publish. A novelty receipt does not publish. Founder Control Room remains the only approval membrane. Provider schedule acceptance is not publication truth.

## Deterministic fingerprints

`src/lib/founderEditorialNovelty.ts` creates three SHA-256 identities for each founder-content proposal:

1. `promptOsPatternFingerprint`
   - one portfolio-wide `founder-editorial` pattern lane;
   - normalized core thesis;
   - normalized opening hook.

2. `chiefAngleFingerprint`
   - project-aware source lane;
   - exact evidence/event reference;
   - exact proof digest;
   - story type.

3. `storyFingerprint`
   - project-aware source lane;
   - platform;
   - normalized core thesis;
   - normalized hook;
   - event reference;
   - proof digest;
   - public-payload/copy identities;
   - PromptOS pattern fingerprint;
   - Chief angle fingerprint.

The separation is intentional: **pattern memory is portfolio-wide, while angle/story identity remains event- and project-aware.** A product name may explain why a story is different; it cannot erase the fact that the thesis and hook were already used.

The fingerprints identify editorial state. They are continuity evidence only. They do not grant approval, scheduling, publication, merge, deploy, provider mutation, or any other authority.

## One editorial lane

All founder LinkedIn experiment history participates in the same PromptOS thesis/hook pattern memory, including stories sourced from Founder Control Room, PromptOS, Chief, Se'kret Bip, or another portfolio product.

Founder-attested LinkedIn publications can also contribute to this same pattern memory, but only through a bounded non-authorizing observation contract.

Changing the repo or product name does not make a repeated thesis new.

## History authority

LinkedIn novelty readback uses two current evidence sources:

1. `linkedin_experiments`
   - only `published` / `analyzed` rows;
   - thesis, hook, angle, meaningful-change and classification fields used for semantic comparison.

2. founder-attested `provider_observations`
   - only LinkedIn `founder_content_post` observations whose publication state is `USER_ATTESTED`;
   - only rows carrying `editorialMemory.state = USER_ATTESTED_PATTERN` and a valid server-derived PromptOS pattern fingerprint;
   - no raw thesis or opening-hook text is persisted for this memory path;
   - the observation remains user-attested evidence and never becomes provider verification or publication authority.

Manual observation input supplies `coreThesis` and `openingHook` transiently. FCR derives the same PromptOS fingerprint used by the proposal novelty gate and persists only that fingerprint. `contentHash`, when supplied, remains separate attestation evidence and is not treated as proof that FCR verified public copy.

### Explicit exclusion: schedule receipts

`approval_executions.status = succeeded` is **not publication history** for the n8n/Buffer lane. A successful execution row can represent only an accepted/scheduled provider request whose receipt still says:

```text
truthState = provider_schedule_receipt_pending_readback
published = false
requiresProviderReadback = true
```

Therefore `approval_executions` is not queried by the novelty history reader. A future provider-readback lane may contribute publication memory only after it has its own explicit externally observed publication truth contract.

## Novelty decision

The current thesis + hook are compared deterministically with recent history using two independent signals:

1. portfolio-wide exact PromptOS thesis+hook pattern identity across **all** scanned history, including server-derived founder-attested pattern memory;
2. normalized meaningful-token similarity across experiment records, used to rank the closest semantic prior.

Current thresholds:

- `HIGH`: any exact portfolio pattern match or similarity >= `0.55` -> reject before approval persistence;
- `MEDIUM`: similarity >= `0.35` -> allow, but retain the closest-match continuity receipt;
- `LOW`: below `0.35` -> allow, while still retaining the comparison receipt.

Exact-pattern detection scans the whole bounded history window independently of similarity ranking. An attested pattern can therefore block reuse even though no raw thesis/hook text is stored and semantic similarity for that row is zero.

A new commit, proof artifact, or event rotates the Chief angle fingerprint and final story fingerprint. That does **not** automatically prove editorial novelty. If the thesis/hook remains highly repetitive, the proposal is still rejected.

New evidence is not a license to retell an old argument with a fresh SHA taped to it.

## Approval boundary

`issueFounderContentApproval()` validates the canonical Chief proposal first, then executes the editorial novelty gate before persisting FCR one-shot approval authority.

```text
verified product/repo event
-> Chief candidate proposal
-> portfolio-wide PromptOS pattern fingerprint
-> FCR reads experiment + bounded founder-attested pattern history
-> FCR scans exact patterns + computes closest semantic prior
-> HIGH risk: reject; Chief must select a materially different angle
-> LOW/MEDIUM: continue
-> authenticated founder exact-copy confirmation
-> FCR one-shot approval
-> provider route
-> provider schedule receipt (still pending readback)
-> externally observed publication truth, when available
```

The novelty check is load-bearing for LinkedIn approval issuance, not an optional suggestion after approval.

Non-LinkedIn proposals currently receive a `NOT_APPLICABLE` LinkedIn-history state. That does not claim cross-platform novelty coverage.

## Continuity cookie

Every novelty evaluation produces a deterministic non-authorizing `continuityCookie` over:

- story fingerprint;
- PromptOS pattern fingerprint;
- Chief angle fingerprint;
- closest historical match identity;
- rounded similarity;
- whether any exact pattern match exists;
- repetition risk;
- compared history count.

If any of those values changes, the cookie changes. The cookie can be used to reconcile repeated editorial evaluations, but it cannot manufacture approval or publication authority.

## Red-team invariants

The system must preserve all of these:

- repo or product rotation does not reset PromptOS repetition memory;
- exact-pattern detection scans all bounded history instead of only the similarity winner;
- founder-attested publication can block reuse without being relabeled provider-verified;
- raw transient thesis/hook text is not persisted in the manual observation memory path;
- a schedule receipt never becomes publication memory merely because an execution row is `succeeded`;
- a new event/proof does not automatically excuse a repeated thesis;
- high-repetition proposals are rejected before approval persistence;
- a novelty pass is not founder approval;
- analytics/history is evidence, not authority;
- PromptOS grammar is not provider authority;
- Chief proposals remain proposal-only;
- FCR approval remains exact-copy, founder-authenticated, one-shot authority.

## Verification

Focused tests:

```bash
npx vitest run \
  src/lib/__tests__/founderEditorialNovelty.test.ts \
  src/lib/__tests__/founderEditorialNovelty.publicationMemory.test.ts \
  src/lib/__tests__/founderContentApprovalStore.novelty.test.ts \
  src/http/routes/__tests__/capabilities.founderContentObservation.integration.test.ts
```

The exact PR head must still pass the repository's normal typecheck, lint, unit, Documentation Truth, CodeQL, and applicable Playwright/control-room gates before this source contract can be considered merge-ready.
