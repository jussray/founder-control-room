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

Founder-attested LinkedIn publications can contribute to this same pattern memory through a bounded non-authorizing observation contract. Provider-readback-verified direct LinkedIn publications also contribute after FCR has durable execution truth. Neither path stores raw thesis or hook text for fingerprint-only memory.

Changing the repo or product name does not make a repeated thesis new.

## History authority

LinkedIn novelty readback uses three evidence sources:

1. `linkedin_experiments`
   - only `published` / `analyzed` rows;
   - thesis, hook, angle, meaningful-change and classification fields used for semantic comparison.

2. founder-attested `provider_observations`
   - only LinkedIn `founder_content_post` observations whose publication state is `USER_ATTESTED`;
   - only rows carrying `editorialMemory.state = USER_ATTESTED_PATTERN` and a valid server-derived PromptOS pattern fingerprint;
   - no raw thesis or opening-hook text is persisted for this memory path;
   - the observation remains user-attested evidence and never becomes provider verification or publication authority.

3. provider-readback-verified direct publication executions
   - only `approval_executions` for action `publish_founder_content` that are `succeeded` with `success = true`;
   - the stored result must retain the direct-publication contract, `truthState = PUBLISHED`, `published = true`, LinkedIn platform identity, a provider post id/permalink, and a valid publication timestamp;
   - the approval id is joined to `founder_content_approval_editorial_pattern_history`, an immutable fingerprint-only mapping captured from the serialized approval-pattern reservation transaction;
   - raw thesis, hook, or post copy is not reconstructed or persisted by this history lane;
   - an execution without its immutable approval-pattern binding is not accepted as editorial memory.

Manual observation input supplies `coreThesis` and `openingHook` transiently. FCR derives the same PromptOS fingerprint used by the proposal novelty gate and persists only that fingerprint. `contentHash`, when supplied, remains separate attestation evidence and is not treated as proof that FCR verified public copy.

### Provider-readback publication boundary

The direct LinkedIn adapter does not call a successful POST publication truth. After LinkedIn accepts the write, FCR performs provider-native readback and verifies the exact post id, author, copy, `PUBLISHED` lifecycle, `PUBLIC` visibility, and publication timestamp. Only that verified receipt can produce the succeeded direct-publication execution consumed by novelty memory.

`founder_content_active_editorial_pattern_reservations` remains an active authority lease and may move after expiry. It is therefore not used as historical publication memory. Migration `20260905032000_founder_content_approval_editorial_pattern_history.sql` copies each approval-pattern binding into immutable history inside the same serialized issuance transaction. Conflicting reuse of an approval id fails closed.

### Explicit exclusion: schedule receipts

`approval_executions.status = succeeded` by itself is **not publication history**. The n8n/Buffer lane can succeed with only an accepted/scheduled provider request whose receipt still says:

```text
truthState = provider_schedule_receipt_pending_readback
published = false
requiresProviderReadback = true
```

The novelty reader may inspect the execution ledger, but it accepts only the exact direct-publish action and verified publication-result shape above. Schedule executions, provider failures, UNKNOWN outcomes, and missing approval-pattern mappings are excluded.

## Novelty decision

The current thesis + hook are compared deterministically with recent history using two independent signals:

1. portfolio-wide exact PromptOS thesis+hook pattern identity across **all** scanned history, including founder-attested and provider-readback-verified fingerprint memory;
2. normalized meaningful-token similarity across experiment records, used to rank the closest semantic prior.

Current thresholds:

- `HIGH`: any exact portfolio pattern match or similarity >= `0.55` -> reject before approval persistence;
- `MEDIUM`: similarity >= `0.35` -> allow, but retain the closest-match continuity receipt;
- `LOW`: below `0.35` -> allow, while still retaining the comparison receipt.

Exact-pattern detection scans the whole bounded history window independently of similarity ranking. A fingerprint-only publication record can therefore block reuse even though no raw thesis/hook text is stored and semantic similarity for that row is zero.

A new commit, proof artifact, or event rotates the Chief angle fingerprint and final story fingerprint. That does **not** automatically prove editorial novelty. If the thesis/hook remains highly repetitive, the proposal is still rejected.

New evidence is not a license to retell an old argument with a fresh SHA taped to it.

## Approval boundary

`issueFounderContentApproval()` validates the canonical Chief proposal first, then executes the editorial novelty gate before persisting FCR one-shot approval authority.

```text
verified product/repo event
-> Chief candidate proposal
-> portfolio-wide PromptOS pattern fingerprint
-> FCR reads experiment + founder-attested + verified direct-publication pattern history
-> FCR scans exact patterns + computes closest semantic prior
-> HIGH risk: reject; Chief must select a materially different angle
-> LOW/MEDIUM: continue
-> authenticated founder exact-copy confirmation
-> FCR one-shot approval + immutable approval-pattern binding
-> provider route
-> schedule receipt: still pending publication readback
   OR direct LinkedIn write + provider-native publication readback
-> verified direct publication execution becomes fingerprint-only novelty history
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
- provider-readback-verified direct publication remains novelty memory after its active approval lease expires or moves;
- raw transient thesis/hook text is not persisted in fingerprint-only publication memory;
- a schedule receipt never becomes publication memory merely because an execution row is `succeeded`;
- FAILED or UNKNOWN direct-provider outcomes never become publication memory;
- an unmapped approval execution cannot invent an editorial pattern;
- a new event/proof does not automatically excuse a repeated thesis;
- high-repetition proposals are rejected before approval persistence;
- a novelty pass is not founder approval;
- analytics/history is evidence, not authority;
- PromptOS grammar is not provider authority;
- Chief proposals remain proposal-only;
- FCR approval remains exact-copy, founder-authenticated, one-shot authority.

## Pre-draft fingerprint gate

`src/lib/founderContentFingerprintGate.ts` (`fcr/founder-content-fingerprint-gate@v1`) is a separate, earlier checkpoint from the novelty gate above. The live founder-authenticated preview surface is:

```text
POST /automation/conveyor/founder-content/pre-draft-fingerprint
```

It accepts only the candidate fields needed to evaluate the next story:

```text
project
platform
topic
differentiatedThesis
format
formatRationale
```

Caller-supplied `history` is forbidden. FCR owns the recent-history readback, so an untrusted caller cannot manufacture a `PASS` by submitting a hand-built evidence set. The endpoint is read-only and its packet always carries:

```text
authority.draft = false
authority.approve = false
authority.schedule = false
authority.publish = false
```

The intended pre-draft flow is:

```text
Chief candidate (project, platform, topic, differentiated thesis, format + rationale)
-> founder-authenticated FCR pre-draft preview
-> FCR reads bounded server-owned history
-> FCR rules out recently used angles/hooks/CTAs and recent formats
-> PASS: required history coverage proven, deliberate format + rationale present, thesis present, no exact recent angle reuse, no high-overlap angle
-> HOLD: any required coverage is missing, an exact normalized topic/angle was recently used, or similarity is too high
-> Chief may use PASS as non-authorizing evidence to begin drafting
```

The gate is fail-closed by design. `coverage.linkedin`, `coverage.otherSocial`, and `coverage.formatHistory` must all be proven. `formatHistory = false` is independently a `HOLD`, even if LinkedIn and other-social coverage are true. Exact normalized reuse of a recent `topic` or `angle` is also independently a `HOLD`; a differentiated thesis cannot dilute that exact reuse below the similarity threshold.

The current default `supabaseFounderContentFingerprintHistoryRepository` proves only LinkedIn history and derives format coverage from those rows. It does not yet prove cross-social history, so the default server-owned route is expected to return `HOLD` until a reconciled server-owned cross-social history adapter is added. That is a truthful blocked state, not a reason to accept caller-provided history.

This is a distinct fingerprint/contract from `promptOsPatternFingerprint`/`storyFingerprint` above. The pre-draft gate compares candidate thesis/topic/angle text directly, while the novelty gate compares deterministic SHA-256 identities against LinkedIn publication history at proposal-approval time. A `PASS` here never skips or substitutes for the novelty gate that still runs when the resulting proposal reaches `issueFounderContentApproval()`.

## Verification

Focused tests:

```bash
npx vitest run \
  src/lib/__tests__/founderEditorialNovelty.test.ts \
  src/lib/__tests__/founderEditorialNovelty.publicationMemory.test.ts \
  src/lib/__tests__/founderContentApprovalPatternHistory.contract.test.ts \
  src/lib/__tests__/founderContentApprovalStore.novelty.test.ts \
  src/lib/__tests__/founderContentFingerprintGate.test.ts \
  src/lib/__tests__/founderContentFingerprintGate.failClosed.test.ts \
  src/http/routes/__tests__/n8nConveyor.preDraftFingerprint.integration.test.ts \
  src/http/routes/__tests__/capabilities.founderContentObservation.integration.test.ts
```

The exact PR head must still pass the repository's normal typecheck, lint, unit, Documentation Truth, provider-owned CodeQL, and applicable Playwright/control-room gates before this source contract can be considered merge-ready.
