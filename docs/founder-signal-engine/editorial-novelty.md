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

This separation exists to prevent the portfolio from publishing the same thesis repeatedly under different repo names.

PromptOS does not publish. Chief does not publish. A novelty receipt does not publish. Founder Control Room remains the only approval membrane, and provider readback remains the only terminal external-publication evidence.

## Deterministic fingerprints

`src/lib/founderEditorialNovelty.ts` creates three SHA-256 identities for each founder-content proposal:

1. `promptOsPatternFingerprint`
   - canonical founder-machine lane;
   - normalized core thesis;
   - normalized opening hook.

2. `chiefAngleFingerprint`
   - canonical founder-machine lane;
   - exact evidence/event reference;
   - exact proof digest;
   - story type.

3. `storyFingerprint`
   - platform;
   - normalized core thesis;
   - normalized hook;
   - event reference;
   - proof digest;
   - PromptOS pattern fingerprint;
   - Chief angle fingerprint.

The fingerprints identify editorial state. They are continuity evidence only. They do not grant approval, scheduling, publication, merge, deploy, provider mutation, or any other authority.

## One founder-machine lane

For repetition comparison, these source repositories belong to one editorial lane:

- `jussray/promptos`
- `jussray/chief-ai-machine`
- `jussray/founder-control-room`

This means changing the repo name does not make a repeated thesis new.

Se'kret Bip and other products may supply the event or proof that makes a story materially different, but they do not receive independent copies of the same editorial thesis merely because the product name changed.

## History authority

LinkedIn novelty readback uses the already-existing `linkedin_experiments` record. No second memory table is introduced.

The gate reads only published/analyzed history fields needed for editorial comparison:

- `core_thesis`;
- `primary_hook`;
- `angle`;
- `meaningful_change`;
- hook/proof classification;
- project/date/status metadata.

The historical record remains observation/evaluation evidence. Analytics can influence which story Chief proposes next, but analytics never authorize publication.

## Novelty decision

The current thesis + hook are compared deterministically with recent published/analyzed history using normalized meaningful-token overlap.

Current thresholds:

- `HIGH`: exact pattern match or similarity >= `0.55` -> reject before approval persistence;
- `MEDIUM`: similarity >= `0.35` -> allow, but retain the closest-match continuity receipt;
- `LOW`: below `0.35` -> allow, while still retaining the comparison receipt.

A new commit, proof artifact, or event rotates the Chief angle fingerprint and final story fingerprint. That does **not** automatically prove editorial novelty. If the thesis/hook remains highly repetitive, the proposal is still rejected.

That rule is deliberate. New evidence is not a license to retell an old argument with a fresh SHA taped to it.

## Approval boundary

`issueFounderContentApproval()` validates the canonical Chief proposal first, then executes the editorial novelty gate before persisting FCR one-shot approval authority.

```text
verified product/repo event
-> Chief candidate proposal
-> PromptOS pattern fingerprint
-> FCR reads recent LinkedIn experiment history
-> FCR computes closest prior pattern + risk
-> HIGH risk: reject; Chief must select a materially different angle
-> LOW/MEDIUM: continue
-> authenticated founder exact-copy confirmation
-> FCR one-shot approval
-> provider route
-> provider-native readback
```

The novelty check is therefore load-bearing for LinkedIn approval issuance, not an optional suggestion after approval.

Non-LinkedIn proposals currently receive a `NOT_APPLICABLE` LinkedIn-history state. That does not claim cross-platform novelty coverage.

## Continuity cookie

Every novelty evaluation produces a deterministic non-authorizing `continuityCookie` over:

- story fingerprint;
- PromptOS pattern fingerprint;
- Chief angle fingerprint;
- closest historical match identity;
- rounded similarity;
- repetition risk;
- compared history count.

If any of those values changes, the cookie changes. The cookie can be used to reconcile repeated editorial evaluations, but it cannot manufacture approval or publication authority.

## Red-team invariants

The system must preserve all of these:

- repo rotation does not reset repetition history;
- a new event/proof does not automatically excuse a repeated thesis;
- high-repetition proposals are rejected before approval persistence;
- a novelty pass is not founder approval;
- analytics/history is evidence, not authority;
- PromptOS grammar is not provider authority;
- Chief proposals remain proposal-only;
- FCR approval remains exact-copy, founder-authenticated, one-shot authority;
- provider acceptance is not publication truth;
- provider-native readback remains terminal external-state evidence.

## Verification

Focused tests:

```bash
npx vitest run src/lib/__tests__/founderEditorialNovelty.test.ts \
  src/lib/__tests__/founderContentApprovalStore.novelty.test.ts
```

The exact PR head must still pass the repository's normal typecheck, lint, unit, Documentation Truth, CodeQL, and applicable Playwright/control-room gates before this source contract can be considered merge-ready.
