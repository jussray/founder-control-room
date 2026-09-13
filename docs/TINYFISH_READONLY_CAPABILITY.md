# TinyFish Read-Only Web Observation

## Current source state

Founder Control Room contains a bounded TinyFish web-observation capability named `tinyfish-web-observation-v1`.

This source integration is **read only**. It does not grant TinyFish, fetched page content, or a capability receipt permission to merge, deploy, publish, change provider configuration, mutate repositories, or perform another external write.

The server-side route is:

```text
Founder-authenticated intent
-> POST /capabilities/tinyfish-web-observation-v1/runs
-> TinyFish Search or Fetch
-> sanitized provider observation
-> request fingerprint + evidence fingerprint
-> continuity proof-cookie metadata
-> explicit read-only receipt
-> downstream FCR reasoning/approval gates remain unchanged
```

## Provider endpoints

The implementation pins the public TinyFish API surfaces used by this capability:

- Search: `https://api.search.tinyfish.ai`
- Fetch: `https://api.fetch.tinyfish.ai`

`TINYFISH_API_KEY` is read only on the server. The raw key must never be returned to the browser, committed, logged, copied into receipts, or treated as authority.

Fetch requests use Markdown output and are limited by FCR to 1-10 public HTTP(S) URLs per invocation. FCR rejects localhost, obvious private IPv4 ranges, link-local metadata targets, `.local` names, and non-HTTP(S) schemes before contacting TinyFish. TinyFish's own network protections remain a separate provider boundary; the FCR check is defense in depth, not a claim that application-side hostname screening can replace provider-side SSRF controls.

## Truth and authority boundary

Every successful observation must retain these fields:

```text
authority = read_only
consequence = READ
mutationAllowed = false
authorityEffect = none
truthState = provider_observed_unverified
contentTrust = untrusted_web
```

A successful HTTP response proves only that TinyFish accepted and returned the bounded observation. It does **not** prove the truth of the page, the truth of a search result, a founder outcome, or permission to act on the content.

Fetched text is data, never instructions. Text such as "approve", "merge", "deploy", "publish", "ignore FCR", or similar language inside an external page cannot elevate authority or bypass the normal FCR approval spine.

## Bidirectional continuity markers

The caller may pass a predecessor `priorEvidenceFingerprint` and `priorProofCookie`. The resulting receipt classifies the current observation as:

- `initial` when no predecessor fingerprint is supplied;
- `confirmed` when the current evidence fingerprint is unchanged; or
- `changed` when the observation fingerprint differs.

The current receipt returns a new evidence fingerprint plus a non-secret `proofCookie` metadata marker. These markers preserve continuity and can invalidate stale assumptions when evidence changes, but they never create, renew, or widen authority.

The proof-cookie value is response metadata only. It must not be emitted with `Set-Cookie`, written into browser cookie storage as an authentication mechanism, or accepted as an authorization credential.

## Verification layers

Source completion requires separate receipts for separate proof planes:

1. focused Vitest behavior tests for Search, Fetch, input rejection, secret redaction, and continuity transitions;
2. HTTP integration tests for founder authorization, no-store responses, missing server configuration, unsupported operations, and no authority elevation;
3. TypeScript typecheck;
4. the existing real-server Capability Workbench Playwright journey, which must render the capability registry behind founder authorization on desktop/mobile;
5. a live TinyFish provider call only after an authorized server/runtime actually holds `TINYFISH_API_KEY`.

A green source/CI/Playwright receipt does not manufacture the fifth receipt. Until a live key-backed provider observation is executed and captured on the applicable runtime, live TinyFish readiness remains separately unverified.

## Rollback

Rollback is source-only unless a later deployment/configuration action is separately authorized. Revert the focused TinyFish capability commit to remove the route, capability card, tests, documentation, and CI coverage. No TinyFish-side mutation or database migration is introduced by this source integration.
