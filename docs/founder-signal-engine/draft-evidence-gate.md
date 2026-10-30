# Founder Signal Engine — offline Buffer draft evidence gate

**Scope:** read-only consistency check for a caller-provided evidence packet.
**Authority:** none. This gate cannot create a Buffer draft, read a provider, certify publication, approve a post, merge, deploy, or change a credential.

The active Founder Signal Engine milestone remains **Buffer Drafts**, not publishing. This checker supplements (never replaces) the existing content firewall, provider contract, live source/version gates, and signed authorization controls.

## Operation

Run the isolated regression checks:

```sh
npm run verify:fse-draft-evidence
```

Run against an independently collected evidence JSON document:

```sh
node scripts/founder-signal-draft-evidence-gate.mjs /path/to/evidence.json
```

Omitting the file or supplying missing/incorrect fields returns status `INCOMPLETE` and exit code 2.

A fully consistent packet returns `PACKET_CONSISTENT_UNVERIFIED`, **never** `VERIFIED`. This means only that the caller's statements are internally consistent: a forged receipt, screenshot, JSON, or stale provider ID could still pass. Do not use this status in production as publishing authority or as proof a live run succeeded.

The input contract is `fse/draft-evidence@v1`; the fields are illustrated in [the synthetic test fixture](../../scripts/founder-signal-draft-evidence-gate.test.mjs). Required evidence claims are:

1. Exact Control Room main SHA, founder-owned GitHub source commit and HTTPS proof URL.
2. GitHub event and correlated Zapier PR-trigger execution, with timestamp and run ID.
3. OpenAI 5W1H block, `review-only` or `publish-draft` decision, full generated draft, and SHA-256 copy fingerprint.
4. Buffer **draft-only** request including matching submitted text, channel/post IDs, and a native draft readback with identical text, channel ID, post ID, no schedule, and no published state.
5. HubSpot artifact and exact association to Founder Signal Engine deal `337185466050`.
6. Correlated Founder Control Room receipt referencing the same GitHub SHA, Zapier run, Buffer post, and text hash.
7. Valid source → Zap → Buffer/HubSpot → FCR chronological claims, with no future-dated observations.

No credentials, API keys, authorization tokens, user journals, or private customer data belong in these packets. The CLI only reads the operator-provided file and prints check states and generic reasons, not draft copy or raw content.

## What must be independently verified before LIVE status

- Inspect the matching GitHub webhook / Zapier history directly and verify source commit/run provenance.
- Independently inspect the OpenAI output and exact source-copy fingerprint.
- Obtain Buffer-native account/channel identity, draft post ID, exact saved copy, and current status from the intended authenticated account.
- Obtain associated HubSpot deal task/note from HubSpot itself.
- Obtain FCR's persisted receipt and separately prove deployed Pages and Worker identities.
- Correlate run/source/post/receipt IDs; ensure no queue, schedule, or publish side effect occurred.

The checker does not perform those reads. A browser snapshot, a manually assembled JSON packet, or a successful local test does not replace them.

## Current deployment blockers and boundaries

- The current source-side Buffer contract is `method: draft`, `saveToDraft: true`, `publishAllowed: false`. Historical 20-minute scheduling/Gmail-review documents are superseded for the active milestone.
- The deployment read performed October 26 found no `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL` binding name in the Cloudflare Worker settings returned at that time. This is a configuration finding, not evidence of an invoked or failed Zap. Installing provider-held credentials requires separately scoped approval and an authorized secure secret store.
- Do not change the n8n scheduling workflow artifact merely because it exists. Determine its actual current activation, authority, and relation to the draft-only route first.
- The Worker deployment and Pages production source identities must be independently matched before claiming end-to-end live parity.
- Cloudflare's classification of `CF_API_TOKEN` as a plain-text binding warrants separate security review; do not retrieve, echo, or migrate its value under this change.

## Acceptance and rollback

**Source acceptance:** Run `npm run verify:fse-draft-evidence` against the exact candidate commit; adversarial negative cases must stay red. The result supports only offline packet-checker behavior. The repository's existing Buffer tests and all required CI remain separately load-bearing.

**Live acceptance:** Authenticated provider readback proves an actual **draft** exists for the exact intended channel and source revision, with receipt correlation and no publish/schedule side effects.

**Rollback:** Revert this isolated verifier, its tests, documentation, and package script as one change. No provider records or secrets need deletion. Retain previous audit evidence.

**Owner:** Founder reviews the draft PR; production use, credentials, and activation require separate approvals.
